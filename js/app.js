'use strict';

import { CFG, LEGENDS, getSettings, setSettings } from './config.js';
import { calcGridPlan, calcGridVerdict, getTickerGridProfile } from './grid.js';
import { fetchPriceFunding, fetchMarketPulse } from './api.js';
import { getAdvancedMetrics, calcScore, calcRecommendation } from './indicators.js';
import { buildPulse, buildGridList, buildGridSheet, buildSignalList, buildSignalSheet } from './ui.js';

// ══════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════
const DEFAULT_SYMBOLS = { BTC:"BTCUSDT", BNB:"BNBUSDT", SOL:"SOLUSDT", SUI:"SUIUSDT", TRX:"TRXUSDT", DOGE:"DOGEUSDT", XLM:"XLMUSDT", XRP:"XRPUSDT", HYPE:"HYPEUSDT" };
let SYMBOLS = loadSymbols();
const state = { metrics: {}, scores: {}, recs: {}, provider: {} };
let lastUpdate = 0, isLoading = false, refreshTimer = null;
const $ = id => document.getElementById(id);

function loadSymbols() {
  try {
    const p = JSON.parse(localStorage.getItem('pioniex_symbols'));
    if (p && typeof p === 'object' && Object.keys(p).length) return p;
  } catch {}
  return { ...DEFAULT_SYMBOLS };
}
function saveSymbols() { try { localStorage.setItem('pioniex_symbols', JSON.stringify(SYMBOLS)); } catch {} }

// Grid plans depend on user settings, so they are derived — never cached, re-derived on settings change.
function attachGrid(name, m) {
  const s = getSettings(), profile = getTickerGridProfile(name);
  m.gridPlans = {}; m.gridVerdicts = {};
  for (const mode of ['spot', 'futures']) {
    m.gridPlans[mode]    = calcGridPlan(m, profile, m.direction, { ...s, mode });
    m.gridVerdicts[mode] = calcGridVerdict(m, m.gridPlans[mode]);
  }
}
function regrid() { for (const [n, m] of Object.entries(state.metrics)) attachGrid(n, m); render(); }

// ══════════════════════════════════════════════════════════════════
//  FETCH
// ══════════════════════════════════════════════════════════════════
async function fetchSingleTicker(name, symbol) {
  const pf = await fetchPriceFunding(name, symbol);
  const m  = await getAdvancedMetrics(name, symbol);
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
  return { m: mFull, score, direction, detail, rec, provider: pf.provider };
}
function store(name, r) {
  state.metrics[name]  = r.m;
  state.scores[name]   = { score: r.score, direction: r.direction, detail: r.detail };
  state.recs[name]     = r.rec;
  state.provider[name] = r.provider;
}
function forget(name) { for (const k of Object.keys(state)) delete state[k][name]; }

async function fetchAndDisplay() {
  if (isLoading) return;
  isLoading = true;
  clearTimeout(refreshTimer);
  $('refresh-btn').disabled = true;
  setStatus('loading', 'Updating…');
  if (!Object.keys(state.metrics).length) renderSkeleton();

  fetchMarketPulse(Object.values(SYMBOLS))   // parallel — never blocks the tickers
    .then(p => { $('pulse').innerHTML = buildPulse(p); })
    .catch(e => console.warn('[MarketPulse]', e.message));

  let ok = 0;
  for (const [name, symbol] of Object.entries(SYMBOLS)) {   // sequential: Binance public rate limits
    try { store(name, await fetchSingleTicker(name, symbol)); ok++; render(); }
    catch (e) { console.error(`[${name}]`, e); }
  }
  for (const n of Object.keys(state.metrics)) if (!SYMBOLS[n]) forget(n);

  if (ok) lastUpdate = Date.now();
  isLoading = false;
  $('refresh-btn').disabled = false;
  if (!ok) setStatus('error', lastUpdate ? 'Offline — showing last data' : 'Offline');
  else updateAge();
  render();
  refreshTimer = setTimeout(fetchAndDisplay, CFG.REFRESH_INTERVAL_SEC * 1000);
}

// ══════════════════════════════════════════════════════════════════
//  RENDER + STATUS
// ══════════════════════════════════════════════════════════════════
function render() {
  $('grid-list').innerHTML   = buildGridList(state.metrics, getSettings().mode);
  $('signal-list').innerHTML = buildSignalList(state.metrics, state.scores, state.recs);
}
function renderSkeleton() {
  const sk = Object.keys(SYMBOLS).map(() => '<div class="skeleton"></div>').join('');
  $('grid-list').innerHTML = sk; $('signal-list').innerHTML = sk;
}
function setStatus(cls, text) { $('status-dot').className = 'dot ' + cls; $('status-text').textContent = text; }
function updateAge() {
  if (isLoading || !lastUpdate) return;
  const ms = Date.now() - lastUpdate, min = Math.floor(ms / 60000);
  const stale = ms > CFG.REFRESH_INTERVAL_SEC * 1000;
  $('status').classList.toggle('stale', stale);
  setStatus(stale ? 'error' : 'live', `${stale ? 'Stale · ' : ''}Updated ${min < 1 ? 'just now' : min + 'm ago'}`);
}

