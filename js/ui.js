'use strict';

import { CFG, SIG_TIPS, GRID_CONFIG, getGridCapital } from './config.js';
import { fvgStatus } from './indicators.js';
import { calcGridScore } from './grid.js';

// ══════════════════════════════════════════════════════════════════
//  FORMATTERS
// ══════════════════════════════════════════════════════════════════
const CC = { bull:'bull', bear:'bear', neutral:'neutral', warn:'warn' };
export function col(val, cls) { return `<span class="${CC[cls]||''}">${val}</span>`; }
export function fmt(n, d=2)   { return n==null ? '—' : Number(n).toLocaleString('en',{minimumFractionDigits:d,maximumFractionDigits:d}); }
export function fmtB(n)        { return n==null ? '—' : Number(n).toLocaleString('en',{maximumFractionDigits:0}); }
export function sCol(s)        {
  if (s==="Bullish") return col(s,"bull");
  if (s==="Bearish") return col(s,"bear");
  return `<span class="neutral">${s}</span>`;
}
export function scClass(s) { return s>=8?'s-high':s>=6?'s-mid':'s-low'; }
export function scColor(s) { return s>=8?'var(--green)':s>=6?'var(--yellow)':'var(--red)'; }

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

export function sigValHtml(val, cls) {
  const cm = { bull:'color:var(--green)', bear:'color:var(--red)', warn:'color:var(--yellow)', neutral:'color:var(--text2)' };
  return `<span style="${cm[cls]||''};font-weight:700">${val}</span>`;
}

// ══════════════════════════════════════════════════════════════════
//  DOM STRING BUILDERS
// ══════════════════════════════════════════════════════════════════

// ── Main table row ────────────────────────────────────────────────
export function buildTableRow(name, m, prov) {
  const rsiH  = m.rsi>70 ? col(fmt(m.rsi,1),"bear") : m.rsi<30 ? col(fmt(m.rsi,1),"bull") : fmt(m.rsi,1);
  const fundH = m.funding>0 ? col(fmt(m.funding,4)+"%","warn") : col(fmt(m.funding,4)+"%","neutral");
  const flowH = m.flow>5 ? col(fmt(m.flow,1)+"%","bull") : m.flow<-5 ? col(fmt(m.flow,1)+"%","bear") : fmt(m.flow,1)+"%";
  const oiH   = m.oiChange>5 ? col(fmt(m.oiChange,2)+"%","bull") : m.oiChange<-5 ? col(fmt(m.oiChange,2)+"%","bear") : fmt(m.oiChange,2)+"%";
  const cvdH  = v => v>0 ? col("[ACC]","bull") : col("[DIS]","bear");
  const trend = m.price>m.avwap5d ? col("[UP]","bull") : col("[DN]","bear");
  const pairs = [Math.abs(m.poc5d-m.poc14d)/m.poc14d*100, Math.abs(m.poc5d-m.poc30d)/m.poc30d*100, Math.abs(m.poc14d-m.poc30d)/m.poc30d*100];
  const conf  = pairs.filter(p=>p<1.5).length>=2 ? col("[YES]","warn") : "–";
  const sweepH= m.sweep==="BUY_SWP" ? col("[BUY SWP]","bear") : m.sweep==="SELL_SWP" ? col("[SELL SWP]","bull") : `<span class="neutral">Neutral</span>`;
  const emaFC = m.price>m.emaFast ? col(fmt(m.emaFast,2),"bull") : col(fmt(m.emaFast,2),"bear");
  let fvgH = "–";
  if (m.fvgList?.length) {
    const g=m.fvgList[0], st=fvgStatus(m.price,g);
    const typ=g.type==='BULL'?'B':'S', zone=`${g.bottom.toFixed(2)}-${g.top.toFixed(2)}`;
    if (st.state==='inside') fvgH = col(`${typ}-FVG ${zone} [IN ${st.fillPct.toFixed(0)}%]`,"warn");
    else fvgH = col(`${typ}-FVG ${zone} d:${st.distPct.toFixed(2)}%`, g.type==='BULL'?"bull":"bear");
  }
  const provH = prov==='Bybit' ? `<span style="color:var(--orange);font-size:.6rem">BB</span>` : `<span style="color:var(--cyan2);font-size:.6rem">BN</span>`;
  const tvEx  = prov==='Bybit' ? 'BYBIT' : 'BINANCE';
  const tvLink = `<a href="https://www.tradingview.com/chart/?symbol=${tvEx}%3A${name}USDT.P" target="_blank" rel="noopener" class="tv-link">${name}</a>`;
  return `<tr>
    <td>${tvLink}</td><td>${fmt(m.price,2)}</td><td>${fundH}</td><td>${rsiH}</td>
    <td>${fmt(m.atr,4)}</td><td>${flowH}</td><td>${fmt(m.poc5d,1)}</td>
    <td>${fmt(m.poc14d,1)}</td><td>${fmt(m.avwap5d,1)}</td>
    <td>${fmt(m.avwap14d,1)}</td><td>${fmt(m.avwap30d,1)}</td>
    <td>${cvdH(m.cvd5d)}</td><td>${cvdH(m.cvd14d)}</td><td>${cvdH(m.cvd30d)}</td>
    <td>${fmtB(m.oiNow)}</td><td>${oiH}</td>
    <td>${sCol(m.structure4h)}</td><td>${sCol(m.structure30d)}</td>
    <td>${emaFC}</td><td>${fmt(m.emaSlow,2)}</td>
    <td>${trend}</td><td>${conf}</td><td>${sweepH}</td><td>${fvgH}</td><td>${provH}</td>
  </tr>`;
}







