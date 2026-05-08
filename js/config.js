'use strict';

// ══════════════════════════════════════════════════════════════════
//  CONFIG  (mirrors Trading.py CFG class)
// ══════════════════════════════════════════════════════════════════
export const CFG = {
  APP_VERSION          : '6.4',
  REFRESH_INTERVAL_SEC : 1200,
  OI_PERIOD            : "4h",  OI_LIMIT              : 42,
  KLINES_MAIN          : 210,   // 4H×210 — enough for EMA200 + 100 FVG candles
  KLINES_FVG           : 100,   // last 100 candles for FVG detection
  KLINES_5D            : 30,    KLINES_14D : 84,   KLINES_30D : 180,
  FLOW_LIMIT           : 24,
  RSI_PERIOD           : 14,    ATR_PERIOD : 14,
  EMA_FAST             : 50,    EMA_SLOW   : 200,
  STRUCT_LOOKBACK_4H   : 20,    STRUCT_LOOKBACK_30D : 40,
  FVG_MAX_GAPS         : 5,
  DONCHIAN_PERIOD_SHORT: 20,    DONCHIAN_PERIOD_LONG: 55,
  DONCHIAN_BREAK_BUFFER_PCT: 0.25,   // % of mid, anti-flap buffer at band edges
  SQUEEZE: { BB_WIDTH_MAX: 5.0, DC_ATR_RATIO_MAX: 1.0 },
  RSI_OB: 70, RSI_OS: 30, RSI_EXTREME_OB: 75, RSI_EXTREME_OS: 25,
  FLOW_STRONG: 5.0, FLOW_PARTIAL: 2.0,
  OI_SQUEEZE_HIGH: 10.0, OI_SQUEEZE_MED: 5.0,
  POC_NEAR_PCT: 0.5, FVG_NEAR_PCT: 1.0, FVG_ENTRY_PCT: 2.0, POC_CONFLUENCE_PCT: 1.0,
  VOL_SPIKE_MULT: 2.0, VOL_AVG_WINDOW: 20,
  SCORE_BOT_MIN: 7.5, CVD_LATERAL_RATIO: 0.2,
  SL_ATR_MULT: 1.5, TP1_ATR_MULT: 3.0, TP2_ATR_MULT: 5.25,
  TRAIL_OFFSET_MULT: 0.5, GRID_BUFFER: 0.02,
};

export const BINANCE_BASE = "https://fapi.binance.com";
export const BYBIT_BASE   = "https://api.bybit.com";

export const BB_INT = { '4h':'240', '1h':'60', '15m':'15', '5m':'5', '1d':'D' };

