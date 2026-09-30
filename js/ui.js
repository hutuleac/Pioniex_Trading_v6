'use strict';

import { CFG, GRID_CONFIG } from './config.js';
import { sortGridEntries } from './grid.js';

// ══════════════════════════════════════════════════════════════════
//  FORMATTERS
// ══════════════════════════════════════════════════════════════════
export function fmt(n, d=2)   { return n==null ? '—' : Number(n).toLocaleString('en',{minimumFractionDigits:d,maximumFractionDigits:d}); }

// Copy-safe price: no thousands separator, ~4–6 significant digits (sub-cent coins keep precision).
export function fmtPrice(p) {
  if (p == null || !Number.isFinite(p)) return '—';
  const d = p >= 1000 ? 1 : p >= 100 ? 2 : p >= 1 ? 4 : Math.min(8, 3 - Math.floor(Math.log10(p)));
  return p.toFixed(d);
}

// ══════════════════════════════════════════════════════════════════
//  REGIME & MOMENTUM block — shared by both sheets
// ══════════════════════════════════════════════════════════════════
const REGIME_COLORS = {
  RANGING:        'var(--cyan)',
  TRENDING_UP:    'var(--green)',
  TRENDING_DOWN:  'var(--red)',
  SQUEEZE:        'var(--yellow)',
  EXPANSION:      'var(--purple)',
  MIXED:          'var(--text2)',
};
function dcRowText(dc, pos, price) {
  if (!dc) return '—';
  const f = (v) => v < 1 ? v.toFixed(4) : v.toFixed(2);
  if (pos === 'BREAK_UP')   return `BREAK ↑ hi ${f(dc.high)} (${dc.widthPct.toFixed(1)}%)`;
  if (pos === 'BREAK_DOWN') return `BREAK ↓ lo ${f(dc.low)} (${dc.widthPct.toFixed(1)}%)`;
  return `INSIDE [${f(dc.low)} / ${f(dc.high)}] w=${dc.widthPct.toFixed(1)}%`;
}
function dcColor(pos) {
  if (pos === 'BREAK_UP')   return 'var(--green)';
  if (pos === 'BREAK_DOWN') return 'var(--red)';
  return 'var(--cyan)';
}
export function buildRegimeBlock(m, { includeSqueezeConf = false } = {}) {
  const regime = m.regime ?? 'MIXED';
  const regColor = REGIME_COLORS[regime] ?? 'var(--text2)';
  const regLabel = regime.replace('_', ' ');

  const adx  = m.adx?.adx ?? 0;
  const pDI  = m.adx?.plusDI ?? 0;
  const mDI  = m.adx?.minusDI ?? 0;
  const adxColor = adx > 25 ? 'var(--red)' : adx >= 18 ? 'var(--yellow)' : 'var(--green)';

  const mh   = m.macd?.histogram ?? 0;
  const mTr  = m.macd?.trend ?? 'neutral';
  const mColor = mTr === 'bull' ? 'var(--green)' : mTr === 'bear' ? 'var(--red)' : 'var(--text2)';

  const bw   = m.bbBw ?? 0;
  const bbLbl = m.bb?.label ?? 'normal';
  const bwColor = bbLbl === 'squeeze' ? 'var(--yellow)' : bbLbl === 'expanded' ? 'var(--red)' : 'var(--green)';

  const flow = m.flow ?? 0;
  const flowColor = flow > CFG.FLOW_STRONG ? 'var(--green)'
                  : flow < -CFG.FLOW_STRONG ? 'var(--red)'
                  : Math.abs(flow) > CFG.FLOW_PARTIAL ? 'var(--yellow)' : 'var(--text2)';

  const squeezeRow = includeSqueezeConf
    ? `<tr><td>Squeeze Conf</td><td style="color:${(m.squeezeConf ?? 0) >= 60 ? 'var(--yellow)' : (m.squeezeConf ?? 0) >= 40 ? 'var(--cyan)' : 'var(--text2)'}">${m.squeezeConf ?? 0}/100</td></tr>`
    : '';

  return `
<div class="sheet-section-label">Regime & Momentum</div>
<table class="sheet-table">
  <tr><td>Regime</td><td style="color:${regColor};font-weight:700">${regLabel}</td></tr>
  <tr><td>Donchian 20</td><td style="color:${dcColor(m.dc20Pos)}">${dcRowText(m.dc20, m.dc20Pos, m.price)}</td></tr>
  <tr><td>Donchian 55</td><td style="color:${dcColor(m.dc55Pos)}">${dcRowText(m.dc55, m.dc55Pos, m.price)}</td></tr>
  <tr><td>ADX</td><td style="color:${adxColor}">${adx.toFixed(1)} (+DI ${pDI.toFixed(1)} / −DI ${mDI.toFixed(1)})</td></tr>
  <tr><td>MACD Hist</td><td style="color:${mColor}">${mh >= 0 ? '+' : ''}${mh.toFixed(4)} · ${mTr}</td></tr>
  <tr><td>BB Width</td><td style="color:${bwColor}">${bw.toFixed(1)}% · ${bbLbl}</td></tr>
  <tr><td>Flow 24h</td><td style="color:${flowColor}">${flow >= 0 ? '+' : ''}${flow.toFixed(2)}%</td></tr>
  ${squeezeRow}
</table>`;
}