// ══════════════════════════════════════════════════════════════════
//  CIM v6 — CARD BUILDERS
// ══════════════════════════════════════════════════════════════════

// ── Grid Bot card (collapsed) ─────────────────────────────
export function buildGridCard(name, m, prov = '?') {
  if (!m) return '';

  const range = m.gridRange;
  const adx   = m.adx?.adx ?? 0;

  // Grid score
  const gs      = calcGridScore(m);
  const srCls   = gs.score >= 8 ? 'sr-high' : gs.score >= 6 ? 'sr-mid' : 'sr-low';
  const cardCls = gs.score >= 8 ? 'card-grid-ok' : gs.score >= 6 ? 'card-grid-warn' : 'card-grid-bad';
  const labelCls = gs.score >= 8 ? 'green' : gs.score >= 6 ? 'yellow' : 'red';
  const viabBadge = `<span class="badge-sm ${labelCls}">${gs.label}</span>`;

  // ADX pill
  const adxCls = adx < 20 ? 'p-bull' : adx < 25 ? 'p-warn' : 'p-bear';
  const adxIcon = adx < 20 ? ' ✓' : adx < 25 ? ' ⚠' : ' ✗';
  const adxPill = `<span class="ind-pill ${adxCls}">ADX ${adx.toFixed(0)}${adxIcon}</span>`;

  // CVD lateral pill
  const cvdDelta = Math.abs(m.cvd5d ?? 0);
  const vol5d    = Math.max(m.volume5d ?? 1, 1);
  const isLateral = (cvdDelta / vol5d) < CFG.CVD_LATERAL_RATIO;
  const cvdPill = isLateral
    ? `<span class="ind-pill p-bull">CVD Lateral</span>`
    : `<span class="ind-pill p-bear">CVD Directional</span>`;

  // Funding pill — negative = red, positive = green, near-zero = neutral
  const fund = m.funding ?? 0;       // already in % (app.js: pf.funding = rawRate * 100)
  const fundCls = fund < -0.001 ? 'p-bear' : fund > 0.001 ? 'p-bull' : 'p-neutral';
  const fundPill = `<span class="ind-pill ${fundCls}">Fund ${fund.toFixed(3)}%</span>`;

  // Range pill
  let rangePill = '';
  if (range?.rangeLow != null && range?.rangeHigh != null) {
    const lo = range.rangeLow < 1 ? range.rangeLow.toFixed(4) : range.rangeLow.toFixed(0);
    const hi = range.rangeHigh < 1 ? range.rangeHigh.toFixed(4) : range.rangeHigh.toFixed(0);
    rangePill = `<span class="ind-pill p-purple">$${lo}–$${hi}</span>`;
  }

  // BB Width pill
  const bbLabel = m.bb?.label ?? 'normal';
  const bbBw    = m.bbBw ?? 0;
  const bbCls   = bbLabel === 'squeeze' ? 'p-bull' : bbLabel === 'expanded' ? 'p-bear' : 'p-warn';
  const bbIcon  = bbLabel === 'squeeze' ? ' ✓' : bbLabel === 'expanded' ? ' ✗' : '';
  const bbPill  = `<span class="ind-pill ${bbCls}">BB ${bbBw.toFixed(1)}%${bbIcon}</span>`;

  // TradingView link
  const tvEx   = prov === 'Bybit' ? 'BYBIT' : 'BINANCE';
  const tvLink = `<a href="https://www.tradingview.com/chart/?symbol=${tvEx}%3A${name}USDT.P" target="_blank" rel="noopener" class="tv-link" onclick="event.stopPropagation()">${name}</a>`;

  return `
<div class="asset-card ${cardCls}" data-name="${name}" data-type="grid">
  <div class="card-header">
    <div>
      <div class="card-ticker">${tvLink}</div>
      <div class="card-price">$${fmt(m.price,2)} · ${prov}</div>
    </div>
    <div class="card-meta">
      ${viabBadge}
      <span class="score-ring ${srCls}">${gs.score.toFixed(1)}</span>
    </div>
  </div>
  <div class="indicator-row">
    ${adxPill}${bbPill}${cvdPill}${fundPill}${rangePill}
  </div>
</div>`;
}

