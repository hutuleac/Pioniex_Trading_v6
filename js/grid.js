'use strict';

import { CFG, GRID_CONFIG } from './config.js';

// ══════════════════════════════════════════════════════════════════
//  GRID BOT CALCULATIONS  —  pure functions, no side effects
//  All field names match actual allMetrics object in app.js:
//    adx      → adx.adx
//    bbBw     → bbBw  (extracted bandwidth %)
//    structure → structure4h
// ══════════════════════════════════════════════════════════════════

/**
 * Net profit per grid after fees.
 * Arithmetic: (range%) / gridCount  — fixed $ per step
 * Geometric:  (rangeHigh/rangeLow)^(1/n) − 1  — consistent % per step
 * @returns {{ grossPct, feeCost, netPct, isViable }}
 */
export function calcGridProfitPerGrid(rangeHigh, rangeLow, gridCount, feePct = GRID_CONFIG.FEE_PCT, isGeometric = false) {
  const grossPct = isGeometric
    ? Math.pow(rangeHigh / rangeLow, 1 / gridCount) - 1
    : (rangeHigh - rangeLow) / rangeLow / gridCount;
  const feeCost  = feePct * 2;
  const netPct   = grossPct - feeCost;
  return { grossPct, feeCost, netPct, isViable: netPct >= GRID_CONFIG.MIN_NET_PCT };
}

/**
 * Capital allocated per grid slot.
 * @returns {number}
 */
export function calcGridCapitalPerGrid(totalCapital, gridCount) {
  return totalCapital / gridCount;
}

/**
 * Worst-case drawdown: price drops below rangeLow to crashTargetPrice.
 * Assumes all capital converts to coin at average price of rangeLow.
 * @returns {{ coinsHeld, valueAtCrash, drawdownUSDT, drawdownPct }}
 */
export function calcDrawdownScenario(totalCapital, rangeLow, currentPrice, crashTargetPrice) {
  const coinsHeld    = totalCapital / rangeLow;
  const valueAtCrash = coinsHeld * crashTargetPrice;
  const drawdownUSDT = totalCapital - valueAtCrash;
  const drawdownPct  = drawdownUSDT / totalCapital;
  return { coinsHeld, valueAtCrash, drawdownUSDT, drawdownPct };
}

/**
 * Works backwards from target net profit/grid to find viable grid count.
 * @returns {{ recommended, min, max }}
 */
export function calcRecommendedGridCount(rangeHigh, rangeLow, targetNetPctPerGrid = GRID_CONFIG.TARGET_NET_PCT, feePct = GRID_CONFIG.FEE_PCT) {
  const totalRange = (rangeHigh - rangeLow) / rangeLow;
  const feeCost    = feePct * 2;

  // recommended: achieves target net %
  const recommended = Math.max(1, Math.round(totalRange / (targetNetPctPerGrid + feeCost)));

  // min: just above break-even (netPct > 0)
  let min = 1;
  for (let g = 1; g <= 200; g++) {
    const net = totalRange / g - feeCost;
    if (net > 0) { min = g; break; }
  }

  // max: capped at 100
  const max = Math.min(100, Math.round(totalRange / (0.001 + feeCost)));

  return {
    recommended: Math.max(min, Math.min(recommended, 100)),
    min,
    max: Math.max(min, max),
  };
}

/**
 * Derives a grid range from ATR%, adjusted for grid direction.
 * Neutral: symmetric around price.
 * Long:    range sits below price — accumulate on dips.
 * Short:   range sits above price — sell into pumps.
 * @returns {{ rangeLow, rangeHigh, rangeWidthPct }}
 */