// ══════════════════════════════════════════════════════════════════
//  MARKET PULSE STRIP
// ══════════════════════════════════════════════════════════════════
export function buildPulse(pulse) {
  const { volume24h, fg, smartMoney } = pulse || {};
  const vol = volume24h == null ? '—' : volume24h >= 1e9 ? `$${(volume24h / 1e9).toFixed(2)}B` : `$${(volume24h / 1e6).toFixed(0)}M`;
  const fgCls = !fg ? 'neutral' : fg.value >= 60 ? 'bull' : fg.value <= 40 ? 'bear' : 'warn';
  const smCls = !smartMoney ? 'neutral' : smartMoney.bias === 'long' ? 'bull' : smartMoney.bias === 'short' ? 'bear' : 'neutral';
  const chip = (l, v, c = '') => `<span class="chip"><span class="chip-label">${l}</span><span class="${c}">${v}</span></span>`;
  return chip('Fear &amp; Greed', fg ? `${fg.value} ${fg.label}` : '—', fgCls)
       + chip('Top traders L/S', smartMoney ? smartMoney.ratio.toFixed(2) : '—', smCls)
       + chip('24h vol', vol);
}

// ══════════════════════════════════════════════════════════════════
//  CIM v6 — CARD BUILDERS
// ══════════════════════════════════════════════════════════════════

const VERDICT = { GRID_NOW: ['Grid now', 'green'], DEVELOPING: ['Developing', 'yellow'], WAIT: ['Wait', 'dim'], BLOCKED: ['Blocked', 'red'] };
const pct = (x, d = 2) => (x * 100).toFixed(d);
const tr  = (k, v, cls = '') => `<tr><td>${k}</td><td class="${cls}">${v}</td></tr>`;
const gridScoreCls = s => s >= GRID_CONFIG.VERDICT.NOW ? 'bull' : s >= GRID_CONFIG.VERDICT.DEVELOPING ? 'warn' : 'bear';

export function buildGridRow(name, m, mode) {
  const v = m.gridVerdicts[mode], p = m.gridPlans[mode];
  const [label, cls] = VERDICT[v.verdict];
  return `<button class="row${v.verdict === 'BLOCKED' ? ' is-blocked' : ''}" data-open="grid:${name}">
  <span class="row-top">
    <span class="row-name">${name}</span><span class="row-price">$${fmtPrice(m.price)}</span>
    <span class="row-right"><span class="badge ${cls}">${label}</span><span class="score ${gridScoreCls(v.score)}">${v.score.toFixed(1)}</span></span>
  </span>
  <span class="row-stats">
    <span>Range <b>${p.widthPct.toFixed(1)}%</b></span>
    <span>Per grid <b>${pct(p.profit.min)}–${pct(p.profit.max)}%</b></span>
    <span>In range <b>~${p.daysInRange.toFixed(1)}d</b></span>
    ${mode === 'futures' ? `<span><b>${p.side}</b> ${p.leverage}×</span>` : ''}
  </span>
  ${v.verdict === 'BLOCKED' ? `<span class="row-reason">${v.reason}</span>` : ''}
</button>`;
}

