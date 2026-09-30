'use strict';

// ══════════════════════════════════════════════════════════════════
//  CONFIG  (mirrors Trading.py CFG class)
// ══════════════════════════════════════════════════════════════════
export const CFG = {
  APP_VERSION          : '6.5',
  REFRESH_INTERVAL_SEC : 1200,
  OI_PERIOD            : "4h",  OI_LIMIT              : 42,
  KLINES_MAIN          : 499,   // 4H×499 (Binance weight 2 below 500) — one fetch; 5d/14d/30d are slices
  KLINES_FVG           : 100,   // last 100 candles for FVG detection
  KLINES_5D            : 30,    KLINES_14D : 84,   KLINES_30D : 180,
  FLOW_LIMIT           : 24,
  RSI_PERIOD           : 14,    ATR_PERIOD : 14,
  EMA_FAST             : 50,    EMA_SLOW   : 200,
  STRUCT_LOOKBACK_4H   : 40,    STRUCT_K_4H : 2,   STRUCT_K_30D : 5,   // pivot = extreme vs k bars each side
  SWEEP_LOOKBACK       : 20,
  FVG_MAX_GAPS         : 5,
  POC_BINS             : 24,
  DONCHIAN_PERIOD_SHORT: 20,    DONCHIAN_PERIOD_LONG: 55,
  SQUEEZE: { PCTL: 20, HISTORY: 300 },   // squeeze = BB width AND DC20/ATR both in this coin's lowest 20% of the last 300 candles
  RSI_OB: 70, RSI_OS: 30, RSI_EXTREME_OB: 75, RSI_EXTREME_OS: 25,
  FLOW_STRONG: 5.0, FLOW_PARTIAL: 2.0,
  OI_SQUEEZE_HIGH: 10.0, OI_SQUEEZE_MED: 5.0,
  POC_NEAR_PCT: 0.5, FVG_NEAR_PCT: 1.0, FVG_ENTRY_PCT: 2.0, POC_CONFLUENCE_PCT: 1.0,
  VOL_SPIKE_MULT: 2.0, VOL_AVG_WINDOW: 20,
  SCORE_ACTIVE: 7.5, CVD_LATERAL_RATIO: 0.2,
  GRID_BUFFER: 0.02,
};

export const BINANCE_BASE = "https://fapi.binance.com";
export const BYBIT_BASE   = "https://api.bybit.com";

export const BB_INT = { '4h':'240', '1h':'60', '15m':'15', '5m':'5', '1d':'D' };

// ══════════════════════════════════════════════════════════════════
//  GRID BOT CONFIG
// ══════════════════════════════════════════════════════════════════
export const GRID_CONFIG = {
  DEFAULT_CAPITAL        : 500,
  FEES                   : { spot: 0.0005, futures: 0.0005 },  // per side. Pionex spot 0.05% (published); futures unverified
  DEFAULT_LEVERAGE       : 3,
  MMR                    : 0.005,  // maintenance margin rate used for the liquidation estimate
  GRID_LIMITS            : { spot: [2, 150], futures: [2, 500] },  // futures from Pionex FAQ; spot unverified
  STOP_ATR_MULT          : 2.0,    // grid SL/TP sit this many 4H ATRs beyond the range
  TARGET_NET_PCT         : 0.005,  // grid count targets ≥0.5% net on the WORST step
  MIN_NET_PCT            : 0.003,  // below this worst-step net profit the plan is blocked
  VERDICT                : { NOW: 7.0, DEVELOPING: 5.0 },   // grid score thresholds
  GEOMETRIC_THRESHOLD_PCT: 20,     // use Geometric mode if range > 20%

  // Viability block/warn thresholds — tightened for conservative grid selection
  VIABILITY: {
    ADX_IDEAL        : 18,   // full score below this in calcGridScore (ranging)
    ADX_BLOCK        : 22,   // block if ADX above this (trending market)
    RSI_BLOCK        : 68,   // block if RSI above this (overbought)
    BB_MIN           : 2.0,  // block if BB bandwidth below this (compressed)
    BEARISH_ADX_BLOCK: 18,   // block if Bearish structure + ADX above this
    ATR_WARN         : 4.5,  // warn if ATR% above this (high volatility)
    RSI_WARN_HIGH    : 58,   // warn if RSI above this (elevated pressure)
    RSI_WARN_LOW     : 32,   // warn if RSI below this (oversold risk)
  },

  // CVD laterality gradient (replaces binary CFG.CVD_LATERAL_RATIO cliff)
  CVD_LATERAL: {
    FULL_SCORE_BELOW : 0.15,  // ratio ≤ 0.15 → full CVD weight
    ZERO_SCORE_ABOVE : 0.30,  // ratio ≥ 0.30 → no CVD weight (linear ramp between)
  },
};

