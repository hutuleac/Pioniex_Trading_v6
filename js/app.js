'use strict';

import { CFG, LEGENDS, getSettings, getGridCapital, setGridCapital } from './config.js';
import { calcGridPlan, calcGridVerdict, getTickerGridProfile } from './grid.js';
import { fetchPriceFunding, fetchMarketPulse } from './api.js';
import { getAdvancedMetrics, calcScore, calcRecommendation } from './indicators.js';
import { buildMarketPulseStrip,
         buildGridCards, buildGridSheet,
         buildDirectionCards, buildDirectionSheet } from './ui.js';

// ══════════════════════════════════════════════════════════════════
//  MODULE-LEVEL STATE
// ══════════════════════════════════════════════════════════════════
const DEFAULT_SYMBOLS = { BTC:"BTCUSDT", BNB:"BNBUSDT", SOL:"SOLUSDT", SUI:"SUIUSDT", TRX:"TRXUSDT", DOGE:"DOGEUSDT", XLM:"XLMUSDT", XRP:"XRPUSDT", HYPE:"HYPEUSDT" };
let SYMBOLS = (() => {
  try {
    const saved = localStorage.getItem('pioniex_symbols');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed;
    }
  } catch(e) {}
  return { ...DEFAULT_SYMBOLS };
})();
let symProvider  = {};   // name → 'Binance' | 'Bybit'
let allMetrics   = {};   // module-level: used by incremental add + grid re-render
let allScores    = {};
let allRecs      = {};
let refreshTimer = null, countdownTimer = null, nextRefresh = 0;
let isLoading    = false;

function saveSymbols() {
  localStorage.setItem('pioniex_symbols', JSON.stringify(SYMBOLS));
}

function renderTickerChips() {
  const container = document.getElementById('ticker-chips');
  if (!container) return;
  const canRemove = Object.keys(SYMBOLS).length > 1;
  container.innerHTML = Object.keys(SYMBOLS).map(name =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;padding:3px 8px;font-size:.75rem;font-family:'IBM Plex Mono',monospace;color:var(--text)">${name}${canRemove
      ? `<button onclick="window._removeTicker('${name}')" title="Remove ${name}" style="background:none;border:none;cursor:pointer;color:var(--dim);font-size:.85rem;padding:0 0 0 2px;line-height:1">×</button>`
      : ''}</span>`
  ).join('');
}

function removeTicker(name) {
  if (Object.keys(SYMBOLS).length <= 1) return;
  delete SYMBOLS[name];
  saveSymbols();
  renderTickerChips();
  triggerRefresh();
}

async function addTicker(name) {
  const clean = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (!clean) return { error: 'Invalid ticker name' };
  if (SYMBOLS[clean]) return { error: `${clean} is already in the list` };
  const symbol = clean + 'USDT';
  try {
    await fetchPriceFunding(clean, symbol);
    SYMBOLS[clean] = symbol;
    saveSymbols();
    renderTickerChips();
    addAndRenderTicker(clean, symbol); // fetch only the new ticker, no full reload
    return { ok: true, name: clean };
  } catch(e) {
    return { error: `${clean} not found on Binance or Bybit` };
  }
}

window._removeTicker = removeTicker;


// ══════════════════════════════════════════════════════════════════
//  STATUS + TIMER
// ══════════════════════════════════════════════════════════════════
function setStatus(state, text) {
  document.getElementById('status-dot').className = 'dot ' + state;
  document.getElementById('status-text').textContent = text;
}

function scheduleRefresh() {
  if (refreshTimer)   clearTimeout(refreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  nextRefresh = Date.now() + CFG.REFRESH_INTERVAL_SEC * 1000;
  refreshTimer = setTimeout(fetchAndDisplay, CFG.REFRESH_INTERVAL_SEC * 1000);
  countdownTimer = setInterval(() => {
    const s = Math.max(0, Math.round((nextRefresh - Date.now()) / 1000));
    document.getElementById('countdown').textContent =
      `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }, 1000);
}