export function calcRangeFromATR(currentPrice, atrPct, multiplier = GRID_CONFIG.ATR_MULTIPLIER_DEFAULT, gridType = 'Neutral') {
  const offset = (atrPct / 100) * multiplier;
  let rangeLow, rangeHigh;
  if (gridType === 'Long') {
    rangeLow  = currentPrice * (1 - offset * 2);
    rangeHigh = currentPrice * (1 + offset * 0.25);
  } else if (gridType === 'Short') {
    rangeLow  = currentPrice * (1 - offset * 0.25);
    rangeHigh = currentPrice * (1 + offset * 2);
  } else {
    rangeLow  = currentPrice * (1 - offset);
    rangeHigh = currentPrice * (1 + offset);
  }
  const rangeWidthPct = ((rangeHigh - rangeLow) / rangeLow) * 100;
  return { rangeLow, rangeHigh, rangeWidthPct };
}

/**
 * Selects grid direction (Long / Short / Neutral) from market structure + score.
 * Uses GRID_CONFIG.DIRECTION thresholds for conservative selection.
 * @returns {{ type: string, label: string, reason: string }}
 */
export function selectGridDirection(structure4h, score) {
  const D = GRID_CONFIG.DIRECTION;
  if (structure4h === 'Bullish' && score >= D.LONG_MIN_SCORE)
    return { type: 'Long',    label: 'Long Grid',    reason: 'Bullish structure — range biased below price to accumulate on dips' };
  if (structure4h === 'Bearish' && score < D.SHORT_MAX_SCORE)
    return { type: 'Short',   label: 'Short Grid',   reason: 'Bearish structure — range biased above price to sell into pumps' };
  return   { type: 'Neutral', label: 'Neutral Grid', reason: 'No strong directional bias — range straddles current price' };
}

/**
 * Recommends Arithmetic or Geometric mode based on range width.
 * @returns {{ mode: string, reason: string }}
 */
export function selectGridMode(rangeWidthPct) {
  if (rangeWidthPct >= GRID_CONFIG.GEOMETRIC_THRESHOLD_PCT) {
    return { mode: 'Geometric', reason: `Wide range (≥${GRID_CONFIG.GEOMETRIC_THRESHOLD_PCT}%) — geometric grids maintain consistent % profit per step` };
  }
  return { mode: 'Arithmetic', reason: `Narrow range (<${GRID_CONFIG.GEOMETRIC_THRESHOLD_PCT}%) — arithmetic grids are simpler and effective` };
}

/**
 * Stop loss price: sits below the lower bound.
 * Buffer scales with volatility profile via GRID_CONFIG.SL_BUFFERS.
 * @returns {number}
 */
export function calcGridStopLoss(rangeLow, profile = 'moderate') {
  const buf = GRID_CONFIG.SL_BUFFERS[profile] ?? GRID_CONFIG.SL_BUFFERS.moderate;
  return rangeLow * (1 - buf);
}

/**
 * Take profit price: sits above the upper bound.
 * Buffer scales with volatility profile via GRID_CONFIG.TP_BUFFERS.
 * @returns {number}
 */
export function calcGridTakeProfit(rangeHigh, profile = 'moderate') {
  const buf = GRID_CONFIG.TP_BUFFERS[profile] ?? GRID_CONFIG.TP_BUFFERS.moderate;
  return rangeHigh * (1 + buf);
}

/**
 * Assesses whether market conditions are suitable for a grid bot.
 * All thresholds driven by GRID_CONFIG.VIABILITY for central control.
 * @returns {{ viable: boolean, reason: string, warning: string|null }}
 */
