// ── LIVE DATA FEED ──
// Binance public WebSocket + REST — no API key required
// Writes into: prices[], PAIRS[].ch, PAIRS[].vol, PAIRS[].high24, PAIRS[].low24

const BINANCE_WS   = 'wss://data-stream.binance.vision/stream';
const BINANCE_REST = 'https://data-api.binance.vision/api/v3';

const symToStream  = sym => sym.replace('/', '').toLowerCase() + '@miniTicker';
const symToBinance = sym => sym.replace('/', '');

let feedWs         = null;
let feedConnected  = false;
let reconnectTimer = null;

// ── WebSocket feed ──────────────────────────────────────────────────
function startFeed() {
  if (feedWs) { try { feedWs.close(); } catch(_){} }

  const streams = PAIRS.map(p => symToStream(p.sym)).join('/');
  feedWs = new WebSocket(`${BINANCE_WS}?streams=${streams}`);

  feedWs.onopen = () => {
    feedConnected = true;
    clearTimeout(reconnectTimer);
    setFeedStatus('live');
  };

  feedWs.onmessage = e => {
    const msg = JSON.parse(e.data);
    const d   = msg.data;
    if (!d || d.e !== '24hrMiniTicker') return;

    const sym  = d.s.replace('USDT', '/USDT');
    const pair = PAIRS.find(p => p.sym === sym);
    if (!pair) return;

    const now = parseFloat(d.c);
    prices[sym]  = now;
    pair.high24  = parseFloat(d.h);
    pair.low24   = parseFloat(d.l);
    pair.vol     = fmtVol(parseFloat(d.q));
    pair.ch      = ((now - parseFloat(d.o)) / parseFloat(d.o)) * 100;

    // Keep the last candle's close/high/low in sync with the live price
    if (sym === S.pair && candles.length) {
      const last = candles.at(-1);
      last.c = now;
      last.h = Math.max(last.h, now);
      last.l = Math.min(last.l, now);
      // Push the updated tick into the Lightweight Chart series
      updateLiveTick(sym);
    }
  };

  feedWs.onerror = () => setFeedStatus('error');

  feedWs.onclose = () => {
    feedConnected = false;
    setFeedStatus('reconnecting');
    reconnectTimer = setTimeout(startFeed, 3000);
  };

  // Binance disconnects after 24 h — reconnect at 23 h
  setTimeout(startFeed, 23 * 60 * 60 * 1000);
}

// ── REST kline history ──────────────────────────────────────────────
// Fetches the maximum possible history from Binance public API.
// Each request = 1000 candles. Pages are fetched backwards until
// Binance returns fewer than 1000 (i.e. we've hit the start of history).
//
// True Binance history limits (approximate, coin-dependent):
//   1m  → ~1000 pages ≈ 22 months   |  5m  → ~500 pages ≈ ~5 yr
//   15m → ~500 pages  ≈ ~14 yr      |  1h  → ~500 pages ≈ ~57 yr (capped by coin age)
//   4h  → ~500 pages  ≈ ~228 yr     |  1D  → ~500 pages ≈ full history
//
// MAX_PAGES caps requests per load to keep it snappy. Raise or remove
// the cap if you want truly unlimited depth (at cost of more requests).
//
const TF_MAP      = { '1m':'1m', '3m':'3m', '5m':'5m', '15m':'15m', '30m':'30m', '1h':'1h', '2h':'2h', '4h':'4h', '6h':'6h', '12h':'12h', '1D':'1d', '3D':'3d', '1W':'1w', '1M':'1M' };
const TF_MAX_PAGES = { '1m':20,  '3m':30,   '5m':50,   '15m':100,   '30m':150,   '1h':200,  '2h':300,  '4h':500,  '6h':500,  '12h':500,  '1D':500,  '3D':500,  '1W':500,  '1M':500  };

let currentTF  = '1m';
let klineAbort = null;  // AbortController — cancels in-flight fetches on pair/TF switch