// ── Static category tooltips for signal cards ─────────────────────
export const SIG_TIPS = {
  'Trend Macro':     'Long-term direction (30d context). Checks 4 conditions: price vs AVWAP14d, price vs AVWAP30d, CVD30d positive/negative, Structure30d bullish/bearish. 3 of 4 = full score (+2.0). 2 of 4 = partial (+0.8). This signal sets LONG vs SHORT direction for all other components.',
  'Trend Swing':     'Short-term momentum (5d context). BULLISH = price > AVWAP5d + CVD5d accumulating + 24h flow positive. BEARISH = opposite. DIV signals = price and CVD disagree — warns of reversal. Adds +1.5 when aligned with Trend Macro, −0.5 when contra.',
  'Presiune':        'Market pressure — who controls order flow right now. BUY STRONG = positive flow + OI 7d rising + CVD5d ACC (all 3 aligned). SELL STRONG = opposite. SHORT ACTIVE = negative flow but OI rising = new shorts opening. SQUEEZE RISK = positive flow + OI falling = shorts being flushed, potential spike.',
  'Calitate Trend':  'CVD alignment quality across all 3 horizons (5d / 14d / 30d). FULL ACCUM = all positive = strongest bull confirmation. FULL DISTRIB = all negative = robust bear. BOUNCE/BEAR = recent ACC in macro bear — caution, may not hold. PULLBACK/BULL = recent DIS in macro bull — potential re-entry.',
  'Setup':           'Entry confluence quality. LONG/SHORT VALID = liquidity sweep (stop hunt) + confirming flow + OI = best setup (+2.0). @ POC5d = price at key volume node + CVD aligned + AVWAP = secondary entry (+1.0). Swing14d = weaker 14d S/R setup (+0.5). WAIT = no active confluence.',
  'Risc':            'Risk assessment. HIGH = RSI extreme (>70 or <30) AND flow extreme simultaneously — stretched conditions. MEDIUM = 4H vs 30d structure conflict (direction unclear) OR flow + OI both accelerating at once. LOW = no extremes detected, normal conditions.',
  'Bot Grid':        'Spot grid bot suitability. RECOMMENDED = CVD5d is lateral (low momentum ratio) + no strong directional flow present — sideways market ideal for grids. POSSIBLE = both timeframe structures neutral. AVOID = active directional trend — a trending market will breach the grid range. See Grid Bot Advisor for parameters.',
  'FVG':             'Fair Value Gap — institutional price imbalance on 4H. Created when 3 consecutive candles leave an unfilled gap. ★ = 4H market structure confirms the gap direction (higher confidence). FILLING = price is currently inside the gap. BULL FVG = acts as support when revisited from above. BEAR FVG = acts as resistance from below.',
  'EMA Trend':       'EMA50 vs EMA200 on 4H (golden / death cross). BULL = price > EMA50 > EMA200 = confirmed uptrend. BEAR = price < EMA50 < EMA200 = confirmed downtrend. BULL/PULLBACK = golden cross but price dipped below EMA50 — potential re-entry zone. BEAR/BOUNCE = death cross but price above EMA50 — likely temporary recovery.',
  'Vol Spike':       'Volume spike vs 20-candle average on 4H. BULL SPIKE = ≥2× average + price above AVWAP5d = breakout confirmation. BEAR SPIKE = ≥2× average + price below AVWAP5d = breakdown confirmation. ELEVATED = 1.5–2× average, watch direction. NORMAL = volume unremarkable.',
};

