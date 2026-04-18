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
  'Trend Macro':     'Macro trend (30d). Checks price vs AVWAP14d/30d, CVD30d, and Structure30d. 3 of 4 conditions = confirmed direction.',
  'Trend Swing':     'Swing trend (5d). Checks price vs AVWAP5d, CVD5d, and 24h Flow together. DIV signals warn of potential reversals.',
  'Presiune':        'Buy/sell pressure. Combines 24h Flow, 7d OI change, and CVD5d. SQUEEZE RISK = positive flow + OI falling (short flush).',
  'Calitate Trend':  'CVD alignment across all 3 horizons (5d/14d/30d). FULL ACCUM = all positive = high-confidence bull signal.',
  'Setup':           'Entry signal quality. Liquidity sweep + flow + OI = best setup. POC near + CVD + structure = secondary entry.',
  'Risc':            'Risk level. HIGH = RSI extreme + extreme flow. MEDIUM = structure timeframe conflict or OI/flow accelerating together.',
  'Bot Grid':        'Grid bot suitability. RECOMMENDED when CVD5d is lateral (low delta) + no strong directional trend present.',
  'FVG':             'Fair Value Gap proximity (last 100 4H candles). ★ = structure confirms. FILLING = price entering the imbalance zone.',
  'EMA Trend':       'EMA50 vs EMA200 relationship on 4H. BULL/PULLBACK = in bull trend but pulling back to EMA50 (potential entry zone).',
  'Vol Spike':       'Volume spike detection vs 20-candle average (≥2× = spike). Bull spike above AVWAP5d = breakout. Bear spike below = breakdown.',
};

// ── Indicator glossary entries (reference CFG values directly) ────
export const LEGENDS = [
  ["RSI (14)","Momentum on 4H. >70 overbought, <30 oversold. Much heavier signal than 1H RSI."],
  ["ATR (14)",`Average True Range 4H. SL = ${CFG.SL_ATR_MULT}–2×ATR4H. Values much larger than 1H ATR.`],
  ["Flow% 24h",`Buy vs sell pressure on 1H ×24. >+${CFG.FLOW_STRONG}%=buy dominant. <-${CFG.FLOW_STRONG}%=sell dominant.`],
  ["POC 5d/14d","Max-volume price zone. Price above=support, below=resistance. 2/3 POC confluence=strong zone."],
  ["AVWAP 5d/14d/30d","Volume-weighted avg price. Price below all 3=macro bearish. Above all 3=confirmed bull."],
  ["CVD 5d/14d/30d","Cumulative Volume Delta. [ACC]=accumulation, [DIS]=distribution. All DIS=robust 4H bear."],
  ["EMA 50/200","Standard trend filter. EMA50>EMA200+price above=uptrend. Golden/death cross=trend change."],
  ["Vol Spike",`>=${CFG.VOL_SPIKE_MULT}×avg=spike. Bull spike above AVWAP=breakout. Bear spike below=breakdown.`],
  ["Structure 4H/30d","Bullish=HH+HL. Bearish=LH+LL. Conflict between 4H and 30d=elevated risk."],
  ["OI/OI% 7d","Open Interest. OI↑+price↑=real bull. OI↑+price↓=short buildup/squeeze risk. OI↓+price↓=real bear."],
  ["FVG (Fair Value Gap)","Institutional imbalance on 4H. ★=confirmed by structure. BULL FVG=support, BEAR=resistance."],
  ["Donchian 20/55",`Highest high vs lowest low over N candles. DC20=regime (INSIDE→range, BREAK↑/↓→trend). DC55=macro breakout context.`],
  ["Regime",`Composite label from ADX + BB + DC20. RANGING=grid-friendly. TRENDING ↑/↓=directional. SQUEEZE=compression before move. EXPANSION=breakout in progress.`],
  ["Squeeze Conf",`0–100 composite: BB width + DC20 width/ATR + ATR percentile. High score = tight range, elevated breakout probability.`],
  [`Score 0–10`,`Score ≥ ${CFG.SCORE_BOT_MIN} activates bot params. Components: Trend Macro(2), Swing(1.5), Pressure(2), CVD(1), Setup(2), EMA(0.5), FVG(0.5), POC Conf(0.5). API: Binance primary, Bybit fallback.`],
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
  SL_BUFFERS: { stable: 0.06, moderate: 0.09, volatile: 0.13 },
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