export function buildGridList(allMetrics, mode) {
  const entries = Object.entries(allMetrics).filter(([, m]) => m?.gridVerdicts?.[mode])
    .map(([name, m]) => ({ name, m, verdict: m.gridVerdicts[mode] }));
  return sortGridEntries(entries).map(e => buildGridRow(e.name, e.m, mode)).join('')
    || '<p class="sheet-note">No data yet.</p>';
}

const copyField = (label, shown, raw) =>
  `<button class="copy-field" data-copy="${raw}" data-label="${label}"><span class="cf-label">${label}</span><span class="cf-val">${shown}</span></button>`;

export function buildGridSheet(name, m, mode, provider) {
  const v = m.gridVerdicts[mode], p = m.gridPlans[mode], r = p.risk;
  const modeName = p.geometric ? 'Geometric' : 'Arithmetic';
  const fields = [
    copyField('Lower', fmtPrice(p.lower), fmtPrice(p.lower)),
    copyField('Upper', fmtPrice(p.upper), fmtPrice(p.upper)),
    copyField('Grids', p.count, p.count),
    copyField('Mode', modeName, modeName),
    mode === 'futures' ? copyField('Direction', p.side, p.side) + copyField('Leverage', `${p.leverage}×`, p.leverage) : '',
    copyField('Investment', `$${fmt(p.capital, 0)}`, p.capital),
    copyField('Stop loss', fmtPrice(p.sl), fmtPrice(p.sl)),
    copyField('Take profit', fmtPrice(p.tp), fmtPrice(p.tp)),
  ].join('');
  const legs = ['down', 'up'].filter(k => r[k]);
  const riskRows = mode === 'spot'
    ? tr('Loss at stop', `−$${fmt(r.lossAtSL, 0)} (${pct(r.lossPct, 1)}%)`, 'bear') + tr('Break-even', `$${fmtPrice(r.breakEven)}`)
    : legs.map(k => tr(`Est. liquidation ${k === 'down' ? '↓' : '↑'}`, `$${fmtPrice(r[k].liq)}${r[k].liqBeforeStop ? ' — before stop!' : ''}`, r[k].liqBeforeStop ? 'bear' : '')
                  + tr(`Loss at stop ${k === 'down' ? '↓' : '↑'}`, `−$${fmt(r[k].lossAtStop, 0)}`, 'bear')).join('');
  const danger = mode === 'futures' && legs.some(k => r[k].liqBeforeStop);
  const note = v.verdict === 'BLOCKED' ? `<span class="row-reason">${v.blocks.join(' · ')}</span>`
             : v.reason ? `<span class="sheet-note warn">${v.reason}</span>` : '';
  const [label, cls] = VERDICT[v.verdict];
  return `
<p class="sheet-note"><span class="badge ${cls}">${label}</span> <span class="mono">${v.score.toFixed(1)} / 10</span></p>
${note}
<div class="sheet-section-label">Pionex parameters · tap to copy</div>
<div class="fields">${fields}</div>
<div class="risk${danger ? ' danger' : ''}"><table class="sheet-table">
  ${tr('Profit / grid (net)', `${pct(p.profit.min)}–${pct(p.profit.max)}%`)}
  ${tr('Expected days in range', `~${p.daysInRange.toFixed(1)}`)}
  ${riskRows}
</table>
${mode === 'futures' ? `<span class="sheet-note">Liquidation is an estimate (isolated margin, ${GRID_CONFIG.MMR * 100}% maintenance). Confirm Pionex's figure before creating.</span>` : ''}
</div>
<details class="fold"><summary>Why ${v.score.toFixed(1)} / 10</summary>
  ${v.components.map(c => `<span class="comp"><span class="comp-top"><span>${c.label}</span><span class="mono">${c.score.toFixed(1)} / ${c.max.toFixed(1)}</span></span><span class="bar"><i style="width:${Math.round(c.score / c.max * 100)}%"></i></span><span class="sub">${c.detail}</span></span>`).join('')}
  ${v.recs.map(t => `<p class="rec">${t}</p>`).join('')}
</details>
<details class="fold"><summary>Regime &amp; indicators</summary>${buildRegimeBlock(m, { includeSqueezeConf: true })}</details>
<p class="sheet-note"><a class="link" href="https://www.tradingview.com/chart/?symbol=${provider === 'Bybit' ? 'BYBIT' : 'BINANCE'}%3A${name}USDT.P" target="_blank" rel="noopener">Open ${name} chart ↗</a></p>`;
}

// ── Direction card (collapsed) ────────────────────────────
export function buildDirectionCard(name, m, prov = '?', score = 0, direction = null, rec = null) {
  if (!m) return '';

  // Score ring class
  const srCls = score >= CFG.SCORE_ACTIVE ? 'sr-high' : score >= 6 ? 'sr-mid' : 'sr-low';

  // Rec badge
  const recLabel = rec?.rec ?? 'No bias';
  const recText  = direction ? `${direction} · ${recLabel}` : recLabel;
  const recCls   = { bull: 'green', warn: 'yellow', bear: 'red' }[rec?.recClass] ?? 'red';
  const recBadge = `<span class="badge-sm ${recCls}">${recText}</span>`;

  // Card border class
  const cardCls = direction === 'LONG' ? 'card-bull'
                : direction === 'SHORT' ? 'card-bear'
                : 'card-avoid';

  // Pill 1: Macro Trend
  const isBull = direction === 'LONG';
  const isBear = direction === 'SHORT';
  const macroLabel = isBull ? 'Macro Bull' : isBear ? 'Macro Bear' : 'Neutral';
  const macroCls   = isBull ? 'p-bull' : isBear ? 'p-bear' : 'p-neutral';
  const macroFull  = score >= CFG.SCORE_ACTIVE;
  const macroPill  = `<span class="ind-pill ${macroCls}">${macroLabel}${macroFull ? ' ✓' : ''}</span>`;

  // Pill 2: RSI
  const rsi = m.rsi ?? 0;
  const rsiCls = rsi < 30 ? 'p-bull' : rsi > 70 ? 'p-bear' : rsi > 65 ? 'p-warn' : 'p-neutral';
  const rsiWarn = rsi > 70 || rsi < 30 ? ' ⚠' : '';
  const rsiPill = `<span class="ind-pill ${rsiCls}">RSI ${rsi.toFixed(0)}${rsiWarn}</span>`;

  // Pill 3: Flow / Pressure
  const flow = m.flow ?? 0;
  const flowCls = flow > CFG.FLOW_STRONG ? 'p-bull'
                : flow < -CFG.FLOW_STRONG ? 'p-bear'
                : flow > CFG.FLOW_PARTIAL ? 'p-warn'
                : 'p-neutral';
  const flowLabel = flow > CFG.FLOW_STRONG ? 'Buy Pressure'
                  : flow < -CFG.FLOW_STRONG ? 'Sell Pressure'
                  : flow > CFG.FLOW_PARTIAL ? 'Mild Buy'
                  : flow < -CFG.FLOW_PARTIAL ? 'Mild Sell'
                  : 'No Pressure';
  const flowPill = `<span class="ind-pill ${flowCls}">${flowLabel}</span>`;

  // Pill 4: Structure
  const s4h  = m.structure4h  ?? '—';
  const s30d = m.structure30d ?? '—';
  const strMatch = s4h === s30d;
  const strBull  = s4h === 'Bullish' && s30d === 'Bullish';
  const strBear  = s4h === 'Bearish' && s30d === 'Bearish';
  const strCls   = strBull ? 'p-bull' : strBear ? 'p-bear' : !strMatch ? 'p-warn' : 'p-neutral';
  const strPill  = `<span class="ind-pill ${strCls}">${s4h.slice(0,4)} / ${s30d.slice(0,4)}</span>`;

  // TradingView link
  const tvExDir  = prov === 'Bybit' ? 'BYBIT' : 'BINANCE';
  const tvLinkDir = `<a href="https://www.tradingview.com/chart/?symbol=${tvExDir}%3A${name}USDT.P" target="_blank" rel="noopener" class="tv-link" onclick="event.stopPropagation()">${name}</a>`;

  return `
<div class="asset-card ${cardCls}" data-name="${name}" data-type="direction">
  <div class="card-header">
    <div>
      <div class="card-ticker">${tvLinkDir}</div>
      <div class="card-price">$${fmt(m.price,2)}</div>
    </div>
    <div class="card-meta">
      ${recBadge}
      <span class="score-ring ${srCls}">${score.toFixed(1)}</span>
    </div>
  </div>
  <div class="indicator-row">
    ${macroPill}${rsiPill}${flowPill}${strPill}
  </div>
</div>`;
}

// ── Direction cards wrapper ───────────────────────────────
export function buildDirectionCards(allMetrics, allScores = {}, allRecs = {}, symProvider = {}) {
  return Object.entries(allMetrics)
    .filter(([, m]) => m != null)
    .sort((a, b) => (allScores[b[0]]?.score ?? 0) - (allScores[a[0]]?.score ?? 0))
    .map(([name, m]) => buildDirectionCard(
      name, m,
      symProvider[name] || '?',
      allScores[name]?.score ?? 0,
      allScores[name]?.direction ?? null,
      allRecs[name] ?? null
    ))
    .join('') || '<div class="asset-card"><span style="color:#555;font-size:.7rem">No data yet.</span></div>';
}

// ── Direction bottom sheet ────────────────────────────────
export function buildDirectionSheet(name, m, score = 0, direction = null, detail = [], rec = null) {
  if (!m) return '<p class="sheet-note">No data available.</p>';
  const price = m.price ?? 0;
  const side  = ref => ref == null ? '—' : price > ref ? '<span class="bull">Above</span>' : '<span class="bear">Below</span>';
  const cvd   = v => v > 0 ? '<span class="bull">ACC</span>' : v < 0 ? '<span class="bear">DIS</span>' : '—';
  const rows  = detail.map(([c, v, why]) =>
    `<tr><td>${c}<br><span class="neutral" style="font-size:.7rem">${why}</span></td><td class="${v > 0 ? 'bull' : v < 0 ? 'bear' : 'neutral'}">${v > 0 ? '+' : ''}${v.toFixed(2)}</td></tr>`).join('');
  const blockers = (rec?.blockers ?? []).map(b => `<div class="warn" style="font-size:.75rem;margin-top:3px">⚠ ${b}</div>`).join('');
  return `
<div class="sheet-section-label">Score breakdown · ${score.toFixed(1)} / 10 · ${direction ?? 'No bias'}</div>
<table class="sheet-table">${rows}</table>
${blockers}
<div class="sheet-section-label">Trend</div>
<table class="sheet-table">
  <tr><td>Structure 4H / 30d</td><td>${m.structure4h} / ${m.structure30d}</td></tr>
  <tr><td>AVWAP 5d / 14d / 30d</td><td>${side(m.avwap5d)} / ${side(m.avwap14d)} / ${side(m.avwap30d)}</td></tr>
  <tr><td>CVD 5d / 14d / 30d</td><td>${cvd(m.cvd5d)} / ${cvd(m.cvd14d)} / ${cvd(m.cvd30d)}</td></tr>
  <tr><td>RSI 4H</td><td>${m.rsi?.toFixed(1) ?? '—'}</td></tr>
  <tr><td>OI 7d</td><td>${m.oiChange != null ? m.oiChange.toFixed(1) + '%' : '—'}</td></tr>
</table>
${buildRegimeBlock(m, { includeSqueezeConf: false })}`;
}

// ── Transitional adapters (replaced in Tasks 12–13) ──
export const buildSignalList = (all, scores, recs) => buildDirectionCards(all, scores, recs, {});
export const buildSignalSheet = (name, m, sc, rec) => buildDirectionSheet(name, m, sc?.score ?? 0, sc?.direction ?? null, sc?.detail ?? [], rec);