// ── Grid Bot cards wrapper ────────────────────────────────
export function buildGridCards(allMetrics, symProvider = {}) {
  return Object.entries(allMetrics)
    .filter(([, m]) => m != null)
    .map(([name, m]) => buildGridCard(name, m, symProvider[name] || '?'))
    .join('') || '<div class="asset-card"><span style="color:#555;font-size:.7rem">No data yet.</span></div>';
}

// ── Grid Bot bottom sheet ──────────────────────────────────
export function buildGridSheet(name, m, prov = '?') {
  if (!m) return '<p class="sheet-note">No data available.</p>';

  const range  = m.gridRange;
  const adx    = m.adx?.adx ?? 0;
  const cap    = getGridCapital();

  const cvdDelta  = Math.abs(m.cvd5d ?? 0);
  const vol5d     = Math.max(m.volume5d ?? 1, 1);
  const isLateral = (cvdDelta / vol5d) < CFG.CVD_LATERAL_RATIO;
  const cvdLabel  = isLateral ? 'Lateral ✓' : 'Directional ✗';
  const cvdColor  = isLateral ? 'var(--green)' : 'var(--red)';

  const dir = m.gridDirection;
  const dirLabel = dir?.label ?? '—';

  // Grid score
  const gs = calcGridScore(m);
  const scoreColor = gs.score >= 8 ? 'var(--green)' : gs.score >= 6 ? 'var(--yellow)' : 'var(--red)';

  // Score breakdown table
  const scoreBreakdownHtml = gs.components.map(c => {
    const pct = c.max > 0 ? c.score / c.max : 0;
    const color = pct >= 0.9 ? 'var(--green)' : pct >= 0.5 ? 'var(--yellow)' : 'var(--red)';
    return `<tr><td>${c.label}</td><td style="color:${color}">${c.score.toFixed(1)} / ${c.max.toFixed(1)}<br><span style="color:#555;font-size:.6rem">${c.detail}</span></td></tr>`;
  }).join('');

  // Recommendations
  const recsHtml = gs.recs.length
    ? gs.recs.map(r => `<div style="font-size:.65rem;margin-top:4px;padding-left:8px;border-left:2px solid var(--yellow);color:#cdd6f4">→ ${r}</div>`).join('')
    : `<div style="color:var(--green);font-size:.65rem;margin-top:3px">All conditions met — ready to start grid</div>`;

  // Warnings (critical only)
  const warns = [];
  if (adx > 25)    warns.push(`ADX ${adx.toFixed(1)} — strong trend, grid risky`);
  if (m.bb?.label === 'expanded') warns.push(`BB Width ${(m.bbBw??0).toFixed(1)}% — expanded, avoid grid until compression`);
  if (m.rsi > 70)  warns.push(`RSI ${m.rsi.toFixed(1)} — overbought, wait for pullback`);
  if (m.rsi < 30)  warns.push(`RSI ${m.rsi.toFixed(1)} — oversold`);
  const warnsHtml = warns.length
    ? warns.map(w => `<div style="color:var(--yellow);font-size:.65rem;margin-top:3px">⚠ ${w}</div>`).join('')
    : `<div style="color:var(--green);font-size:.65rem;margin-top:3px">No critical warnings</div>`;

  const lo = range?.rangeLow  != null ? fmt(range.rangeLow,  range.rangeLow  < 1 ? 4 : 2) : '—';
  const hi = range?.rangeHigh != null ? fmt(range.rangeHigh, range.rangeHigh < 1 ? 4 : 2) : '—';

  // ATR
  const atr    = m.atr ?? 0;
  const atrPct = m.atrPct ?? 0;
  const atrColor = atrPct < 2 ? 'var(--green)' : atrPct < 4 ? 'var(--yellow)' : 'var(--red)';

  // BB Width
  const bbLabel = m.bb?.label ?? 'normal';
  const bbBw    = m.bbBw ?? 0;
  const bbColor = bbLabel === 'squeeze' ? 'var(--green)' : bbLabel === 'expanded' ? 'var(--red)' : 'var(--yellow)';
  const bbNote  = bbLabel === 'squeeze' ? '✓ Ideal' : bbLabel === 'expanded' ? '✗ Volatile' : '⚠ Watch';

  // POC vs grid midpoint
  const poc5d  = m.poc5d  ?? 0;
  const poc14d = m.poc14d ?? 0;
  const price  = m.price  ?? 0;
  let pocHtml = '<tr><td colspan="2" style="color:#555">Range not computed</td></tr>';
  if (range?.rangeLow != null && range?.rangeHigh != null && poc5d > 0) {
    const mid    = (range.rangeLow + range.rangeHigh) / 2;
    const inRange = (p) => p >= range.rangeLow && p <= range.rangeHigh;
    const distPct = (p, ref) => ref > 0 ? ((p - ref) / ref * 100).toFixed(1) : '—';

    const poc5InRange  = inRange(poc5d);
    const poc14InRange = inRange(poc14d);
    const poc5Color    = poc5InRange  ? 'var(--green)' : 'var(--yellow)';
    const poc14Color   = poc14InRange ? 'var(--green)' : 'var(--yellow)';

    const midFmt = mid < 1 ? mid.toFixed(4) : mid.toFixed(2);
    const poc5Fmt  = poc5d  < 1 ? poc5d.toFixed(4)  : poc5d.toFixed(2);
    const poc14Fmt = poc14d < 1 ? poc14d.toFixed(4) : poc14d.toFixed(2);
    const poc5DistFromMid  = distPct(poc5d,  mid);
    const poc14DistFromMid = distPct(poc14d, mid);

    pocHtml = `
  <tr><td>Grid Midpoint</td><td style="color:var(--purple)">$${midFmt}</td></tr>
  <tr><td>POC 5d</td><td style="color:${poc5Color}">$${poc5Fmt} ${poc5InRange ? '✓ in range' : `${poc5DistFromMid}% from mid`}</td></tr>
  <tr><td>POC 14d</td><td style="color:${poc14Color}">$${poc14Fmt} ${poc14InRange ? '✓ in range' : `${poc14DistFromMid}% from mid`}</td></tr>`;
  }

  // Pre-compute corrected values (gridProfitPerGrid and gridDrawdown are objects)
  const recCount   = m.gridRecommendation?.recommended ?? '—';
  const recCapPer  = recCount !== '—' && cap ? fmt(cap / recCount, 2) : '—';
  const profitNetPct = m.gridProfitPerGrid?.netPct != null ? (m.gridProfitPerGrid.netPct * 100).toFixed(2) : '—';
  const drawdownPct  = m.gridDrawdown?.drawdownPct   != null ? (m.gridDrawdown.drawdownPct  * 100).toFixed(1) : '—';
  const slFmt  = m.gridSL != null ? (m.gridSL < 1 ? m.gridSL.toFixed(4) : m.gridSL.toFixed(2)) : '—';
  const tpFmt  = m.gridTP != null ? (m.gridTP < 1 ? m.gridTP.toFixed(4) : m.gridTP.toFixed(2)) : '—';
  const midEntry = range?.rangeLow != null ? (range.rangeLow + range.rangeHigh) / 2 : null;
  const entryFmt = midEntry != null ? (midEntry < 1 ? midEntry.toFixed(4) : midEntry.toFixed(2)) : '—';
  const fundColor = (m.funding ?? 0) < -0.001 ? 'var(--red)' : (m.funding ?? 0) > 0.001 ? 'var(--green)' : 'var(--text2)';
  const setupLabel = gs.score >= 8 ? 'Recommended Setup ✓' : gs.score >= 6 ? 'Setup (Good)' : 'Setup Parameters';

  return `
<div class="sheet-section-label">Grid Score</div>
<table class="sheet-table">
  <tr><td>Score</td><td style="color:${scoreColor};font-size:.85rem;font-weight:700">${gs.score.toFixed(1)} / 10 — ${gs.label}</td></tr>
</table>
<table class="sheet-table" style="margin-top:4px">${scoreBreakdownHtml}
</table>

<div class="sheet-section-label">Recommendations</div>
${recsHtml}

<div class="sheet-section-label" style="color:${gs.score >= 6 ? 'var(--green)' : 'var(--text2)'}">${setupLabel}</div>
<table class="sheet-table">
  <tr><td>Range</td><td style="color:var(--purple)">$${lo} – $${hi}</td></tr>
  <tr><td>Entry Zone</td><td style="color:var(--cyan)">$${entryFmt} (midpoint)</td></tr>
  <tr><td>Stop Loss</td><td style="color:var(--red)">$${slFmt}</td></tr>
  <tr><td>Take Profit</td><td style="color:var(--green)">$${tpFmt}</td></tr>
  <tr><td>Grid Count</td><td>${recCount}</td></tr>
  <tr><td>Profit / Grid</td><td style="color:var(--green)">${profitNetPct}% net</td></tr>
  <tr><td>Drawdown (worst)</td><td style="color:var(--yellow)">${drawdownPct}%</td></tr>
  <tr><td>Capital / Grid</td><td>$${recCapPer} of $${cap}</td></tr>
  <tr><td>Direction</td><td style="color:var(--purple)">${dirLabel}</td></tr>
  <tr><td>Mode</td><td>${m.gridMode?.mode ?? '—'}</td></tr>
</table>

<div class="sheet-section-label">Conditions</div>
<table class="sheet-table">
  <tr><td>ADX 4H</td><td style="color:${adx < 20 ? 'var(--green)' : adx < 25 ? 'var(--yellow)' : 'var(--red)'}">${adx.toFixed(1)} ${adx < 20 ? '✓ Low trend' : adx < 25 ? '⚠ Mild trend' : '✗ Strong trend'}</td></tr>
  <tr><td>BB Width</td><td style="color:${bbColor}">${bbBw.toFixed(1)}% — ${bbNote}</td></tr>
  <tr><td>ATR 4H</td><td style="color:${atrColor}">${atr < 1 ? atr.toFixed(4) : atr.toFixed(2)} (${atrPct.toFixed(2)}%)</td></tr>
  <tr><td>CVD 5d</td><td style="color:${cvdColor}">${cvdLabel}</td></tr>
  <tr><td>RSI 4H</td><td style="color:${m.rsi > 70 || m.rsi < 30 ? 'var(--yellow)' : 'var(--green)'}">${m.rsi != null ? m.rsi.toFixed(1) : '—'}</td></tr>
  <tr><td>Funding</td><td style="color:${fundColor}">${m.funding != null ? m.funding.toFixed(3)+'%' : '—'}</td></tr>
</table>

<div class="sheet-section-label">Range Positioning</div>
<table class="sheet-table">${pocHtml}
</table>

<div class="sheet-section-label">Warnings</div>
${warnsHtml}`;
}