function triggerRefresh() {
  if (refreshTimer)   clearTimeout(refreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  isLoading = false; // allow re-entry
  fetchAndDisplay();
}

// ── Per-ticker processing (shared by full refresh + incremental add) ──
// Grid plans depend on user settings, so they are derived (and re-derived when settings change).
function attachGrid(name, m) {
  const s = getSettings(), profile = getTickerGridProfile(name);
  m.gridPlans = {}; m.gridVerdicts = {};
  for (const mode of ['spot', 'futures']) {
    m.gridPlans[mode]    = calcGridPlan(m, profile, m.direction, { ...s, mode });
    m.gridVerdicts[mode] = calcGridVerdict(m, m.gridPlans[mode]);
  }
}

async function fetchSingleTicker(name, symbol) {
  const pf = await fetchPriceFunding(name, symbol);
  symProvider[name] = pf.provider;
  const m = await getAdvancedMetrics(name, symbol);
  const { score, direction, detail } = calcScore(
    pf.price, m.atr, m.rsi, m.flow, m.oiChange,
    m.poc5d, m.avwap5d, m.poc14d, m.avwap14d, m.avwap30d,
    m.cvd5d, m.cvd14d, m.cvd30d,
    m.structure4h, m.structure30d, m.sweep, m.fvgList,
    m.emaFast, m.emaSlow, m.dc20Pos, pf.funding, m.regime
  );
  const rec   = calcRecommendation(score, direction, m.atrPct ?? 0, pf.funding, m.rsi);
  const mFull = { ...m, price: pf.price, funding: pf.funding, direction };
  attachGrid(name, mFull);
  return { mFull, score, direction, detail, rec };
}

// ── Incremental add: fetch one new ticker and re-render cards ─────
async function addAndRenderTicker(name, symbol) {
  try {
    const { mFull, score, direction, detail, rec } = await fetchSingleTicker(name, symbol);

    allMetrics[name]  = mFull;
    allScores[name]   = { score, direction, detail };
    allRecs[name]     = rec;

    // Re-render both card sections
    const gridEl = document.getElementById('grid-cards');
    if (gridEl) gridEl.innerHTML = buildGridCards(allMetrics, symProvider, getSettings().mode);

    const dirEl = document.getElementById('direction-cards');
    if (dirEl) dirEl.innerHTML = buildDirectionCards(allMetrics, allScores, allRecs, symProvider);
  } catch(e) {
    console.error(`[${name}] addAndRenderTicker failed:`, e);
  }
}

// ══════════════════════════════════════════════════════════════════
//  MAIN REFRESH LOOP
// ══════════════════════════════════════════════════════════════════
async function fetchAndDisplay() {
  if (isLoading) return;
  isLoading = true;
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.disabled = true;
  setStatus('loading', 'Fetching…');

  // Show loading placeholder in card sections
  const gridElLoading = document.getElementById('grid-cards');
  if (gridElLoading) gridElLoading.innerHTML = Object.keys(SYMBOLS).map(n =>
    `<div class="asset-card"><span style="color:#555;font-size:.7rem;font-family:'IBM Plex Mono',monospace">${n} · Loading…</span></div>`
  ).join('');
  const dirElLoading = document.getElementById('direction-cards');
  if (dirElLoading) dirElLoading.innerHTML = Object.keys(SYMBOLS).map(n =>
    `<div class="asset-card"><span style="color:#555;font-size:.7rem;font-family:'IBM Plex Mono',monospace">${n} · Loading…</span></div>`
  ).join('');

  // Reset module-level state for full refresh
  Object.keys(allMetrics).forEach(k => delete allMetrics[k]);
  Object.keys(allScores).forEach(k  => delete allScores[k]);
  Object.keys(allRecs).forEach(k    => delete allRecs[k]);

  // ── Market Pulse (one-time global fetch, non-blocking) ─────────
  try {
    const pulse = await fetchMarketPulse(Object.values(SYMBOLS));
    const strip = document.getElementById('market-pulse-pills');
    if (strip) strip.innerHTML = buildMarketPulseStrip(pulse);
  } catch(e) {
    console.warn('[MarketPulse] fetch failed:', e.message);
  }

  for (const [name, symbol] of Object.entries(SYMBOLS)) {
    try {
      const { mFull, score, direction, detail, rec } = await fetchSingleTicker(name, symbol);
      allMetrics[name]  = mFull;
      allScores[name]   = { score, direction, detail };
      allRecs[name]     = rec;
    } catch(e) {
      console.error(`[${name}] FATAL:`, e);
      allMetrics[name] = null;
    }
  }

  // ── Render card sections ───────────────────────────────────────

  const gridEl = document.getElementById('grid-cards');
  if (gridEl) gridEl.innerHTML = buildGridCards(allMetrics, symProvider, getSettings().mode);

  const dirEl = document.getElementById('direction-cards');
  if (dirEl) dirEl.innerHTML = buildDirectionCards(allMetrics, allScores, allRecs, symProvider);

  // ── Status ─────────────────────────────────────────────────────
  const ok = Object.values(allMetrics).filter(Boolean).length;
  const lu = document.getElementById('last-update');
  if (lu) lu.textContent = `Updated: ${new Date().toLocaleTimeString('en-GB')}`;
  setStatus('live', `Live · ${ok}/${Object.keys(SYMBOLS).length} ok`);
  isLoading = false;
  if (refreshBtn) refreshBtn.disabled = false;
  scheduleRefresh();
}

// ══════════════════════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════════════════════
function showModal() {
  document.getElementById('modal-body').innerHTML = `
    <p><strong>Refresh interval:</strong> ${CFG.REFRESH_INTERVAL_SEC}s (${CFG.REFRESH_INTERVAL_SEC/60} min)</p>
    <p><strong>Score bot minimum:</strong> ${CFG.SCORE_ACTIVE}/10</p>
    <p><strong>RSI OB/OS:</strong> ${CFG.RSI_OB} / ${CFG.RSI_OS} (extreme: ${CFG.RSI_EXTREME_OB}/${CFG.RSI_EXTREME_OS})</p>
    <p><strong>Flow strong threshold:</strong> ±${CFG.FLOW_STRONG}%</p>
    <p><strong>OI squeeze high/med:</strong> >${CFG.OI_SQUEEZE_HIGH}% / >${CFG.OI_SQUEEZE_MED}%</p>
    <p><strong>API primary:</strong> Binance Futures (fapi.binance.com)</p>
    <p><strong>API fallback:</strong> Bybit V5 (api.bybit.com) — BuyVol estimated via Williams %R</p>
    <p style="margin-top:10px;font-size:.65rem;color:var(--dim)">All parameters match Trading.py. Bybit CVD uses price-action approximation when taker buy vol is unavailable.</p>
    <div style="margin-top:14px;border-top:1px solid var(--border2);padding-top:12px">
      <label style="display:block;font-size:.75rem;font-weight:600;margin-bottom:6px;color:var(--text)">Grid Bot Capital (USDT)</label>
      <div style="display:flex;align-items:center;gap:8px">
        <input id="grid-capital-input" type="number" min="50" max="100000" step="10"
          value="${getGridCapital()}"
          style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);padding:5px 8px;border-radius:4px;font-family:'IBM Plex Mono',monospace;font-size:.82rem;width:120px">
        <button id="btn-save-capital" class="btn primary" style="font-size:.75rem">Save</button>
        <span id="capital-saved-msg" style="font-size:.7rem;color:var(--green);display:none">Saved!</span>
      </div>
      <p style="font-size:.65rem;color:var(--dim);margin-top:4px">Default: $500. Used for capital/grid and drawdown calculations.</p>
    </div>
    <div style="margin-top:14px;border-top:1px solid var(--border2);padding-top:12px">
      <label style="display:block;font-size:.75rem;font-weight:600;margin-bottom:8px;color:var(--text)">Manage Tickers</label>
      <div id="ticker-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input id="ticker-add-input" type="text" maxlength="10" placeholder="e.g. DOT"
          style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);padding:5px 8px;border-radius:4px;font-family:'IBM Plex Mono',monospace;font-size:.82rem;width:90px;text-transform:uppercase">
        <button id="btn-add-ticker" class="btn primary" style="font-size:.75rem">+ Add</button>
        <span id="ticker-add-msg" style="font-size:.7rem;display:none"></span>
      </div>
      <p style="font-size:.65rem;color:var(--dim);margin-top:4px">Enter ticker name (e.g. DOT → DOTUSDT). Validated live against Binance/Bybit.</p>
    </div>`;
  document.getElementById('modal-overlay').classList.add('show');
  renderTickerChips();

  document.getElementById('btn-save-capital').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('grid-capital-input').value);
    if (!isNaN(val) && val >= 50) {
      setGridCapital(val);
      for (const [n, mm] of Object.entries(allMetrics)) if (mm) attachGrid(n, mm);
      const gEl = document.getElementById('grid-cards');
      if (gEl) gEl.innerHTML = buildGridCards(allMetrics, symProvider, getSettings().mode);
      const msg = document.getElementById('capital-saved-msg');
      if (msg) { msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2000); }
    }
  });

  async function handleAddTicker() {
    const input = document.getElementById('ticker-add-input');
    const btn   = document.getElementById('btn-add-ticker');
    const msg   = document.getElementById('ticker-add-msg');
    const val   = input.value.trim();
    if (!val) return;
    btn.disabled = true;
    btn.textContent = '…';
    msg.style.display = 'none';
    const result = await addTicker(val);
    btn.disabled = false;
    btn.textContent = '+ Add';
    msg.style.display = 'inline';
    if (result.ok) {
      msg.style.color = 'var(--green)';
      msg.textContent = `✓ ${result.name} added`;
      input.value = '';
    } else {
      msg.style.color = 'var(--red)';
      msg.textContent = `✗ ${result.error}`;
    }
  }
  document.getElementById('btn-add-ticker').addEventListener('click', handleAddTicker);
  document.getElementById('ticker-add-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddTicker();
  });
}
function hideModal() { document.getElementById('modal-overlay').classList.remove('show'); }