export function assessGridViability(atrPct, adx, rsi, bbBw, structure) {
  const V = GRID_CONFIG.VIABILITY;

  if (adx > V.ADX_BLOCK)
    return { viable: false, reason: `ADX=${adx.toFixed(1)}: trend detected (>${V.ADX_BLOCK}) — grid bots underperform in trending markets`, warning: null };
  if (rsi > V.RSI_BLOCK)
    return { viable: false, reason: `RSI=${rsi.toFixed(1)}: overbought (>${V.RSI_BLOCK}) — wait for pullback before starting`, warning: null };
  if (bbBw < V.BB_MIN)
    return { viable: false, reason: `BB Bandwidth=${bbBw.toFixed(2)}%: too compressed (<${V.BB_MIN}%) — insufficient volatility for grid profit`, warning: null };
  if (structure === 'Bearish' && adx > V.BEARISH_ADX_BLOCK)
    return { viable: false, reason: `Bearish structure + ADX=${adx.toFixed(1)} (>${V.BEARISH_ADX_BLOCK}): downtrend with momentum — high bot failure risk`, warning: null };

  const warnings = [];
  if (atrPct > V.ATR_WARN)    warnings.push(`ATR=${atrPct.toFixed(1)}%: elevated volatility — use Geometric mode and widen range`);
  if (rsi > V.RSI_WARN_HIGH)  warnings.push(`RSI=${rsi.toFixed(1)}: elevated — mild overbought pressure`);
  if (rsi < V.RSI_WARN_LOW)   warnings.push(`RSI=${rsi.toFixed(1)}: oversold — confirm structure before starting, price may continue lower`);
  if (structure === 'Neutral') warnings.push('Neutral market structure — range may shift; monitor closely');

  return { viable: true, reason: 'Market conditions suitable for grid bot', warning: warnings.length ? warnings.join(' | ') : null };
}

/**
 * Estimates how many days a grid should run based on range width vs daily ATR.
 * ATR is 4h-based; multiply by ~1.5 to approximate daily range.
 * @returns {{ estDays: number, label: string }}
 */
export function estimateGridDuration(rangeWidthPct, atrPct) {
  const dailyRangePct = atrPct * 1.5;
  if (dailyRangePct <= 0) return { estDays: 0, label: '—' };
  const estDays = Math.max(1, Math.min(Math.round(rangeWidthPct / dailyRangePct), 30));
  const label   = estDays <= 3 ? '1–3 days' : estDays <= 7 ? '3–7 days' : estDays <= 14 ? '1–2 weeks' : '2–4 weeks';
  return { estDays, label };
}

/**
 * Returns volatility profile per ticker symbol.
 * @returns {{ profile: string, rangeMultiplier: number, maxGrids: number }}
 */