async function loadKlines(sym, interval) {
  // Cancel any previous in-flight load immediately
  if (klineAbort) klineAbort.abort();
  klineAbort = new AbortController();
  const signal = klineAbort.signal;

  const binSym   = symToBinance(sym);
  const int      = TF_MAP[interval] || '1m';
  const maxPages = TF_MAX_PAGES[interval] || 20;
  const LIMIT    = 1000;

  try {
    let allCandles = [];
    let endTime    = undefined;  // walk backwards from now
    let page       = 0;

    // Draw the first page immediately so the chart feels responsive,
    // then keep fetching older pages in the background.
    while (page < maxPages) {
      const url = `${BINANCE_REST}/klines?symbol=${binSym}&interval=${int}&limit=${LIMIT}`
                + (endTime ? `&endTime=${endTime}` : '');

      const res  = await fetch(url, { signal });
      const data = await res.json();
      if (signal.aborted) return;
      if (!Array.isArray(data) || !data.length) break;

      const mapped = data.map(k => ({
        t: k[0],
        o: parseFloat(k[1]),
        h: parseFloat(k[2]),
        l: parseFloat(k[3]),
        c: parseFloat(k[4]),
        v: parseFloat(k[5]),
      }));

      // Prepend older page in front of what we have
      allCandles = [...mapped, ...allCandles];
      endTime    = data[0][0] - 1;
      page++;

      // Render after the very first page so the user sees data immediately
      if (page === 1) {
        _mergeAndDraw(sym, allCandles);
      }

      // Binance returned fewer than LIMIT → we've reached the start of history
      if (data.length < LIMIT) break;
    }

    if (signal.aborted) return;

    // Final render with complete dataset
    _mergeAndDraw(sym, allCandles);

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.warn('klines fetch failed, falling back to sim', err);
    genCandlesSim();
  }
}

// Deduplicate, sort, assign to candles[], update price, redraw
function _mergeAndDraw(sym, raw) {
  const seen = new Set();
  candles = raw
    .filter(c => { if (seen.has(c.t)) return false; seen.add(c.t); return true; })
    .sort((a, b) => a.t - b.t);
  if (candles.length) prices[sym] = candles.at(-1).c;
  drawChart();
}

// ── Volume formatter ────────────────────────────────────────────────
function fmtVol(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

// ── Feed status indicator ───────────────────────────────────────────
function setFeedStatus(state) {
  const dot = document.getElementById('feedDot');
  const lbl = document.getElementById('feedLbl');
  if (!dot) return;
  dot.className = 'feed-dot ' + state;
  const labels = { live: 'Live', error: 'Error', reconnecting: 'Connecting…' };
  if (lbl) lbl.textContent = labels[state] || state;
}

// ── Header updater ──────────────────────────────────────────────────
function updateHdr() {
  const p = PAIRS.find(x => x.sym === S.pair), pr = prices[S.pair];
  document.getElementById('hPrice').textContent = '$' + fp(pr);
  const ce = document.getElementById('hChg');
  ce.textContent = (p.ch >= 0 ? '+' : '') + p.ch.toFixed(2) + '%';
  ce.className = 'ptag ' + (p.ch >= 0 ? 'up' : 'dn');
  document.getElementById('s24h').textContent  = '$' + fp(p.high24 || pr * 1.026);
  document.getElementById('s24l').textContent  = '$' + fp(p.low24  || pr * 0.974);
  document.getElementById('sVol').textContent  = p.vol || '—';
  document.getElementById('sMark').textContent = '$' + fp(pr * 1.0001);
  document.getElementById('navBal').textContent = fu(S.bal);
  document.getElementById('avShow').textContent = 'Avail: ' + fu(S.bal);
  const sp  = S.bal - S.startBal;
  const spe = document.getElementById('sPnl');
  spe.textContent = (sp >= 0 ? '+' : '') + fu(sp);
  spe.style.color = sp >= 0 ? 'var(--green)' : sp < 0 ? 'var(--red)' : 'var(--t3)';
}