// ══════════════════════════════════════════════════════════════════
//  TABS · MODE · SHEET · TOAST
// ══════════════════════════════════════════════════════════════════
function showTab(tab) {
  for (const b of document.querySelectorAll('.tab'))
    b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  for (const p of document.querySelectorAll('.tab-panel')) p.hidden = p.id !== 'tab-' + tab;
  try { localStorage.setItem('cim_tab', tab); } catch {}
  window.scrollTo(0, 0);
}
function setMode(mode) {
  setSettings({ mode });
  for (const b of document.querySelectorAll('.seg-btn')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  render();
}

let sheetOpen = false, lastFocus = null;
function openSheet(type, name) {
  const m = state.metrics[name];
  if (!m) return;
  const mode = getSettings().mode;
  $('sheet-title-text').textContent = type === 'grid' ? `${name} · ${mode === 'futures' ? 'Futures' : 'Spot'} grid` : `${name} · Signal`;
  $('sheet-title-badge').innerHTML = '';
  $('sheet-content').innerHTML = type === 'grid'
    ? buildGridSheet(name, m, mode, state.provider[name])
    : buildSignalSheet(name, m, state.scores[name], state.recs[name]);
  lastFocus = document.activeElement;
  const sh = $('bottom-sheet');
  sh.scrollTop = 0;
  sh.classList.add('open'); $('sheet-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
  sheetOpen = true;
  sh.focus({ preventScroll: true });
}
function closeSheet() {
  const sh = $('bottom-sheet');
  sh.classList.remove('open'); sh.style.transform = '';
  $('sheet-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  sheetOpen = false;
  lastFocus?.focus?.({ preventScroll: true });
}
// Swipe down on the handle/title to dismiss
let dragY = null;
$('sheet-grab').addEventListener('touchstart', e => { dragY = e.touches[0].clientY; $('bottom-sheet').style.transition = 'none'; }, { passive: true });
$('sheet-grab').addEventListener('touchmove', e => {
  if (dragY == null) return;
  $('bottom-sheet').style.transform = `translateY(${Math.max(0, e.touches[0].clientY - dragY)}px)`;
}, { passive: true });
$('sheet-grab').addEventListener('touchend', e => {
  if (dragY == null) return;
  const dy = e.changedTouches[0].clientY - dragY;
  dragY = null;
  $('bottom-sheet').style.transition = '';
  if (dy > 80) closeSheet(); else $('bottom-sheet').style.transform = '';
});

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

// ══════════════════════════════════════════════════════════════════
//  SETTINGS TAB
// ══════════════════════════════════════════════════════════════════
const SETTING_INPUTS = [   // [input id, settings key, display scale (fees shown in %)]
  ['set-capital', 'capital', 1], ['set-leverage', 'leverage', 1],
  ['set-fee-spot', 'feeSpot', 100], ['set-fee-futures', 'feeFutures', 100],
];
function fillSettings() {
  const s = getSettings();
  for (const [id, key, scale] of SETTING_INPUTS) $(id).value = +(s[key] * scale).toFixed(4);
}
function initSettings() {
  fillSettings();
  for (const [id, key, scale] of SETTING_INPUTS) {
    $(id).addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      if (!(v > 0)) { fillSettings(); return toast('Enter a number above 0'); }
      setSettings({ [key]: v / scale });
      regrid();
      toast('Saved — grid plans updated');
    });
  }
  renderChips();
  $('btn-add-ticker').addEventListener('click', handleAdd);
  $('ticker-add-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleAdd(); });
  $('ticker-chips').addEventListener('click', e => {
    const b = e.target.closest('[data-remove]');
    if (b) removeTicker(b.dataset.remove);
  });
}
function renderChips() {
  const canRemove = Object.keys(SYMBOLS).length > 1;
  $('ticker-chips').innerHTML = Object.keys(SYMBOLS).map(n =>
    `<span class="tchip">${n}${canRemove ? `<button data-remove="${n}" aria-label="Remove ${n}">×</button>` : ''}</span>`).join('');
}
function removeTicker(name) {
  if (Object.keys(SYMBOLS).length <= 1) return;
  delete SYMBOLS[name]; forget(name);
  saveSymbols(); renderChips(); render();
}
async function handleAdd() {
  const input = $('ticker-add-input'), btn = $('btn-add-ticker'), msg = $('ticker-add-msg');
  const name = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!name) return;
  if (SYMBOLS[name]) { msg.textContent = `${name} is already in the list`; return; }
  btn.disabled = true; msg.textContent = `Checking ${name}USDT…`;
  try {
    store(name, await fetchSingleTicker(name, name + 'USDT'));
    SYMBOLS[name] = name + 'USDT';
    saveSymbols(); renderChips(); render();
    msg.textContent = `✓ ${name} added`; input.value = '';
  } catch {
    msg.textContent = `✗ ${name}USDT not found on Binance or Bybit`;
  } finally { btn.disabled = false; }
}

// ══════════════════════════════════════════════════════════════════
//  EVENTS + INIT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('click', async e => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.copy); toast(`Copied ${copy.dataset.label}`); }
    catch { toast('Copy failed — long-press the value'); }
    return;
  }
  const tab = e.target.closest('.tab');
  if (tab) return showTab(tab.dataset.tab);
  const seg = e.target.closest('.seg-btn');
  if (seg) return setMode(seg.dataset.mode);
  const row = e.target.closest('[data-open]');
  if (row) { const [type, name] = row.dataset.open.split(':'); return openSheet(type, name); }
});
$('refresh-btn').addEventListener('click', fetchAndDisplay);
$('sheet-backdrop').addEventListener('click', closeSheet);
$('sheet-close').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });

$('app-version').textContent = `v${CFG.APP_VERSION}`;
$('legend-grid').innerHTML = LEGENDS.map(([n, d]) =>
  `<div class="legend-item"><div class="legend-name">${n}</div><div class="legend-desc">${d}</div></div>`).join('');
let startTab = 'grid';
try { startTab = localStorage.getItem('cim_tab') || 'grid'; } catch {}
showTab(['grid', 'signals', 'settings'].includes(startTab) ? startTab : 'grid');
setMode(getSettings().mode);
setInterval(updateAge, 30000);
initSettings();
fetchAndDisplay();