export const LEGENDS = [
  ["Grid verdict",
    `One answer per coin for the selected grid type. GRID NOW = score ≥ ${GRID_CONFIG.VERDICT.NOW}. DEVELOPING = ≥ ${GRID_CONFIG.VERDICT.DEVELOPING}. WAIT = below. BLOCKED = a hard rule failed: trending market (ADX), Donchian breakout, RSI overbought, profit/grid below the minimum after fees, or futures liquidation before the stop. Blocked coins always sort last and show the reason.`],
  ["Profit / grid",
    `Net profit of one completed buy→sell step after paying the fee on both sides. Shown as min–max: arithmetic grids earn most at the bottom and least at the top; geometric grids earn the same on every step. Grid count is the largest count whose worst step still nets ≥ 0.5%.`],
  ["Expected days in range",
    `Random-walk estimate of how long price stays inside the range: (P−Lower)·(Upper−P) / σ², with σ the daily volatility (4H ATR% × √6). A typical value, not a guarantee — trends leave sooner.`],
  ["Spot drawdown",
    `Walks the real grid: slots above price start as coin bought at the current price, slots below buy at their level on the way down. Loss at stop = investment − coins × stop price. Break-even ignores grid profit already earned.`],
  ["Liquidation (futures)",
    `Isolated-margin estimate after every level fills on the way to the stop, using ${GRID_CONFIG.MMR * 100}% maintenance margin. If liquidation would come before the stop the coin is BLOCKED — lower the leverage. Always confirm Pionex's own estimate before creating.`],
  ["RSI (14)",
    `4H momentum. >70 overbought, <30 oversold. Direction score penalty −0.5 only when RSI fights the bias: >${CFG.RSI_EXTREME_OB} on a LONG, <${CFG.RSI_EXTREME_OS} on a SHORT.`],
  ["ATR (14)",
    `4H volatility in price units. Daily σ ≈ ATR% × √6 sets the grid range width and expected days in range. Grid SL/TP sit 2 ATR beyond the range.`],
  ["Flow% 24h",
    `(Taker buy − taker sell) / total volume over the last 24 one-hour candles. >+${CFG.FLOW_STRONG}% strong buying, <−${CFG.FLOW_STRONG}% strong selling.`],
  ["POC 5d/14d/30d",
    `Price with the most traded volume. Each candle's volume is spread across its high–low range (${CFG.POC_BINS} bins). POC confluence (5d ≈ 14d within ${CFG.POC_CONFLUENCE_PCT}%) adds +0.5 when a bias exists.`],
  ["AVWAP 5d/14d/30d",
    `Volume-weighted typical price (H+L+C)/3 anchored at the start of each window. Price above = buyers in profit on average.`],
  ["CVD 5d/14d/30d",
    `Cumulative taker buy − sell volume per window. ACC = positive, DIS = negative. On the Bybit fallback, buy volume is estimated from where the candle closed in its range.`],
  ["EMA 50/200",
    `SMA-seeded exponential averages on ~500 4H candles. Price > EMA50 > EMA200 = uptrend; the reverse = downtrend.`],
  ["ADX (14)",
    `Trend strength, not direction. <18 ranging (grid-friendly), >22 trending (grids blocked).`],
  ["Structure 4H / 30d",
    `Swing pivots: a pivot high beats the ${CFG.STRUCT_K_4H} candles on each side (4H, last ${CFG.STRUCT_LOOKBACK_4H} closed candles) or ${CFG.STRUCT_K_30D} each side (30d, ${CFG.KLINES_30D} candles). Bullish = higher high + higher low. Bearish = lower high + lower low. 4H vs 30d conflict −0.5.`],
  ["OI 7d",
    `Open-interest % change over 42 four-hour periods. OI↑ with price↑ = new longs; OI↑ with price↓ = new shorts (squeeze fuel).`],
  ["FVG",
    `Fair value gap: a 3-candle imbalance still unfilled in the last ${CFG.KLINES_FVG} 4H candles. ★ = 4H structure agrees with the gap.`],
  ["Liquidity sweep",
    `The last closed 4H candle pokes beyond the prior ${CFG.SWEEP_LOOKBACK}-candle extreme and closes back inside. HIGH_SWEEP = trapped buyers above the high (bearish). LOW_SWEEP = trapped sellers below the low (bullish).`],
  ["Donchian 20/55",
    `Highest high / lowest low of the prior closed 4H candles. BREAK_UP / BREAK_DOWN = live price outside the channel — blocks grids.`],
  ["Squeeze",
    `Relative to the coin's own history: Bollinger width AND DC20 width/ATR both in this coin's lowest ${CFG.SQUEEZE.PCTL}th percentile of the last ${CFG.SQUEEZE.HISTORY} candles. Squeeze Conf 0–100 = 100 − their average percentile.`],
  ["Regime",
    `SQUEEZE · TRENDING ↑/↓ (ADX ≥ 22 + Donchian break + EMA50 side) · EXPANSION (break + wide bands) · RANGING (ADX < 18 inside DC20) · MIXED.`],
  ["Bollinger Bands (20)",
    `20-period SMA ± 2σ. Bandwidth % = (upper − lower) / mid.`],
  ["MACD (12/26/9)",
    `EMA12 − EMA26, signal EMA9, histogram = MACD − signal. Positive = bullish momentum.`],
  ["Direction score 0–10",
    `Context for grid side selection, not trade entries. Trend Macro +2 · Pressure +2 · Setup +2 · Trend Swing +1.5 · CVD quality +1.5 · FVG +0.5 · POC confluence +0.5 · EMA ±0.25 · Funding +0.3/−0.5. No bias = no setup points. ≥ ${CFG.SCORE_ACTIVE} = strong bias.`],
];

// ── User settings (localStorage, private-mode safe) ───────────────
const SETTINGS_KEY = 'cim_settings';
export function getSettings() {
  let s = {}, legacyCap = NaN;
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch {}
  try { legacyCap = parseFloat(localStorage.getItem('gridCapital')); } catch {}
  const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
  return {
    capital:    num(s.capital, num(legacyCap, GRID_CONFIG.DEFAULT_CAPITAL)),
    leverage:   num(s.leverage, GRID_CONFIG.DEFAULT_LEVERAGE),
    feeSpot:    num(s.feeSpot, GRID_CONFIG.FEES.spot),
    feeFutures: num(s.feeFutures, GRID_CONFIG.FEES.futures),
    mode:       s.mode === 'futures' ? 'futures' : 'spot',
  };
}
export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
  return next;
}
export const getGridCapital = () => getSettings().capital;
export const setGridCapital = v => setSettings({ capital: +v });
