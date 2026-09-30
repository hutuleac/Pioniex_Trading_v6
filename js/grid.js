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
 * Assesses whether market conditions are suitable for a grid bot.
 * All thresholds driven by GRID_CONFIG.VIABILITY for central control.
 * @returns {{ viable: boolean, reason: string, warning: string|null }}
 */
export function assessGridViability(atrPct, adx, rsi, bbBw, structure, dc20Pos = 'INSIDE') {
  const V = GRID_CONFIG.VIABILITY;

  if (adx > V.ADX_BLOCK)
    return { viable: false, reason: `ADX=${adx.toFixed(1)}: trend detected (>${V.ADX_BLOCK}) — grid bots underperform in trending markets`, warning: null };
  if (dc20Pos === 'BREAK_UP' || dc20Pos === 'BREAK_DOWN')
    return { viable: false, reason: `Donchian20 ${dc20Pos.replace('_',' ')} — price breaking range; grid likely to get stuck on one side`, warning: null };
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
 * Returns volatility profile per ticker symbol.
 * rangeMultiplier = half-width of the grid range in daily σ units (σ from ATR, see dailySigmaPct)
 * @returns {{ profile: string, rangeMultiplier: number }}
 */
export function getTickerGridProfile(ticker) {
  const profiles = {
    BTC:  { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    ETH:  { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    BNB:  { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    SOL:  { profile: 'moderate', rangeMultiplier: 3.0 },
    TRX:  { profile: 'moderate', rangeMultiplier: 3.0 },
    DOGE: { profile: 'moderate', rangeMultiplier: 3.0 },
    XLM:  { profile: 'moderate', rangeMultiplier: 3.0 },
    XRP:  { profile: 'moderate', rangeMultiplier: 3.0 },
    SUI:  { profile: 'volatile', rangeMultiplier: 3.5 },
    HYPE: { profile: 'volatile', rangeMultiplier: 3.5 },
  };
  return profiles[ticker] ?? { profile: 'moderate', rangeMultiplier: 3.0 };
}

// ══════════════════════════════════════════════════════════════════
//  GRID SCORE — 0–10 composite readiness score
// ══════════════════════════════════════════════════════════════════
export function calcGridScore(m, plan) {
  if (!m || !plan) return { score: 0, components: [], recs: [] };

  const V       = GRID_CONFIG.VIABILITY;
  const LAT     = GRID_CONFIG.CVD_LATERAL;
  const adx     = m.adx?.adx ?? 0;
  const bbLabel = m.bb?.label ?? 'normal';
  const bbBw    = m.bbBw ?? 0;
  const rsi     = m.rsi ?? 50;
  const fund    = Math.abs(m.funding ?? 0);  // already in % (app.js: pf.funding = rawRate * 100)
  const poc5d   = m.poc5d  ?? 0;
  const poc14d  = m.poc14d ?? 0;
  const cvdDelta = Math.abs(m.cvd5d ?? 0);
  const vol5d    = Math.max(m.volume5d ?? 1, 1);
  const cvdRatio = cvdDelta / vol5d;

  const components = [];
  let score = 0;

  // ADX (max 3.0) — unified thresholds via VIABILITY.ADX_IDEAL/ADX_BLOCK
  const adxScore = adx < V.ADX_IDEAL       ? 3.0
                 : adx < V.ADX_IDEAL + 4   ? 2.0   // 18–22 mild
                 : adx < V.ADX_BLOCK + 3   ? 1.0   // 22–25 caution
                 : 0.0;
  components.push({ label: 'ADX Trend', score: adxScore, max: 3.0,
    detail: `ADX ${adx.toFixed(1)} — ${adx < V.ADX_IDEAL ? `ideal (<${V.ADX_IDEAL})` : adx < V.ADX_BLOCK ? 'mild' : 'trending ✗'}` });
  score += adxScore;

  // BB Width (max 1.0) — reduced from 2.0; overlap with DC Squeeze is intentional
  const bbScore = bbLabel === 'squeeze' ? 1.0 : bbLabel === 'normal' ? 0.5 : 0.0;
  components.push({ label: 'BB Width', score: bbScore, max: 1.0,
    detail: `${bbBw.toFixed(1)}% — ${bbLabel === 'squeeze' ? 'compressed ✓' : bbLabel === 'normal' ? 'normal' : 'expanded ✗'}` });
  score += bbScore;

  // Squeeze (max 1.5) — per-coin percentile (see calcSqueeze)
  const sq = m.squeeze ?? { squeezed: false, bwRank: 50, dcAtrRank: 50 };
  const partial = sq.bwRank <= CFG.SQUEEZE.PCTL || sq.dcAtrRank <= CFG.SQUEEZE.PCTL;
  const dqScore = sq.squeezed ? 1.5 : partial ? 0.75 : 0.0;
  components.push({ label: 'Squeeze', score: dqScore, max: 1.5,
    detail: `BB width p${Math.round(sq.bwRank)} · DC20/ATR p${Math.round(sq.dcAtrRank)} (squeeze ≤ p${CFG.SQUEEZE.PCTL})` });
  score += dqScore;

  // CVD lateral (max 1.5) — gradient replaces binary cliff
  let cvdScore, cvdDetail;
  if (cvdRatio <= LAT.FULL_SCORE_BELOW) {
    cvdScore = 1.5;
    cvdDetail = `Lateral (${cvdRatio.toFixed(2)} ≤ ${LAT.FULL_SCORE_BELOW}) — no trend pressure ✓`;
  } else if (cvdRatio >= LAT.ZERO_SCORE_ABOVE) {
    cvdScore = 0.0;
    cvdDetail = `Directional (${cvdRatio.toFixed(2)} ≥ ${LAT.ZERO_SCORE_ABOVE}) — trend in progress ✗`;
  } else {
    const t = (LAT.ZERO_SCORE_ABOVE - cvdRatio) / (LAT.ZERO_SCORE_ABOVE - LAT.FULL_SCORE_BELOW);
    cvdScore = Math.round(t * 1.5 * 10) / 10;
    cvdDetail = `Mixed (${cvdRatio.toFixed(2)}) — partial lateral`;
  }
  components.push({ label: 'CVD Flow', score: cvdScore, max: 1.5, detail: cvdDetail });
  score += cvdScore;

  // POC in range (max 2.0)
  let pocScore = 0.0;
  let pocDetail = 'Range not computed';
  if (plan.lower != null && poc5d > 0) {
    const in5  = poc5d  >= plan.lower && poc5d  <= plan.upper;
    const in14 = poc14d >= plan.lower && poc14d <= plan.upper;
    pocScore  = (in5 && in14) ? 2.0 : (in5 || in14) ? 1.0 : 0.0;
    pocDetail = (in5 && in14) ? 'Both POC5d+14d in range ✓'
              : (in5 || in14) ? 'One POC in range ⚠'
              : 'No POC in range — grid may miss magnet ✗';
  }
  components.push({ label: 'POC in Range', score: pocScore, max: 2.0, detail: pocDetail });
  score += pocScore;

  // RSI neutral (max 1.0) — kept
  const rsiScore = (rsi >= 40 && rsi <= 60) ? 1.0 : (rsi >= 35 && rsi <= 65) ? 0.5 : 0.0;
  components.push({ label: 'RSI Neutral', score: rsiScore, max: 1.0,
    detail: `RSI ${rsi.toFixed(1)} — ${rsiScore === 1.0 ? 'neutral zone ✓' : rsiScore === 0.5 ? 'acceptable' : 'extreme ✗'}` });
  score += rsiScore;

  // Funding neutral (max 0.5)
  const fundScore = fund < 0.05 ? 0.5 : 0.0;
  components.push({ label: 'Funding', score: fundScore, max: 0.5,
    detail: `${(m.funding ?? 0).toFixed(3)}% — ${fundScore > 0 ? 'neutral ✓' : 'elevated ⚠'}` });
  score += fundScore;

  const rounded = Math.round(score * 10) / 10;

  // Dynamic recommendations (what's missing)
  const recs = [];
  if (adxScore < 2.0) recs.push(adx >= V.ADX_BLOCK ? `Wait for ADX < ${V.ADX_IDEAL} (trend too strong)` : `ADX improving — watch for drop below ${V.ADX_IDEAL}`);
  if (bbScore   < 1.0) recs.push(bbLabel === 'expanded' ? 'Wait for BB compression (squeeze)' : 'Watch for BB squeeze for optimal entry');
  if (dqScore   < 1.5) recs.push(dqScore === 0 ? 'No squeeze: price not range-compressed — grid edge unclear' : 'Partial squeeze — wait for both BB + DC20 to tighten');
  if (cvdRatio > LAT.FULL_SCORE_BELOW) recs.push(`CVD ratio ${cvdRatio.toFixed(2)} — wait for drop below ${LAT.FULL_SCORE_BELOW} (lateral flow)`);
  if (pocScore  < 2.0 && plan.lower != null) recs.push('Consider widening range to include both POC5d and POC14d');
  if (rsiScore  < 0.5) recs.push(`RSI ${rsi.toFixed(0)} extreme — wait for 40–60 range`);
  if (fundScore === 0) recs.push('Funding elevated — crowded trade, higher liquidation risk');
  if (['BREAK_UP','BREAK_DOWN'].includes(m.dc20Pos)) recs.push(`Donchian20 ${m.dc20Pos.replace('_',' ')} — breakout in progress, defer grid`);

  return { score: rounded, components, recs };
}

// ══════════════════════════════════════════════════════════════════
//  GRID ENGINE v7 — every number derives from the explicit level array
// ══════════════════════════════════════════════════════════════════

// 4H ATR% → daily σ% (random walk: 6 four-hour bars per day)
export function dailySigmaPct(atrPct) { return atrPct * Math.sqrt(6); }

// Range = ±mult·σ_daily around price; Long/Short skew the same total width below/above price.
export function calcRange(price, sigmaPct, mult, side = 'Neutral') {
  const h = sigmaPct / 100 * mult;
  const [dn, up] = side === 'Long' ? [1.5, 0.5] : side === 'Short' ? [0.5, 1.5] : [1, 1];
  const lower = Math.max(price * (1 - h * dn), price * 0.1);   // never ≤ 0 on extreme volatility
  const upper = price * (1 + h * up);
  return { lower, upper, widthPct: (upper - lower) / lower * 100 };
}

export function gridLevels(lower, upper, n, geometric) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(geometric ? lower * Math.pow(upper / lower, i / n) : lower + (upper - lower) * i / n);
  return out;
}

// Net profit per completed buy→sell step, both sides' fees deducted. Arithmetic: max at bottom, min at top.
export function profitPerGrid(levels, fee) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < levels.length - 1; i++) {
    const g = levels[i + 1] / levels[i] - 1 - 2 * fee;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  return { min, max };
}

// Largest grid count whose WORST step still nets ≥ target. Returns minN when even that fails (verdict blocks it).
export function recommendGridCount(lower, upper, geometric, fee, target, [minN, maxN]) {
  let best = minN;
  for (let n = minN; n <= maxN; n++) {
    if (profitPerGrid(gridLevels(lower, upper, n, geometric), fee).min >= target) best = n;
    else break;
  }
  return best;
}

// Spot grid: slots above price start as coin bought at price; slots below buy at their level on the way down.
export function spotRisk(levels, price, capital, stop) {
  const n = levels.length - 1, slice = capital / n;
  let coins = 0;
  for (let i = 0; i < n; i++) coins += slice / (levels[i] >= price ? price : levels[i]);
  const lossAtSL = capital - coins * stop;
  return { coins, avgEntry: capital / coins, lossAtSL, lossPct: lossAtSL / capital, breakEven: capital / coins };
}

// Futures grid, isolated margin = capital. Each leg assumes every level fills on the way to that stop.
// Long liq:  capital + Q(P−E) = mmr·Q·P  →  P = (Q·E − capital) / (Q(1−mmr))
// Short liq: capital + Q(E−P) = mmr·Q·P  →  P = (Q·E + capital) / (Q(1+mmr))
export function futuresRisk(levels, price, capital, leverage, side, mmr, stopDown, stopUp) {
  const n = levels.length - 1, slice = capital * leverage / n;
  const leg = dir => {
    let qty = 0, cost = 0;
    for (let i = 0; i < n; i++) {
      const px = dir === 'down'
        ? (levels[i] < price ? levels[i] : side === 'Long' ? price : null)
        : (levels[i + 1] > price ? levels[i + 1] : side === 'Short' ? price : null);
      if (px == null) continue;
      qty += slice / px; cost += slice;
    }
    if (!qty) return null;
    const avgEntry = cost / qty;
    const liq = dir === 'down' ? (cost - capital) / (qty * (1 - mmr)) : (cost + capital) / (qty * (1 + mmr));
    const stop = dir === 'down' ? stopDown : stopUp;
    return { qty, avgEntry, liq: Math.max(0, liq), stop,
             liqBeforeStop: dir === 'down' ? liq >= stop : liq <= stop,
             lossAtStop: Math.abs(stop - avgEntry) * qty };
  };
  return { down: side === 'Short' ? null : leg('down'), up: side === 'Long' ? null : leg('up') };
}

// Expected first-exit time of a random walk from price inside [lower, upper]: (P−L)(U−P)/σ², in days.
export function expectedDaysInRange(lower, upper, price, sigmaPct) {
  const s = price * sigmaPct / 100;
  return s > 0 ? Math.max(0, (price - lower) * (upper - price) / (s * s)) : 0;
}

// Futures side from BIAS (macro direction confirmed by 30d structure), never from setup quality.
export function selectFuturesSide(m, direction) {
  const adx = m.adx?.adx ?? 0;
  if (adx >= GRID_CONFIG.VIABILITY.ADX_BLOCK) return 'Neutral';
  if (direction === 'LONG'  && m.structure30d === 'Bullish') return 'Long';
  if (direction === 'SHORT' && m.structure30d === 'Bearish') return 'Short';
  return 'Neutral';
}

export function calcGridPlan(m, profile, direction, s) {
  const futures = s.mode === 'futures';
  const side    = futures ? selectFuturesSide(m, direction) : 'Neutral';
  const sigma   = dailySigmaPct(m.atrPct ?? 1);
  const range   = calcRange(m.price, sigma, profile.rangeMultiplier, side);
  const geometric = range.widthPct >= GRID_CONFIG.GEOMETRIC_THRESHOLD_PCT;
  const fee     = futures ? s.feeFutures : s.feeSpot;
  const count   = recommendGridCount(range.lower, range.upper, geometric, fee, GRID_CONFIG.TARGET_NET_PCT, GRID_CONFIG.GRID_LIMITS[s.mode]);
  const levels  = gridLevels(range.lower, range.upper, count, geometric);
  const pad     = GRID_CONFIG.STOP_ATR_MULT * (m.atr ?? 0);
  const stopDown = Math.max(range.lower - pad, range.lower * 0.5);
  const stopUp   = range.upper + pad;
  const short    = futures && side === 'Short';
  return {
    mode: s.mode, side, ...range, geometric, count, levels, fee,
    profit: profitPerGrid(levels, fee),
    sl: short ? stopUp : stopDown,
    tp: short ? stopDown : stopUp,
    risk: futures ? futuresRisk(levels, m.price, s.capital, s.leverage, side, GRID_CONFIG.MMR, stopDown, stopUp)
                  : spotRisk(levels, m.price, s.capital, stopDown),
    leverage: futures ? s.leverage : 1,
    capital: s.capital,
    daysInRange: expectedDaysInRange(range.lower, range.upper, m.price, sigma),
  };
}

export const VERDICT_RANK = { GRID_NOW: 0, DEVELOPING: 1, WAIT: 2, BLOCKED: 3 };

// One answer per coin: hard blockers override the score.
export function calcGridVerdict(m, plan) {
  const gs = calcGridScore(m, plan);
  const v  = assessGridViability(m.atrPct ?? 0, m.adx?.adx ?? 0, m.rsi ?? 50, m.bbBw ?? 0, m.structure4h, m.dc20Pos);
  const blocks = [];
  if (!v.viable) blocks.push(v.reason);
  if (plan.profit.min < GRID_CONFIG.MIN_NET_PCT)
    blocks.push(`Profit/grid ${(plan.profit.min * 100).toFixed(2)}% < ${(GRID_CONFIG.MIN_NET_PCT * 100).toFixed(1)}% min after fees — range too narrow`);
  if (plan.mode === 'futures' && (plan.risk?.down?.liqBeforeStop || plan.risk?.up?.liqBeforeStop))
    blocks.push(`Liquidation before stop at ${plan.leverage}× — lower the leverage`);
  const T = GRID_CONFIG.VERDICT;
  const verdict = blocks.length ? 'BLOCKED' : gs.score >= T.NOW ? 'GRID_NOW' : gs.score >= T.DEVELOPING ? 'DEVELOPING' : 'WAIT';
  return { verdict, score: gs.score, reason: blocks[0] ?? v.warning ?? '', blocks, components: gs.components, recs: gs.recs };
}

export function sortGridEntries(entries) {
  return [...entries].sort((a, b) =>
    VERDICT_RANK[a.verdict.verdict] - VERDICT_RANK[b.verdict.verdict] || b.verdict.score - a.verdict.score);
}