// ── Direction card (collapsed) ────────────────────────────
export function buildDirectionCard(name, m, prov = '?', score = 0, direction = null, rec = null) {
  if (!m) return '';

  // Score ring class
  const srCls = score >= CFG.SCORE_BOT_MIN ? 'sr-high' : score >= 6 ? 'sr-mid' : 'sr-low';

  // Rec badge
  const recLabel = rec?.rec ?? 'AVOID';
  const recDir   = direction === 'LONG' ? 'LONG' : direction === 'SHORT' ? 'SHORT' : '';
  const recText  = recDir ? `${recDir} · ${recLabel}` : recLabel;
  const recCls   = recLabel === 'Enter' ? 'green' : recLabel === 'Watch' ? 'yellow' : 'red';
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
  const macroFull  = score >= CFG.SCORE_BOT_MIN;
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
      <div class="card-price">$${fmt(m.price,2)} · ${prov}</div>
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
export function buildDirectionSheet(name, m, score = 0, direction = null, detail = [], bot = null, rec = null) {
  if (!m) return '<p class="sheet-note">No data available.</p>';

  const recLabel = rec?.rec ?? 'Avoid';
  const hasEntry = recLabel === 'Enter' && bot != null;
  const hasDev   = recLabel === 'Watch';

  // AVWAP above/below
  const price = m.price ?? 0;
  const av5   = m.avwap5d  != null ? (price > m.avwap5d  ? 'Above ↑' : 'Below ↓') : '—';
  const av14  = m.avwap14d != null ? (price > m.avwap14d ? 'Above ↑' : 'Below ↓') : '—';
  const av30  = m.avwap30d != null ? (price > m.avwap30d ? 'Above ↑' : 'Below ↓') : '—';
  const avColor = (v) => v.startsWith('Above') ? 'var(--green)' : 'var(--red)';

  // CVD labels
  const cvdLabel = (v) => v == null ? '—' : v > 0 ? 'ACC' : v < 0 ? 'DIS' : 'NEUTRAL';
  const cvdColor = (v) => v == null ? '#555' : v > 0 ? 'var(--green)' : 'var(--red)';

  // Entry/SL/TP block (only when rec = Enter)
  const entryHtml = hasEntry ? `
<div class="sheet-section-label">Entry Parameters</div>
<table class="sheet-table">
  <tr><td>Entry</td><td style="color:var(--cyan)">${fmt(bot.entry, bot.entry < 1 ? 4 : 2)}</td></tr>
  <tr><td>Stop Loss (1.5×ATR)</td><td style="color:var(--red)">${fmt(bot.sl, bot.sl < 1 ? 4 : 2)}</td></tr>
  <tr><td>Take Profit 1</td><td style="color:var(--green)">${fmt(bot.tp1, bot.tp1 < 1 ? 4 : 2)}</td></tr>
  <tr><td>Take Profit 2</td><td style="color:var(--green)">${fmt(bot.tp2, bot.tp2 < 1 ? 4 : 2)}</td></tr>
  <tr><td>Leverage</td><td>${bot.leverage ?? '—'}x</td></tr>
  <tr><td>R:R TP1 / TP2</td><td>1:${bot.rr1?.toFixed(1) ?? '—'} / 1:${bot.rr2?.toFixed(1) ?? '—'}</td></tr>
</table>` : hasDev
    ? `<p class="sheet-note">Setup developing — no entry params yet</p>`
    : `<p class="sheet-note">No setup — skip this asset</p>`;

  return `
<div class="sheet-section-label">Signal</div>
<table class="sheet-table">
  <tr><td>Score</td><td style="color:${score>=7.5?'var(--green)':score>=6?'var(--yellow)':'var(--red)'}">${score.toFixed(1)} / 10</td></tr>
  <tr><td>Direction</td><td>${direction ?? 'WAIT'}</td></tr>
  <tr><td>RSI 4H</td><td style="color:${m.rsi>70||m.rsi<30?'var(--yellow)':'var(--green)'}">${m.rsi?.toFixed(1) ?? '—'}</td></tr>
  <tr><td>Funding</td><td>${m.funding != null ? m.funding.toFixed(3)+'%' : '—'}</td></tr>
  <tr><td>OI% 7d</td><td style="color:${(m.oiChange??0)>0?'var(--green)':'var(--red)'}">${m.oiChange != null ? m.oiChange.toFixed(1)+'%' : '—'}</td></tr>
  <tr><td>ATR 4H</td><td>${m.atr != null ? fmt(m.atr, m.atr<1?4:2) : '—'}</td></tr>
</table>

<div class="sheet-section-label">Trend</div>
<table class="sheet-table">
  <tr><td>Structure 4H</td><td>${m.structure4h ?? '—'}</td></tr>
  <tr><td>Structure 30d</td><td>${m.structure30d ?? '—'}</td></tr>
  <tr><td>AVWAP 5d</td><td style="color:${avColor(av5)}">${av5}</td></tr>
  <tr><td>AVWAP 14d</td><td style="color:${avColor(av14)}">${av14}</td></tr>
  <tr><td>AVWAP 30d</td><td style="color:${avColor(av30)}">${av30}</td></tr>
  <tr><td>CVD 5d / 14d / 30d</td>
      <td><span style="color:${cvdColor(m.cvd5d)}">${cvdLabel(m.cvd5d)}</span> / <span style="color:${cvdColor(m.cvd14d)}">${cvdLabel(m.cvd14d)}</span> / <span style="color:${cvdColor(m.cvd30d)}">${cvdLabel(m.cvd30d)}</span></td></tr>
</table>

${entryHtml}`;
}
