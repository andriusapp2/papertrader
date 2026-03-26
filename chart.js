// ── CHART — Lightweight Charts v4 ──
// Depends on: prices, S, PAIRS, fp() from main script
// Volume indicator : volume.js        (volumeSeries lives there)
// MA indicator     : movingaverage.js (ma*Series live there)
// LightweightCharts is loaded via CDN in Paper_Trader.html

let lwChart      = null;  // IChartApi
let candleSeries = null;  // ISeriesApi<'Candlestick'>
let priceLine    = null;  // IPriceLine on candleSeries

// Shared candles array — mutated by feed.js for live tick updates
let candles = [];

// ── INIT ────────────────────────────────────────────────────────────
function initChart() {
  const container = document.getElementById('cw');
  if (!container || lwChart) return;

  lwChart = LightweightCharts.createChart(container, {
    width:  container.clientWidth,
    height: container.clientHeight,
    layout: {
      background:  { type: 'solid', color: 'transparent' },
      textColor:   '#4a5568',
      fontFamily:  "'IBM Plex Mono', monospace",
      fontSize:    10,
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.03)' },
      horzLines: { color: 'rgba(255,255,255,0.04)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: 'rgba(255,255,255,0.15)',
        labelBackgroundColor: '#0a0e1c',
      },
      horzLine: {
        color: 'rgba(255,255,255,0.15)',
        labelBackgroundColor: '#0a0e1c',
      },
    },
    rightPriceScale: {
      borderColor:  'rgba(255,255,255,0.045)',
      textColor:    '#4a5568',
      scaleMargins: { top: 0.08, bottom: 0.22 },
    },
    timeScale: {
      borderColor:    'rgba(255,255,255,0.045)',
      timeVisible:    true,
      secondsVisible: false,
    },
    handleScroll: true,
    handleScale:  true,
  });

  // ── Candlestick series ──────────────────────────────────────────
  candleSeries = lwChart.addCandlestickSeries({
    upColor:         '#10b981',
    downColor:       '#f43f5e',
    borderUpColor:   '#10b981',
    borderDownColor: '#f43f5e',
    wickUpColor:     '#10b981',
    wickDownColor:   '#f43f5e',
    priceLineVisible: false,
  });

  // ── Indicators (own files) ──────────────────────────────────────
  initVolumeIndicator();
  initMAIndicator();

  // ── Resize observer ─────────────────────────────────────────────
  new ResizeObserver(() => {
    if (lwChart && container.clientWidth && container.clientHeight) {
      lwChart.resize(container.clientWidth, container.clientHeight);
    }
  }).observe(container);
}

// ── Push candles[] into the chart ───────────────────────────────────
function applyCandles() {
  if (!lwChart || !candles.length) return;

  const cdData = candles.map(c => ({
    time:  Math.floor(c.t / 1000),
    open:  c.o, high: c.h, low: c.l, close: c.c,
  }));

  candleSeries.setData(cdData);
  setVolumeData(candles);
  setMAData(candles);

  updatePriceLine();
  lwChart.timeScale().fitContent();
}

// ── Live tick (called from feed.js WebSocket onmessage) ─────────────
function updateLiveTick(sym) {
  if (!lwChart || !candleSeries || sym !== S.pair || !candles.length) return;
  const last = candles.at(-1);
  const t    = Math.floor(last.t / 1000);
  candleSeries.update({ time: t, open: last.o, high: last.h, low: last.l, close: last.c });
  updateVolumeTick(last);
  updatePriceLine();
}

// ── Dashed cyan price line at current market price ───────────────────
function updatePriceLine() {
  if (!candleSeries) return;
  const pr = prices[S.pair];
  if (!pr) return;
  if (priceLine) { try { candleSeries.removePriceLine(priceLine); } catch(_){} }
  priceLine = candleSeries.createPriceLine({
    price:            pr,
    color:            '#00d4ff',
    lineWidth:        1,
    lineStyle:        LightweightCharts.LineStyle.Dashed,
    axisLabelVisible: true,
    title:            '',
  });
}

// ── Public surface expected by feed.js / main script ────────────────

function drawChart() {
  if (!lwChart) initChart();
  applyCandles();
}

function genCandlesSim() {
  candles = [];
  let p = prices[S.pair];
  for (let i = 200; i >= 0; i--) {
    const o = p * (1 + (Math.random() - .5) * .018);
    const c = o * (1 + (Math.random() - .5) * .022);
    const h = Math.max(o, c) * (1 + Math.random() * .008);
    const l = Math.min(o, c) * (1 - Math.random() * .008);
    candles.push({ o, h, l, c, v: Math.random() * 800 + 100, t: Date.now() - i * 60000 });
    p = c;
  }
  drawChart();
}

function genCandles() {
  if (typeof loadKlines === 'function') {
    loadKlines(S.pair, currentTF);
  } else {
    genCandlesSim();
  }
}