// ══════════════════════════════════════════════════════════════════
//  GLOSSARY TOGGLE
// ══════════════════════════════════════════════════════════════════
function toggleGlossary() {
  const grid = document.getElementById('legend-grid');
  const ci   = document.getElementById('glossary-ci');
  if (grid.style.display === 'none') {
    grid.style.display = 'grid';
    ci.textContent = '▼';
  } else {
    grid.style.display = 'none';
    ci.textContent = '▶';
  }
}

// ══════════════════════════════════════════════════════════════════
//  INIT  — wire up events, render legend, chips, then auto-start fetch
// ══════════════════════════════════════════════════════════════════

// Event listeners — replace all inline onclick handlers
document.getElementById('refresh-btn').addEventListener('click', triggerRefresh);
document.getElementById('btn-config').addEventListener('click', showModal);
document.getElementById('btn-glossary').addEventListener('click', toggleGlossary);
document.getElementById('btn-close-modal').addEventListener('click', hideModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) hideModal(); });

// ── Bottom sheet — card tap open ──────────────────────────────────
let _sheetOpenName = null, _sheetOpenType = null;
function closeSheet() {
  document.getElementById('bottom-sheet').classList.remove('open');
  document.getElementById('sheet-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  _sheetOpenName = null; _sheetOpenType = null;
}
document.addEventListener('click', e => {
  const card = e.target.closest('.asset-card[data-name]');
  if (!card) return;
  const name = card.dataset.name;
  const type = card.dataset.type;

  // Toggle: tap same card again to close
  const isOpen = document.getElementById('bottom-sheet').classList.contains('open');
  if (isOpen && _sheetOpenName === name && _sheetOpenType === type) { closeSheet(); return; }

  const m = allMetrics[name];
  if (!m) return;
  _sheetOpenName = name; _sheetOpenType = type;

  let html;
  if (type === 'grid') {
    html = buildGridSheet(name, m, symProvider[name] || '?');
    const v = m.gridVerdicts[getSettings().mode];
    document.getElementById('sheet-title-text').textContent = `${name} — Grid Bot`;
    document.getElementById('sheet-title-badge').innerHTML =
      `<span class="badge-sm ${v.verdict === 'GRID_NOW' ? 'green' : v.verdict === 'DEVELOPING' ? 'yellow' : 'red'}">${v.score.toFixed(1)} · ${v.verdict.replace('_', ' ')}</span>`;
  } else {
    const score     = allScores[name]?.score ?? 0;
    const direction = allScores[name]?.direction ?? null;
    const detail    = allScores[name]?.detail ?? [];
    const rec       = allRecs[name] ?? null;
    html = buildDirectionSheet(name, m, score, direction, detail, rec);
    document.getElementById('sheet-title-text').textContent = `${name} — Analysis`;
    document.getElementById('sheet-title-badge').innerHTML  = '';
  }

  document.getElementById('sheet-content').innerHTML = html;
  document.getElementById('bottom-sheet').classList.add('open');
  document.getElementById('sheet-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
});

document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);

// Collapsible sections
document.querySelectorAll('.collapsible-toggle').forEach(el => {
  el.addEventListener('click', () => {
    const target = document.getElementById(el.dataset.target);
    if (target) target.classList.toggle('hidden');
    el.classList.toggle('collapsed');
  });
});

// Render legend
document.getElementById('legend-grid').innerHTML = LEGENDS.map(([n,d]) =>
  `<div class="legend-item"><div class="legend-name">${n}</div><div class="legend-desc">${d}</div></div>`
).join('');

// Init header tooltips

// Version badge
document.getElementById('app-version').textContent = `v${CFG.APP_VERSION}`;

fetchAndDisplay();
