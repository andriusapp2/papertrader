// ── INDICATORS ──
// Volume histogram series (and future indicators).
// Depends on: lwChart (from chart.js), candles[] (from chart.js / feed.js)

// ── State ───────────────────────────────────────────────────────────
let volumeSeries   = null;   // ISeriesApi<'Histogram'>
let volumeVisible  = true;   // toggle state

// ── Initialise volume series ─────────────────────────────────────────
// Called by initChart() in chart.js after lwChart is created.
function initVolumeIndicator() {
  if (!lwChart || volumeSeries) return;

  volumeSeries = lwChart.addHistogramSeries({
    color:        '#26a69a',
    priceFormat:  { type: 'volume' },
    priceScaleId: 'vol',
  });
  lwChart.priceScale('vol').applyOptions({
    scaleMargins: { top: 0.82, bottom: 0 },
    visible:      false,
  });

  _applyVolToggleUI();
}

// ── Push volume data into the series ────────────────────────────────
// Called by applyCandles() in chart.js.
function setVolumeData(candles) {
  if (!volumeSeries) return;
  const volData = candles.map(c => ({
    time:  Math.floor(c.t / 1000),
    value: c.v,
    color: c.c >= c.o ? 'rgba(16,185,129,0.40)' : 'rgba(244,63,94,0.40)',
  }));
  volumeSeries.setData(volData);
}

// ── Live tick update ─────────────────────────────────────────────────
// Called by updateLiveTick() in chart.js.
function updateVolumeTick(last) {
  if (!volumeSeries) return;
  volumeSeries.update({
    time:  Math.floor(last.t / 1000),
    value: last.v,
    color: last.c >= last.o ? 'rgba(16,185,129,0.40)' : 'rgba(244,63,94,0.40)',
  });
}

// ── Toggle volume on / off ───────────────────────────────────────────
function toggleVolume() {
  volumeVisible = !volumeVisible;
  if (volumeSeries) {
    volumeSeries.applyOptions({ visible: volumeVisible });
  }
  _applyVolToggleUI();
}

function _applyVolToggleUI() {
  const btn = document.getElementById('volToggle');
  const dot = document.getElementById('volDot');
  if (!btn) return;
  if (volumeVisible) {
    btn.classList.remove('vol-off');
    btn.style.background    = 'rgba(38,166,154,0.15)';
    btn.style.borderColor   = 'rgba(38,166,154,0.45)';
    btn.style.color         = '#26a69a';
    btn.style.opacity       = '1';
    btn.title               = 'Hide Volume';
    if (dot) { dot.style.background = '#26a69a'; }
  } else {
    btn.classList.add('vol-off');
    btn.style.background    = 'rgba(255,255,255,0.04)';
    btn.style.borderColor   = 'rgba(255,255,255,0.10)';
    btn.style.color         = '#4a5568';
    btn.style.opacity       = '0.55';
    btn.title               = 'Show Volume';
    if (dot) { dot.style.background = '#4a5568'; }
  }
}