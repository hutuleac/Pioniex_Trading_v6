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
export function buildMarketPulseStrip(pulse) {
  const { volume24h, fg, smartMoney, socialHype } = pulse || {};

  const volStr = volume24h == null ? '—'
    : volume24h >= 1e9 ? `$${(volume24h / 1e9).toFixed(2)}B`
    : `$${(volume24h / 1e6).toFixed(0)}M`;

  let fgCls = 'neutral', fgStr = '—';
  if (fg) {
    fgStr = `${fg.value} ${fg.label}`;
    fgCls = fg.value >= 60 ? 'bull' : fg.value <= 40 ? 'bear' : 'warn';
  }

  let smCls = 'neutral', smStr = '—';
  if (smartMoney) {
    const lbl = smartMoney.bias === 'long' ? 'Long' : smartMoney.bias === 'short' ? 'Short' : 'Neutral';
    smStr = `${lbl} ${smartMoney.ratio.toFixed(2)}×`;
    smCls = smartMoney.bias === 'long' ? 'bull' : smartMoney.bias === 'short' ? 'bear' : 'neutral';
  }

  let shCls = 'neutral', shStr = '—';
  if (socialHype) {
    const lbl = socialHype.bias === 'buy' ? 'Buy' : socialHype.bias === 'sell' ? 'Sell' : 'Neutral';
    shStr = `${lbl} ${socialHype.pct.toFixed(0)}%`;
    shCls = socialHype.bias === 'buy' ? 'bull' : socialHype.bias === 'sell' ? 'bear' : 'neutral';
  }

  const pill = (label, val, cls) =>
    `<div class="pill pulse-pill"><span class="pulse-label">${label}</span><span class="${cls}">${val}</span></div>`;
  return [
    pill('24h Vol', volStr, ''),
    pill('F&amp;G',  fgStr,  fgCls),
    pill('Smart $', smStr,  smCls),
  ].join('');
}

// ══════════════════════════════════════════════════════════════════
//  CIM v6 — CARD BUILDERS
// ══════════════════════════════════════════════════════════════════

const VERDICT_UI = { GRID_NOW: ['GRID NOW', 'green'], DEVELOPING: ['DEVELOPING', 'yellow'], WAIT: ['WAIT', 'red'], BLOCKED: ['BLOCKED', 'red'] };

export function buildGridCard(name, m, prov = '?', mode = 'spot') {
  const v = m?.gridVerdicts?.[mode], p = m?.gridPlans?.[mode];
  if (!v || !p) return '';
  const [vLabel, vCls] = VERDICT_UI[v.verdict];
  const tier = v.verdict === 'GRID_NOW' ? ['sr-high', 'card-grid-ok'] : v.verdict === 'DEVELOPING' ? ['sr-mid', 'card-grid-warn'] : ['sr-low', 'card-grid-bad'];
  const tvEx = prov === 'Bybit' ? 'BYBIT' : 'BINANCE';
  return `
<div class="asset-card ${tier[1]}" data-name="${name}" data-type="grid">
  <div class="card-header">
    <div>
      <div class="card-ticker"><a href="https://www.tradingview.com/chart/?symbol=${tvEx}%3A${name}USDT.P" target="_blank" rel="noopener" class="tv-link" onclick="event.stopPropagation()">${name}</a></div>
      <div class="card-price">$${fmtPrice(m.price)}</div>
    </div>
    <div class="card-meta">
      <span class="badge-sm ${vCls}">${vLabel}</span>
      <span class="score-ring ${tier[0]}">${v.score.toFixed(1)}</span>
    </div>
  </div>
  <div class="indicator-row">
    <span class="ind-pill p-purple">$${fmtPrice(p.lower)}–$${fmtPrice(p.upper)}</span>
    <span class="ind-pill p-neutral">${p.count} grids · ${(p.profit.min * 100).toFixed(2)}–${(p.profit.max * 100).toFixed(2)}%</span>
    <span class="ind-pill p-neutral">~${p.daysInRange.toFixed(1)}d in range</span>
  </div>
  ${v.verdict === 'BLOCKED' ? `<div class="card-block-reason">${v.reason}</div>` : ''}
</div>`;
}