export function getTickerGridProfile(ticker) {
  const profiles = {
    BTC:  { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    ETH:  { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    BNB:  { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    SOL:  { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    TRX:  { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    DOGE: { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    XLM:  { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    XRP:  { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    SUI:  { profile: 'volatile', rangeMultiplier: 3.5, maxGrids: 50 },
    HYPE: { profile: 'volatile', rangeMultiplier: 3.5, maxGrids: 50 },
  };
  return profiles[ticker] ?? { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 };
}

// ══════════════════════════════════════════════════════════════════
//  GRID SCORE — 0–10 composite readiness score
// ══════════════════════════════════════════════════════════════════
export function calcGridScore(m) {
  if (!m) return { score: 0, label: 'AVOID', components: [], recs: [] };

  const adx     = m.adx?.adx ?? 0;
  const bbLabel = m.bb?.label ?? 'normal';
  const bbBw    = m.bbBw ?? 0;
  const rsi     = m.rsi ?? 50;
  const fund    = Math.abs(m.funding ?? 0);  // already in % (app.js: pf.funding = rawRate * 100)
  const range   = m.gridRange;
  const poc5d   = m.poc5d  ?? 0;
  const poc14d  = m.poc14d ?? 0;
  const cvdDelta   = Math.abs(m.cvd5d ?? 0);
  const vol5d      = Math.max(m.volume5d ?? 1, 1);
  const isLateral  = (cvdDelta / vol5d) < CFG.CVD_LATERAL_RATIO;

  const components = [];
  let score = 0;

  // ADX (max 3.0)
  const adxScore = adx < 15 ? 3.0 : adx < 20 ? 2.0 : adx < 25 ? 1.0 : 0.0;
  components.push({ label: 'ADX Trend', score: adxScore, max: 3.0,
    detail: `ADX ${adx.toFixed(1)} — ${adx < 15 ? 'ideal range' : adx < 20 ? 'low' : adx < 25 ? 'mild' : 'strong trend'}` });
  score += adxScore;

  // BB Width (max 2.0)
  const bbScore = bbLabel === 'squeeze' ? 2.0 : bbLabel === 'normal' ? 1.0 : 0.0;
  components.push({ label: 'BB Width', score: bbScore, max: 2.0,
    detail: `${bbBw.toFixed(1)}% — ${bbLabel === 'squeeze' ? 'compressed ✓' : bbLabel === 'normal' ? 'normal' : 'expanded ✗'}` });
  score += bbScore;

  // CVD lateral (max 1.5)
  const cvdScore = isLateral ? 1.5 : 0.0;
  components.push({ label: 'CVD Flow', score: cvdScore, max: 1.5,
    detail: isLateral ? 'Lateral — no trend pressure ✓' : 'Directional — trend in progress ✗' });
  score += cvdScore;

  // POC in range (max 2.0)
  let pocScore = 0.0;
  let pocDetail = 'Range not computed';
  if (range?.rangeLow != null && poc5d > 0) {
    const in5  = poc5d  >= range.rangeLow && poc5d  <= range.rangeHigh;
    const in14 = poc14d >= range.rangeLow && poc14d <= range.rangeHigh;
    pocScore  = (in5 && in14) ? 2.0 : (in5 || in14) ? 1.0 : 0.0;
    pocDetail = (in5 && in14) ? 'Both POC5d+14d in range ✓'
              : (in5 || in14) ? 'One POC in range ⚠'
              : 'No POC in range — grid may miss magnet ✗';
  }
  components.push({ label: 'POC in Range', score: pocScore, max: 2.0, detail: pocDetail });
  score += pocScore;

  // RSI neutral (max 1.0)
  const rsiScore = (rsi >= 40 && rsi <= 60) ? 1.0 : (rsi >= 35 && rsi <= 65) ? 0.5 : 0.0;
  components.push({ label: 'RSI Neutral', score: rsiScore, max: 1.0,
    detail: `RSI ${rsi.toFixed(1)} — ${rsiScore === 1.0 ? 'neutral zone ✓' : rsiScore === 0.5 ? 'acceptable' : 'extreme ✗'}` });
  score += rsiScore;

  // Funding neutral (max 0.5)
  const fundScore = fund < 0.05 ? 0.5 : 0.0;
  components.push({ label: 'Funding', score: fundScore, max: 0.5,
    detail: `${(m.funding ?? 0).toFixed(3)}% — ${fundScore > 0 ? 'neutral ✓' : 'elevated ⚠'}` });
  score += fundScore;

  // Label
  const rounded = Math.round(score * 10) / 10;
  const label = rounded >= 8 ? 'STRONG SETUP'
              : rounded >= 6 ? 'GOOD SETUP'
              : rounded >= 4 ? 'DEVELOPING'
              : 'AVOID';

  // Dynamic recommendations (what's missing)
  const recs = [];
  if (adxScore < 2.0) recs.push(adx >= 25 ? 'Wait for ADX < 20 (trend too strong)' : 'ADX improving — watch for drop below 20');
  if (bbScore   < 2.0) recs.push(bbLabel === 'expanded' ? 'Wait for BB compression (squeeze)' : 'Watch for BB squeeze for optimal entry');
  if (!isLateral)      recs.push('CVD directional — wait for sideways accumulation');
  if (pocScore  < 2.0 && range?.rangeLow != null) recs.push('Consider widening range to include both POC5d and POC14d');
  if (rsiScore  < 0.5) recs.push(`RSI ${rsi.toFixed(0)} extreme — wait for 40–60 range`);
  if (fundScore === 0) recs.push('Funding elevated — crowded trade, higher liquidation risk');

  return { score: rounded, label, components, recs };
}