// ── Indicator glossary entries (reference CFG values directly) ────
export const LEGENDS = [
  ["RSI (14)",
    `Relative Strength Index on 4H. Measures price momentum. >70 = overbought (price stretched, pullback likely). <30 = oversold (potential bounce zone). Extreme levels >75 or <25 trigger a −0.5 score penalty. 4H RSI carries far more weight than 1H RSI — use for setup timing, not micro-entries.`],
  ["ATR (14)",
    `Average True Range on 4H. Measures volatility in price units. Drives SL sizing: SL = Entry ± ${CFG.SL_ATR_MULT}×ATR. ATR% column shows ATR as % of price — >4–5% = high volatility, >5% blocks bot activation. 4H ATR is typically 3–5× larger than 1H ATR for the same asset.`],
  ["Flow% 24h",
    `Buy/sell order flow over last 24 one-hour candles. Formula: (BuyVol − SellVol) / TotalVol × 100. >+${CFG.FLOW_STRONG}% = strong buy dominant. <−${CFG.FLOW_STRONG}% = strong sell dominant. >${CFG.FLOW_PARTIAL}% / <−${CFG.FLOW_PARTIAL}% = partial signal. Combines with OI and CVD for Pressure signal.`],
  ["POC 5d/14d/30d",
    `Point of Control — price level with the highest traded volume over each window. Price above POC = it acts as support. Price below = resistance. POC Confluence [YES] = POC5d ≈ POC14d within ${CFG.POC_CONFLUENCE_PCT}% = strong multi-timeframe S/R zone → adds +0.5 to score.`],
  ["AVWAP 5d/14d/30d",
    `Anchored VWAP — volume-weighted average price anchored at the start of each window. Tracks where the average participant entered. Price above all 3 AVWAPs = macro bullish. Below all 3 = macro bearish. AVWAP14d and AVWAP30d form the backbone of Trend Macro. AVWAP5d drives Trend Swing.`],
  ["CVD 5d/14d/30d",
    `Cumulative Volume Delta — net buyer volume minus seller volume over each window. [ACC] = buyers dominating (positive CVD). [DIS] = sellers dominating (negative CVD). FULL ACCUM = ACC on all 3 horizons = highest-confidence bull signal (+1.0). FULL DISTRIB = all negative = robust bear. Divergence (e.g. price rising but CVD DIS) warns of weak moves.`],
  ["EMA 50/200",
    `Exponential Moving Averages on 4H. EMA50 > EMA200 = golden cross (uptrend). EMA50 < EMA200 = death cross (downtrend). BULL/PULLBACK = golden cross but price dipped below EMA50 — potential re-entry zone. BEAR/BOUNCE = death cross but price above EMA50 — likely a temporary recovery. EMA alignment adds +0.5 or −0.5 to score.`],
  ["ADX (14)",
    `Average Directional Index on 4H. Measures trend strength, not direction. <18 = ranging market (grid-friendly). 18–22 = developing trend. >22 = confirmed trend (directional trades preferred, avoid grids). +DI > −DI = bulls in control. −DI > +DI = bears in control. Key input for Regime and grid viability checks.`],
  ["Vol Spike",
    `Volume spike vs ${CFG.VOL_AVG_WINDOW}-candle average on 4H. ≥${CFG.VOL_SPIKE_MULT}× average = spike. BULL SPIKE = spike + price above AVWAP5d = breakout confirmation. BEAR SPIKE = spike + price below AVWAP5d = breakdown. ELEVATED = 1.5–2× average, direction unclear. Flat volume on a strong price move = weak conviction.`],
  ["Structure 4H/30d",
    `Market structure: Bullish = Higher Highs + Higher Lows. Bearish = Lower Highs + Lower Lows. Neutral = transitioning or choppy. 30d structure = macro trend context. 4H structure = near-term momentum. Conflict between 4H and 30d = elevated risk and triggers −0.5 score penalty. Check both before entering.`],
  ["OI / OI% 7d",
    `Open Interest = total outstanding futures contracts. OI↑ + Price↑ = new longs entering = genuine bull. OI↑ + Price↓ = new shorts piling in = squeeze risk if reversed. OI↓ + Price↑ = short covering rally (less reliable). OI↓ + Price↓ = real bear (long liquidations). OI% 7d is the 7-day % change — used in Pressure scoring and squeeze risk penalties.`],
  ["FVG (Fair Value Gap)",
    `Institutional price imbalance on 4H. Created when 3 consecutive candles leave an unfilled gap (candle 1 high < candle 3 low = Bull FVG; candle 1 low > candle 3 high = Bear FVG). ★ = 4H structure confirms the gap direction (higher reliability). FILLING = price is inside the gap. BULL FVG = support zone when revisited. BEAR FVG = resistance. Up to 5 intact gaps tracked, sorted by proximity.`],
  ["Liquidity Sweep",
    `Detects when the current 4H candle pierces the all-time high or low of all prior candles in the dataset, then closes back inside. BUY_SWP = low swept then closed above = trapped shorts flushed, potential LONG entry. SELL_SWP = high swept then closed below = trapped longs flushed, potential SHORT. Strongest setup when combined with a nearby FVG. Triggers the Setup LONG/SHORT VALID signal (+2.0).`],
  ["Donchian 20/55",
    `Donchian Channel: highest high and lowest low over N 4H candles. DC20 (20-period) = short-term range. DC55 (55-period) = macro range. INSIDE = price within range = ranging conditions. BREAK_UP = price near/above top (${CFG.DONCHIAN_BREAK_BUFFER_PCT}% buffer). BREAK_DOWN = price near/below bottom. DC20 INSIDE adds −0.25 score penalty (range indecision for directional trades). Used with ADX to classify Regime.`],
  ["Regime",
    `Composite market state derived from ADX + Bollinger Bands + Donchian. SQUEEZE = BB narrow + DC20 range tight → coiling, breakout imminent. TRENDING_UP = ADX >22 + DC20 break up + price above EMA50. TRENDING_DOWN = ADX >22 + DC20 break down + price below EMA50. EXPANSION = DC break + BB wide → breakout already underway. RANGING = ADX <18 + price inside DC20 → ideal for grids. MIXED = no clear classification.`],
  ["Squeeze Conf",
    `0–100 composite squeeze intensity. Combines: BB bandwidth (40% weight), DC20 width / ATR (40%), ATR% (20%). Higher = tighter range + compressed volatility = elevated breakout probability. Use alongside Regime SQUEEZE to time grid entries before the move, or wait for direction confirmation before going directional.`],
  ["Bollinger Bands (20)",
    `Price envelope: 20-period SMA ± 2 standard deviations. Bandwidth (BW%) measures volatility. BW <5% = squeeze (compressed). BW >15% = expanded (volatile). Narrowing bands followed by a DC break = high-probability breakout. Used in Regime classification and Squeeze Conf score.`],
  ["MACD (12/26/9)",
    `Moving Average Convergence Divergence. MACD line = EMA12 − EMA26. Signal = EMA9 of MACD line. Histogram = MACD − Signal. Positive histogram = bullish momentum building. Negative = bearish. Histogram crossing zero = momentum shift. Visible in the deep card diagnostics panel.`],
  ["OBV (On-Balance Volume)",
    `Adds full candle volume on up-closes, subtracts on down-closes. Trend UP = buyers consistently absorbing supply = confirms price rises. Trend DOWN = distribution = divergence from rising price is a warning. FLAT = no conviction. Used in deep card alongside price structure.`],
  ["Fibonacci (50 candles)",
    `Fibonacci retracement levels (0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%) calculated from the swing high/low of the last 50 4H candles. Price zone label shows which level range price sits in. 38.2–61.8% = healthy retracement zone in a trend. Above 78.6% = deep retracement, trend may be failing. Visible in the deep card.`],
  [`Score 0–10`,
    `Composite setup quality score. Max components: Trend Macro (+2.0) + Pressure (+2.0) + Setup (+2.0) + Trend Swing (+1.5) + CVD Quality (+1.5) + EMA (±0.25) + FVG (+0.5) + POC Conf (+0.5) + Funding (±0.3 to ±0.5) = ~10.75 → clamped to 10. Penalties: RSI extreme (−0.5), OI squeeze on short (−0.5 to −1.0), Structure conflict (−0.5), DC20 range indecision (−0.25, only when Regime=RANGING), Funding crowded (−0.5). Score ≥ ${CFG.SCORE_BOT_MIN} activates bot parameters. 8–10 = strong. 6–7.9 = developing. <6 = avoid.`],
];