export function buildGridCards(allMetrics, symProvider = {}, mode = 'spot') {
  const entries = Object.entries(allMetrics).filter(([, m]) => m?.gridVerdicts)
    .map(([name, m]) => ({ name, m, verdict: m.gridVerdicts[mode] }));
  return sortGridEntries(entries).map(e => buildGridCard(e.name, e.m, symProvider[e.name] || '?', mode)).join('')
    || '<div class="asset-card"><span class="neutral">No data yet.</span></div>';
}

function planTable(p, v) {
  const r = p.risk;
  const risk = p.mode === 'spot'
    ? `<tr><td>Loss at stop</td><td class="bear">−$${fmt(r.lossAtSL, 0)} (${(r.lossPct * 100).toFixed(1)}%)</td></tr>
       <tr><td>Break-even</td><td>$${fmtPrice(r.breakEven)}</td></tr>`
    : ['down', 'up'].filter(k => r[k]).map(k =>
        `<tr><td>Est. liquidation ${k === 'down' ? '↓' : '↑'}</td><td class="${r[k].liqBeforeStop ? 'bear' : ''}">$${fmtPrice(r[k].liq)}${r[k].liqBeforeStop ? ' ⚠ before stop' : ''}</td></tr>`).join('');
  return `<table class="sheet-table">
  <tr><td>Verdict</td><td>${v.verdict.replace('_', ' ')} · ${v.score.toFixed(1)}/10</td></tr>
  ${v.reason ? `<tr><td>Note</td><td class="warn">${v.reason}</td></tr>` : ''}
  <tr><td>Lower</td><td>${fmtPrice(p.lower)}</td></tr>
  <tr><td>Upper</td><td>${fmtPrice(p.upper)}</td></tr>
  <tr><td>Grids</td><td>${p.count} · ${p.geometric ? 'Geometric' : 'Arithmetic'}</td></tr>
  ${p.mode === 'futures' ? `<tr><td>Direction</td><td>${p.side} · ${p.leverage}×</td></tr>` : ''}
  <tr><td>Investment</td><td>$${fmt(p.capital, 0)}</td></tr>
  <tr><td>Stop loss</td><td class="bear">${fmtPrice(p.sl)}</td></tr>
  <tr><td>Take profit</td><td class="bull">${fmtPrice(p.tp)}</td></tr>
  <tr><td>Profit / grid</td><td>${(p.profit.min * 100).toFixed(2)}–${(p.profit.max * 100).toFixed(2)}% net</td></tr>
  <tr><td>Days in range</td><td>~${p.daysInRange.toFixed(1)}</td></tr>
  ${risk}
</table>`;
}

export function buildGridSheet(name, m) {
  if (!m?.gridPlans) return '<p class="sheet-note">No data available.</p>';
  const v = m.gridVerdicts.spot;
  const comps = v.components.map(c =>
    `<tr><td>${c.label}</td><td>${c.score.toFixed(1)} / ${c.max.toFixed(1)}<br><span class="neutral" style="font-size:.7rem">${c.detail}</span></td></tr>`).join('');
  const recs = v.recs.map(r => `<div class="warn" style="font-size:.75rem;margin-top:4px">→ ${r}</div>`).join('');
  return `
<div class="sheet-section-label">Spot Grid</div>${planTable(m.gridPlans.spot, m.gridVerdicts.spot)}
<div class="sheet-section-label">Futures Grid</div>${planTable(m.gridPlans.futures, m.gridVerdicts.futures)}
<div class="sheet-section-label">Why this score</div><table class="sheet-table">${comps}</table>${recs}
${buildRegimeBlock(m, { includeSqueezeConf: true })}`;
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
