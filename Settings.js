// ── SETTINGS PERSISTENCE ──
// Saves and restores all user preferences to localStorage.
// Keys used:
//   apex_favs          — already handled by main script (kept as-is)
//   apex_pair          — last selected pair
//   apex_tf            — last selected timeframe
//   apex_ma_lines      — MA line configs (period, color, type) — no series refs
//   apex_ma_visible    — MA toggle state
//   apex_vol_visible   — Volume toggle state
//   apex_stoch_visible — StochRSI toggle state
//   apex_stoch_cfg     — StochRSI params (rsiPeriod, stochPeriod, kSmooth, dSmooth, _kColor, _dColor)
//   apex_vol_cfg       — Volume config (upColor, downColor, opacity, paneHeight, maEnabled, maPeriod, maColor)

const SETTINGS_KEYS = {
  pair:         'apex_pair',
  tf:           'apex_tf',
  maLines:      'apex_ma_lines',
  maVisible:    'apex_ma_visible',
  volVisible:   'apex_vol_visible',
  stochVisible: 'apex_stoch_visible',
  stochCfg:     'apex_stoch_cfg',
  volCfg:       'apex_vol_cfg',
};

// ── Save helpers ──────────────────────────────────────────────────────
function saveSettings() {
  try {
    // Pair & TF
    localStorage.setItem(SETTINGS_KEYS.pair, S.pair);
    localStorage.setItem(SETTINGS_KEYS.tf,   currentTF);

    // MA lines — strip the non-serialisable `series` ref
    if (typeof maLines !== 'undefined') {
      const slim = maLines.map(({ id, period, color, type }) => ({ id, period, color, type }));
      localStorage.setItem(SETTINGS_KEYS.maLines, JSON.stringify(slim));
    }

    // Toggle states
    if (typeof maVisible    !== 'undefined') localStorage.setItem(SETTINGS_KEYS.maVisible,    JSON.stringify(maVisible));
    if (typeof volumeVisible !== 'undefined') localStorage.setItem(SETTINGS_KEYS.volVisible,   JSON.stringify(volumeVisible));
    if (typeof stochRsiVisible !== 'undefined') localStorage.setItem(SETTINGS_KEYS.stochVisible, JSON.stringify(stochRsiVisible));

    // StochRSI config
    if (typeof STOCH_RSI !== 'undefined') {
      localStorage.setItem(SETTINGS_KEYS.stochCfg, JSON.stringify(STOCH_RSI));
    }

    // Volume config
    if (typeof VOL_CFG !== 'undefined') {
      localStorage.setItem(SETTINGS_KEYS.volCfg, JSON.stringify(VOL_CFG));
    }
  } catch(e) {
    console.warn('saveSettings failed', e);
  }
}