// ══════════════════════════════════════════════════════════════════
//  GRID BOT CONFIG
// ══════════════════════════════════════════════════════════════════
export const GRID_CONFIG = {
  DEFAULT_CAPITAL        : 500,
  FEE_PCT                : 0.001,  // 0.1% per side, 0.2% round-trip per grid
  TARGET_NET_PCT         : 0.008,  // target net profit per grid (0.8%)
  MIN_NET_PCT            : 0.006,  // minimum viable net profit per grid
  ATR_MULTIPLIER_DEFAULT : 2.5,
  GEOMETRIC_THRESHOLD_PCT: 20,     // use Geometric mode if range > 20%

  // SL/TP buffers scaled to volatility profile (~7-7.5/10 risk)
  SL_BUFFERS: { stable: 0.08, moderate: 0.11, volatile: 0.13 },
  TP_BUFFERS: { stable: 0.04, moderate: 0.05, volatile: 0.07 },

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

  // Donchian-based squeeze detector thresholds
  SQUEEZE: {
    BB_WIDTH_MAX     : 5.0,  // BB bandwidth below this counts as compressed
    DC_ATR_RATIO_MAX : 1.0,  // DC20 width / ATR below this = tight range
  },

  // CVD laterality gradient (replaces binary CFG.CVD_LATERAL_RATIO cliff)
  CVD_LATERAL: {
    FULL_SCORE_BELOW : 0.15,  // ratio ≤ 0.15 → full CVD weight
    ZERO_SCORE_ABOVE : 0.30,  // ratio ≥ 0.30 → no CVD weight (linear ramp between)
  },

  // Direction selection thresholds — require stronger conviction
  DIRECTION: {
    LONG_MIN_SCORE : 6.5,  // score must be >= this for Long Grid
    SHORT_MAX_SCORE: 4.5,  // score must be < this for Short Grid
  },
};

export function getGridCapital() {
  return parseFloat(localStorage.getItem('gridCapital') || GRID_CONFIG.DEFAULT_CAPITAL);
}
export function setGridCapital(val) {
  localStorage.setItem('gridCapital', String(val));
}