// ── Load helpers ──────────────────────────────────────────────────────
function loadSettings() {
  try {
    // ── Pair ──────────────────────────────────────────────────────────
    const savedPair = localStorage.getItem(SETTINGS_KEYS.pair);
    if (savedPair) S.pair = savedPair;

    // ── Timeframe ─────────────────────────────────────────────────────
    const savedTF = localStorage.getItem(SETTINGS_KEYS.tf);
    if (savedTF) {
      currentTF = savedTF;
      // Sync the TF button UI
      document.querySelectorAll('.tfb').forEach(b => {
        b.classList.toggle('on', b.textContent.trim() === savedTF);
      });
    }

    // ── MA lines ──────────────────────────────────────────────────────
    const savedMA = localStorage.getItem(SETTINGS_KEYS.maLines);
    if (savedMA) {
      const parsed = JSON.parse(savedMA);
      if (Array.isArray(parsed) && parsed.length) {
        // Replace the default maLines array (series refs added by initMAIndicator later)
        maLines    = parsed.map(m => ({ id: m.id, period: m.period, color: m.color, type: m.type }));
        _maNextId  = Math.max(...maLines.map(m => m.id)) + 1;
      }
    }

    // ── MA visible ────────────────────────────────────────────────────
    const savedMAVis = localStorage.getItem(SETTINGS_KEYS.maVisible);
    if (savedMAVis !== null) maVisible = JSON.parse(savedMAVis);

    // ── Volume visible ────────────────────────────────────────────────
    const savedVolVis = localStorage.getItem(SETTINGS_KEYS.volVisible);
    if (savedVolVis !== null) volumeVisible = JSON.parse(savedVolVis);

    // ── StochRSI visible ──────────────────────────────────────────────
    // We don't auto-enable the panel here — toggleStochRSI() needs lwChart
    // to exist first. Instead we store the desired state and apply it after
    // the chart is initialised via _restoreStochRSIVisibility().
    const savedStochVis = localStorage.getItem(SETTINGS_KEYS.stochVisible);
    if (savedStochVis !== null) _pendingStochVisible = JSON.parse(savedStochVis);

    // ── StochRSI config ───────────────────────────────────────────────
    const savedStochCfg = localStorage.getItem(SETTINGS_KEYS.stochCfg);
    if (savedStochCfg) {
      const cfg = JSON.parse(savedStochCfg);
      Object.assign(STOCH_RSI, cfg);
      // Sync the settings panel inputs if they already exist in DOM
      _syncStochRSIInputs();
    }


    // ── Volume config ─────────────────────────────────────────────────
    const savedVolCfg = localStorage.getItem(SETTINGS_KEYS.volCfg);
    if (savedVolCfg && typeof VOL_CFG !== 'undefined') {
      Object.assign(VOL_CFG, JSON.parse(savedVolCfg));
    }

  } catch(e) {
    console.warn('loadSettings failed', e);
  }
}

// ── StochRSI deferred restore ─────────────────────────────────────────
// stochRsiVisible starts false; we need to toggle it on AFTER initChart().
let _pendingStochVisible = false;

function _restoreStochRSIVisibility() {
  if (_pendingStochVisible && typeof toggleStochRSI === 'function') {
    toggleStochRSI();   // turns it on; stochRsiVisible becomes true
  }
}

// ── Sync StochRSI settings panel inputs with current STOCH_RSI values ─
function _syncStochRSIInputs() {
  const fields = {
    'sr-rsiPeriod':   'rsiPeriod',
    'sr-stochPeriod': 'stochPeriod',
    'sr-kSmooth':     'kSmooth',
    'sr-dSmooth':     'dSmooth',
    'sr-kColor':      '_kColor',
    'sr-dColor':      '_dColor',
  };
  Object.entries(fields).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el && STOCH_RSI[key] !== undefined) el.value = STOCH_RSI[key];
  });
  // Update params badge
  const badge = document.getElementById('ind-stochrsi-params');
  if (badge) {
    badge.textContent = `${STOCH_RSI.rsiPeriod},${STOCH_RSI.stochPeriod},${STOCH_RSI.kSmooth},${STOCH_RSI.dSmooth}`;
  }
}

// ── Auto-save on any relevant change ─────────────────────────────────
// We wrap the key mutating functions to call saveSettings() after them.
// Done here so settings.js stays self-contained.

function _wrapFn(name, after) {
  if (typeof window[name] !== 'function') return;
  const orig = window[name];
  window[name] = function(...args) {
    const result = orig.apply(this, args);
    after();
    return result;
  };
}

function _initAutoSave() {
  // Save after any of these user actions:
  const savingFns = [
    'toggleMA', 'addMALine', 'removeMALine',
    'updateMAPeriod', 'updateMAColor', 'updateMAType',
    'toggleVolume',
    'toggleStochRSI', 'applyStochRSISettings', 'resetStochRSISettings',
    'applyVolumeSettings', 'resetVolumeSettings',
    'selPair',
  ];
  savingFns.forEach(fn => _wrapFn(fn, saveSettings));

  // Save TF changes via the existing setTF function
  const origSetTF = window.setTF;
  if (origSetTF) {
    window.setTF = function(el) {
      origSetTF.call(this, el);
      saveSettings();
    };
  }
}