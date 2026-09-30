'use strict';

import { CFG } from './config.js';
import { fetchKlines, fetchOI } from './api.js';

// ══════════════════════════════════════════════════════════════════
//  PRIVATE HELPER — shared boolean derivations
//  Used by calcScore() to centralise derived condition logic.
// ══════════════════════════════════════════════════════════════════
function deriveConditions(price, flow, oiChange, poc5d, avwap5d, poc14d, avwap14d, avwap30d,
  cvd5d, cvd14d, cvd30d, structure30d)
{
  const bearMac = [price<avwap14d, price<avwap30d, structure30d==="Bearish", cvd30d<0].filter(Boolean).length;
  const bullMac = [price>avwap14d, price>avwap30d, structure30d==="Bullish", cvd30d>0].filter(Boolean).length;
  const nPoc5d  = Math.abs(price-poc5d)/poc5d*100   < CFG.POC_NEAR_PCT;
  const nPoc14d = Math.abs(price-poc14d)/poc14d*100 < CFG.POC_NEAR_PCT;
  const sBull = price>avwap5d && cvd5d>0 && flow>0;
  const sBear = price<avwap5d && cvd5d<0 && flow<0;
  const dBull = price<avwap5d && cvd5d>0;
  const dBear = price>avwap5d && cvd5d<0;
  const buyP  = flow>CFG.FLOW_STRONG  && oiChange>0 && cvd5d>0;
  const selP  = flow<-CFG.FLOW_STRONG && oiChange<0 && cvd5d<0;
  const shOp  = flow<-CFG.FLOW_STRONG && oiChange>0;
  const sqR   = flow>CFG.FLOW_STRONG  && oiChange<0;
  const aAcc  = cvd5d>0 && cvd14d>0 && cvd30d>0;
  const aDis  = cvd5d<0 && cvd14d<0 && cvd30d<0;
  const bnce  = cvd30d<0 && cvd14d<0 && cvd5d>0;
  const corr  = cvd30d>0 && cvd14d>0 && cvd5d<0;
  return { bearMac, bullMac, nPoc5d, nPoc14d, sBull, sBear, dBull, dBear,
           buyP, selP, shOp, sqR, aAcc, aDis, bnce, corr };
}

// ══════════════════════════════════════════════════════════════════
//  CALCULATIONS  (faithful JS port of Trading.py)
// ══════════════════════════════════════════════════════════════════
export function parseKlines(raw) {
  return raw.map(k => ({
    Time:k[0]|0, Open:+k[1], High:+k[2], Low:+k[3], Close:+k[4],
    Volume:+k[5], TotalVol:+k[5], BuyVol:+k[9]
  }));
}

export function calcRsi(df, period = 14) {
  const n = df.length;
  if (n <= period) return 50;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = df[i].Close - df[i-1].Close;
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= period; avgL /= period;
  for (let i = period + 1; i < n; i++) {
    const d = df[i].Close - df[i-1].Close;
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  return avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
}

function trueRange(df, i) {
  return Math.max(df[i].High - df[i].Low, Math.abs(df[i].High - df[i - 1].Close), Math.abs(df[i].Low - df[i - 1].Close));
}
export function atrSeries(df, period = 14) {
  const out = new Array(df.length).fill(NaN);
  if (df.length < period + 1) return out;
  let a = 0;
  for (let i = 1; i <= period; i++) a += trueRange(df, i);
  a /= period; out[period] = a;
  for (let i = period + 1; i < df.length; i++) { a = (a * (period - 1) + trueRange(df, i)) / period; out[i] = a; }
  return out;
}
export function calcAtr(df, period = 14) {
  return df.length < period + 1 ? 0 : atrSeries(df, period).at(-1);
}

export function percentileRank(arr, v) {
  if (!arr.length) return 50;
  let n = 0;
  for (const x of arr) if (x <= v) n++;
  return n / arr.length * 100;
}

// Squeeze relative to the coin's OWN history: fixed thresholds never fit every coin (DC20/ATR ranged 2.96–4.95 live).
export function calcSqueeze(closed, win = CFG.DONCHIAN_PERIOD_SHORT) {
  const atr = atrSeries(closed, CFG.ATR_PERIOD), bw = [], da = [];
  for (let i = Math.max(win - 1, CFG.ATR_PERIOD); i < closed.length; i++) {
    let hi = -Infinity, lo = Infinity, sum = 0;
    for (let j = i - win + 1; j <= i; j++) {
      const k = closed[j];
      if (k.High > hi) hi = k.High;
      if (k.Low < lo) lo = k.Low;
      sum += k.Close;
    }
    const mean = sum / win;
    let v = 0;
    for (let j = i - win + 1; j <= i; j++) v += (closed[j].Close - mean) ** 2;
    bw.push(4 * Math.sqrt(v / win) / mean * 100);   // BB(20,2) bandwidth %
    da.push(atr[i] > 0 ? (hi - lo) / atr[i] : 0);
  }
  if (!bw.length) return { squeezed: false, conf: 0, bwRank: 50, dcAtrRank: 50, dcAtr: 0 };
  const H = CFG.SQUEEZE.HISTORY;
  const bwRank    = percentileRank(bw.slice(-H), bw.at(-1));
  const dcAtrRank = percentileRank(da.slice(-H), da.at(-1));
  return {
    squeezed: bwRank <= CFG.SQUEEZE.PCTL && dcAtrRank <= CFG.SQUEEZE.PCTL,
    conf: Math.round(100 - (bwRank + dcAtrRank) / 2),
    bwRank, dcAtrRank, dcAtr: da.at(-1),
  };
}

export function calcEma(df, span) {
  if (!df.length) return 0;
  if (df.length < span) return df.reduce((s, k) => s + k.Close, 0) / df.length;
  const k = 2 / (span + 1);
  let ema = 0;
  for (let i = 0; i < span; i++) ema += df[i].Close;
  ema /= span;                                   // SMA seed — removes first-close bias
  for (let i = span; i < df.length; i++) ema = df[i].Close * k + ema * (1 - k);
  return ema;
}

export function calcPocAvwap(df, nbins = CFG.POC_BINS) {
  if (!df.length) return { poc: 0, avwap: 0 };
  let lo = Infinity, hi = -Infinity, sumV = 0, sumPV = 0;
  for (const k of df) {
    if (k.Low < lo) lo = k.Low;
    if (k.High > hi) hi = k.High;
    sumV  += k.Volume;
    sumPV += (k.High + k.Low + k.Close) / 3 * k.Volume;
  }
  const avwap = sumV > 0 ? sumPV / sumV : df[df.length - 1].Close;
  if (hi === lo) return { poc: lo, avwap };
  const bsz = (hi - lo) / nbins, bins = new Float64Array(nbins);
  const idx = p => Math.min(nbins - 1, Math.floor((p - lo) / bsz));
  for (const k of df) {
    const span = k.High - k.Low;
    if (span <= 0) { bins[idx(k.Close)] += k.Volume; continue; }
    for (let i = idx(k.Low); i <= idx(k.High); i++) {   // spread volume evenly over the candle's range
      const overlap = Math.min(k.High, lo + (i + 1) * bsz) - Math.max(k.Low, lo + i * bsz);
      if (overlap > 0) bins[i] += k.Volume * overlap / span;
    }
  }
  let pocIdx = 0;
  for (let i = 1; i < nbins; i++) if (bins[i] > bins[pocIdx]) pocIdx = i;
  return { poc: lo + (pocIdx + 0.5) * bsz, avwap };
}

export function calcCvd(raw) {
  // raw = Binance kline array; index 5=TotalVol, 9=BuyVol
  return raw.reduce((cvd, k) => {
    const tot = +k[5], buy = +k[9];
    return cvd + buy - (tot - buy);
  }, 0);
}

// Fractal pivots: a pivot high is higher than the k bars before it and not exceeded by the k bars after it.
export function findPivots(df, k) {
  const highs = [], lows = [];
  for (let i = k; i < df.length - k; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= k; j++) {
      if (!(df[i].High > df[i - j].High && df[i].High >= df[i + j].High)) isH = false;
      if (!(df[i].Low  < df[i - j].Low  && df[i].Low  <= df[i + j].Low))  isL = false;
    }
    if (isH) highs.push(df[i].High);
    if (isL) lows.push(df[i].Low);
  }
  return { highs, lows };
}

// HH+HL = Bullish, LH+LL = Bearish, from the last two swing pivots.
export function calcMarketStructure(df, k = 2) {
  const { highs, lows } = findPivots(df, k);
  if (highs.length < 2 || lows.length < 2) return 'Neutral';
  const [h1, h2] = highs.slice(-2), [l1, l2] = lows.slice(-2);
  if (h2 > h1 && l2 > l1) return 'Bullish';
  if (h2 < h1 && l2 < l1) return 'Bearish';
  return 'Neutral';
}

// Liquidity sweep on the last CLOSED candle vs the prior `lookback` candles' extreme.
export function calcSweep(closed, lookback = CFG.SWEEP_LOOKBACK) {
  if (closed.length < lookback + 1) return 'NONE';
  const c = closed[closed.length - 1];
  let hi = -Infinity, lo = Infinity;
  for (const k of closed.slice(-lookback - 1, -1)) { if (k.High > hi) hi = k.High; if (k.Low < lo) lo = k.Low; }
  if (c.High > hi && c.Close < hi) return 'HIGH_SWEEP';   // trapped breakout buyers → bearish
  if (c.Low  < lo && c.Close > lo) return 'LOW_SWEEP';    // trapped breakdown sellers → bullish
  return 'NONE';
}

export function calcFvg(df, maxGaps = 5) {
  if (df.length < 3) return [];
  const gaps = [], lastClose = df[df.length - 1].Close;
  for (let i = 1; i < df.length - 1; i++) {
    const prev = df[i-1], next = df[i+1];

    // Bullish FVG: gap_bottom = prev.High, gap_top = next.Low
    if (next.Low > prev.High) {
      const gBot = prev.High, gTop = next.Low;
      // Intact if no candle after formation has closed below gBot
      let intact = true;
      for (let j = i + 1; j < df.length; j++) if (df[j].Low < gBot) { intact = false; break; }
      if (intact) gaps.push({ type:'BULL', bottom:gBot, top:gTop, mid:(gBot+gTop)/2, sizePct:(gTop-gBot)/gBot*100, idx:i });
    }

    // Bearish FVG: gap_top = prev.Low, gap_bottom = next.High
    if (next.High < prev.Low) {
      const gBot = next.High, gTop = prev.Low;
      let intact = true;
      for (let j = i + 1; j < df.length; j++) if (df[j].High > gTop) { intact = false; break; }
      if (intact) gaps.push({ type:'BEAR', bottom:gBot, top:gTop, mid:(gBot+gTop)/2, sizePct:(gTop-gBot)/gBot*100, idx:i });
    }
  }
  gaps.sort((a,b) => Math.abs(a.mid - lastClose) - Math.abs(b.mid - lastClose));
  return gaps.slice(0, maxGaps);
}

// ══════════════════════════════════════════════════════════════════
//  DONCHIAN CHANNEL — regime & squeeze foundation
// ══════════════════════════════════════════════════════════════════
export function calcDonchian(df, period = 20) {
  if (!df || df.length < period) return null;
  const slice = df.slice(-period);
  let hi = -Infinity, lo = Infinity;
  for (const k of slice) { if (k.High > hi) hi = k.High; if (k.Low < lo) lo = k.Low; }
  const mid = (hi + lo) / 2;
  const width = hi - lo;
  const widthPct = mid > 0 ? width / mid * 100 : 0;
  return { high: hi, low: lo, mid, width, widthPct };
}

// Channel is built from CLOSED candles, so a break means the live price is genuinely outside it.
export function donchianPos(price, dc) {
  if (!dc) return 'UNKNOWN';
  if (price > dc.high) return 'BREAK_UP';
  if (price < dc.low)  return 'BREAK_DOWN';
  return 'INSIDE';
}

// Composite regime label — plain-English market state
export function calcRegime(m) {
  const adx = m.adx?.adx ?? 0;
  const brk = m.dc20Pos === 'BREAK_UP' || m.dc20Pos === 'BREAK_DOWN';
  if (m.squeeze?.squeezed) return 'SQUEEZE';
  if (adx >= 22 && m.dc20Pos === 'BREAK_UP'   && m.currClose > m.emaFast) return 'TRENDING_UP';
  if (adx >= 22 && m.dc20Pos === 'BREAK_DOWN' && m.currClose < m.emaFast) return 'TRENDING_DOWN';
  if (brk && (m.squeeze?.bwRank ?? 0) >= 100 - CFG.SQUEEZE.PCTL) return 'EXPANSION';
  if (adx < 18 && m.dc20Pos === 'INSIDE') return 'RANGING';
  return 'MIXED';
}

export function fvgStatus(price, g) {
  if (g.bottom <= price && price <= g.top) {
    const fillPct = (g.top-g.bottom) > 0 ? (price-g.bottom)/(g.top-g.bottom)*100 : 0;
    return { state:'inside', distPct:0, fillPct };
  }
  const distPct = Math.abs(price - g.mid) / price * 100;
  return { state: distPct < 1.0 ? 'approach' : 'far', distPct, fillPct:null };
}

export async function getAdvancedMetrics(name, symbol) {
  const [raw4h, rawFlow, oi] = await Promise.all([
    fetchKlines(name, symbol, '4h', CFG.KLINES_MAIN),
    fetchKlines(name, symbol, '1h', CFG.FLOW_LIMIT),
    fetchOI(name, symbol),
  ]);
  return computeMetrics(raw4h, rawFlow, oi);
}

// Pure: Binance-format klines in, metrics out. 5d/14d/30d windows are slices of one 4H series.
export function computeMetrics(raw4h, rawFlow, oi) {
  const df4h  = parseKlines(raw4h);
  const raw5d = raw4h.slice(-CFG.KLINES_5D), raw14d = raw4h.slice(-CFG.KLINES_14D), raw30d = raw4h.slice(-CFG.KLINES_30D);
  const df5d  = df4h.slice(-CFG.KLINES_5D),  df14d  = df4h.slice(-CFG.KLINES_14D),  df30d  = df4h.slice(-CFG.KLINES_30D);
  const dfFl  = parseKlines(rawFlow);
  const closed = df4h.slice(0, -1);   // excludes the forming candle
  const volume5d = df5d.reduce((s, k) => s + k.Volume, 0);

  // ── Indicators on 4H ──────────────────────────────────────────
  const rsi     = calcRsi(df4h, CFG.RSI_PERIOD);
  const atr     = calcAtr(df4h, CFG.ATR_PERIOD);
  const emaFast = calcEma(df4h, CFG.EMA_FAST);
  const emaSlow = calcEma(df4h, CFG.EMA_SLOW);

  // Volume spike on the last CLOSED candle — a forming candle's partial volume is never a spike
  const lastClosed = closed[closed.length - 1] ?? df4h[df4h.length - 1];
  const volAvg  = closed.slice(-(CFG.VOL_AVG_WINDOW + 1), -1).reduce((s, k) => s + k.Volume, 0) / CFG.VOL_AVG_WINDOW;
  const volCurr = lastClosed.Volume;
  const volSpike = volCurr >= CFG.VOL_SPIKE_MULT * volAvg;

  const last  = df4h[df4h.length - 1];
  const sweep = calcSweep(closed, CFG.SWEEP_LOOKBACK);

  // ── Multi-timeframe POC / AVWAP ────────────────────────────────
  const { poc:poc5d,  avwap:avwap5d  } = calcPocAvwap(df5d);
  const { poc:poc14d, avwap:avwap14d } = calcPocAvwap(df14d);
  const { poc:poc30d, avwap:avwap30d } = calcPocAvwap(df30d);

  // ── CVD (uses raw Binance-format arrays, index 5=total, 9=buy) ─
  const cvd5d  = calcCvd(raw5d);
  const cvd14d = calcCvd(raw14d);
  const cvd30d = calcCvd(raw30d);

  // ── Structure ──────────────────────────────────────────────────
  const structure4h  = calcMarketStructure(closed.slice(-CFG.STRUCT_LOOKBACK_4H), CFG.STRUCT_K_4H);
  const structure30d = calcMarketStructure(closed.slice(-CFG.KLINES_30D), CFG.STRUCT_K_30D);

  // ── FVG — FIXED: use last 100 candles (matches Python KLINES_MAIN=100) ──
  const fvgList = calcFvg(df4h.slice(-CFG.KLINES_FVG), CFG.FVG_MAX_GAPS);

  // ── 24h flow ──────────────────────────────────────────────────
  const sumBuy   = dfFl.reduce((s,k)=>s+k.BuyVol,  0);
  const sumTotal = dfFl.reduce((s,k)=>s+k.TotalVol, 0);
  const flow = sumTotal > 0 ? (sumBuy - (sumTotal - sumBuy)) / sumTotal * 100 : 0;

  // ── New indicators ─────────────────────────────────────────────
  const adxData   = calcADX(df4h);
  const macdData  = calcMACD(df4h);
  const bbData    = calcBB(df4h);
  const atrPct    = calcAtrPct(atr, last.Close);

  // ── Donchian Channels (regime + squeeze foundation) ──────────────
  const dc20 = calcDonchian(closed, CFG.DONCHIAN_PERIOD_SHORT);
  const dc55 = calcDonchian(closed, CFG.DONCHIAN_PERIOD_LONG);
  const dc20Pos = donchianPos(last.Close, dc20);
  const dc55Pos = donchianPos(last.Close, dc55);
  const squeeze = calcSqueeze(closed);

  const m = {
    rsi, atr, poc5d, avwap5d, poc14d, avwap14d, poc30d, avwap30d,
    sweep, flow, structure4h, structure30d,
    oiNow:oi.oiNow, oiChange:oi.oiChange,
    cvd5d, cvd14d, cvd30d, volume5d,
    currClose:last.Close, fvgList,
    emaFast, emaSlow, volSpike, volCurr, volAvg,
    adx: adxData, macd: macdData, bb: bbData, bbBw: bbData.bw,
    atrPct,
    dc20, dc55, dc20Pos, dc55Pos, squeeze,
  };
  m.regime      = calcRegime(m);
  m.squeezeConf = squeeze.conf;
  return m;
}

// ══════════════════════════════════════════════════════════════════
//  SCORING ENGINE
// ══════════════════════════════════════════════════════════════════
export function calcScore(price, atr, rsi, flow, oiChange,
  poc5d, avwap5d, poc14d, avwap14d, avwap30d,
  cvd5d, cvd14d, cvd30d, structure4h, structure30d,
  sweep, fvgList, emaFast, emaSlow, dc20Pos, funding = 0, regime = 'MIXED')
{
  const { bearMac: bMac, bullMac: uMac, nPoc5d: nP5, nPoc14d: nP14,
          sBull, sBear, dBull, dBear, buyP, selP, shOp, sqR,
          aAcc, aDis, bnce, corr } =
    deriveConditions(price, flow, oiChange, poc5d, avwap5d, poc14d, avwap14d, avwap30d,
      cvd5d, cvd14d, cvd30d, structure30d);

  let score = 0, direction = null;
  const detail = [];

  // 1. TREND MACRO
  if (bMac>=3)            { score+=2.0; direction="SHORT"; detail.push(["Trend Macro BEAR (full)",+2.0,`${bMac}/4 bear conditions`]); }
  else if (uMac>=3)       { score+=2.0; direction="LONG";  detail.push(["Trend Macro BULL (full)",+2.0,`${uMac}/4 bull conditions`]); }
  else if (bMac===2&&uMac<2){ score+=0.8; direction="SHORT"; detail.push(["Trend Macro BEAR (partial)",+0.8,"2/4 bear conditions"]); }
  else if (uMac===2&&bMac<2){ score+=0.8; direction="LONG";  detail.push(["Trend Macro BULL (partial)",+0.8,"2/4 bull conditions"]); }
  else                    { detail.push(["Trend Macro NEUTRAL",0.0,`bull=${uMac}/4, bear=${bMac}/4`]); }

  // 2. TREND SWING
  if      (direction==="LONG"  && sBull) { score+=1.5; detail.push(["Trend Swing BULLISH",+1.5,`AVWAP5d+CVD5d ACC+Flow ${flow.toFixed(1)}%`]); }
  else if (direction==="SHORT" && sBear) { score+=1.5; detail.push(["Trend Swing BEARISH",+1.5,`AVWAP5d+CVD5d DIS+Flow ${flow.toFixed(1)}%`]); }
  else if (direction==="LONG"  && dBull) { score+=0.5; detail.push(["Trend Swing DIV BULL",+0.5,"Price<AVWAP5d but CVD acc — reversal"]); }
  else if (direction==="SHORT" && dBear) { score+=0.5; detail.push(["Trend Swing DIV BEAR",+0.5,"Price>AVWAP5d but CVD dis — weak rally"]); }
  else if (direction==="LONG"  && sBear) { score-=0.5; detail.push(["Trend Swing contra LONG",-0.5,"Bearish swing vs macro bull"]); }
  else if (direction==="SHORT" && sBull) { score-=0.5; detail.push(["Trend Swing contra SHORT",-0.5,"Bullish swing vs macro bear"]); }
  else                                   { detail.push(["Trend Swing NEUTRAL",0.0,`Flow=${flow.toFixed(1)}%`]); }

  // 3. PRESSURE
  if      (buyP && direction==="LONG")   { score+=2.0; detail.push(["Pressure BUY STRONG",+2.0,`Flow+${flow.toFixed(1)}%+OI+${oiChange.toFixed(1)}%+CVD5d ACC`]); }
  else if (selP && direction==="SHORT")  { score+=2.0; detail.push(["Pressure SELL STRONG",+2.0,`Flow${flow.toFixed(1)}%+OI${oiChange.toFixed(1)}%+CVD5d DIS`]); }
  else if (buyP && direction==="SHORT")  { score+=0.3; detail.push(["Pressure BUY (contra SHORT)",+0.3,"Buy pressure — squeeze risk"]); }
  else if (selP && direction==="LONG")   { score+=0.3; detail.push(["Pressure SELL (contra LONG)",+0.3,"Sell pressure — decline risk"]); }
  else if (shOp && direction==="SHORT")  { score+=0.5; detail.push(["Short opening aligned",+0.5,"New shorts opening"]); }
  else if (sqR  && direction==="LONG")   { score+=0.5; detail.push(["Squeeze risk (LONG)",+0.5,"Short squeeze possible"]); }
  else {
    const pb  = [flow<-CFG.FLOW_PARTIAL, oiChange<-1, cvd5d<0].filter(Boolean).length;
    const pb2 = [flow>CFG.FLOW_PARTIAL,  oiChange>1,  cvd5d>0].filter(Boolean).length;
    if      (direction==="SHORT" && pb===2)  { score+=0.4; detail.push(["Pressure partial BEAR",+0.4,"2/3 bear conditions"]); }
    else if (direction==="LONG"  && pb2===2) { score+=0.4; detail.push(["Pressure partial BULL",+0.4,"2/3 bull conditions"]); }
    else detail.push(["Pressure BALANCED",0.0,`Flow=${flow.toFixed(1)}%`]);
  }

  // 4. CVD QUALITY
  if      (aAcc && direction==="LONG")   { score+=1.5; detail.push(["CVD ACC all 3 TFs",+1.5,"CVD5d/14d/30d all positive"]); }
  else if (aDis && direction==="SHORT")  { score+=1.5; detail.push(["CVD DIS all 3 TFs",+1.5,"CVD5d/14d/30d all negative"]); }
  else if (corr && direction==="LONG")   { score+=0.75; detail.push(["CVD Pullback in BULL",+0.75,"Recent DIS(5d) in bull trend"]); }
  else if (bnce && direction==="SHORT")  { score+=0.75; detail.push(["CVD Bounce in BEAR",+0.75,"Recent ACC(5d) in bear trend"]); }
  else if (aAcc && direction==="SHORT")  { score-=0.3; detail.push(["CVD ACC contra SHORT",-0.3,"CVD acc contradicts short"]); }
  else if (aDis && direction==="LONG")   { score-=0.3; detail.push(["CVD DIS contra LONG",-0.3,"CVD dis contradicts long"]); }
  else detail.push(["CVD mixed",0.0,"Inconsistent across TFs"]);

  // 5. SETUP
  if (sweep==='LOW_SWEEP' && flow>0 && oiChange>0 && direction==="LONG")
    { score+=2.0; detail.push(["Setup LOW SWEEP→LONG",+2.0,"Liq sweep+flow+OI rising"]); }
  else if (sweep==='HIGH_SWEEP' && flow<0 && oiChange<0 && direction==="SHORT")
    { score+=2.0; detail.push(["Setup HIGH SWEEP→SHORT",+2.0,"Liq sweep+flow+OI falling"]); }
  else if (direction && sweep !== 'NONE')
    { score+=0.75; detail.push(["Setup SWEEP partial",+0.75,"Sweep present, partial confirmation"]); }
  else if (nP5  && cvd5d>0 && price>avwap5d && direction==="LONG")
    { score+=1.0; detail.push(["Setup LONG @ POC5d",+1.0,"POC5d+ACC+above AVWAP5d"]); }
  else if (nP5  && cvd5d<0 && price<avwap5d && direction==="SHORT")
    { score+=1.0; detail.push(["Setup SHORT @ POC5d",+1.0,"POC5d+DIS+below AVWAP5d"]); }
  else if (nP14 && structure4h==="Bullish" && direction==="LONG")
    { score+=0.5; detail.push(["Setup LONG Swing14d",+0.5,"POC14d+4H bull structure"]); }
  else if (nP14 && structure4h==="Bearish" && direction==="SHORT")
    { score+=0.5; detail.push(["Setup SHORT Swing14d",+0.5,"POC14d+4H bear structure"]); }
  else detail.push(["Setup WAIT",0.0,"No active entry confluence"]);

  // EMA bonus
  if (emaFast>0 && emaSlow>0) {
    const eb = emaFast>emaSlow && price>emaFast;
    const eB = emaFast<emaSlow && price<emaFast;
    if      (direction==="LONG"  && eb) { score+=0.25; detail.push(["EMA50/200 aligned LONG",+0.25,"Price>EMA50>EMA200"]); }
    else if (direction==="SHORT" && eB) { score+=0.25; detail.push(["EMA50/200 aligned SHORT",+0.25,"Price<EMA50<EMA200"]); }
    else if (direction==="LONG"  && eB) { score-=0.25; detail.push(["EMA50/200 contra LONG",-0.25,"Price<EMA50<EMA200"]); }
    else if (direction==="SHORT" && eb) { score-=0.25; detail.push(["EMA50/200 contra SHORT",-0.25,"Price>EMA50>EMA200"]); }
  }

  // 6. FVG
  const fnB = fvgList.filter(g=>g.type==='BULL' && ['inside','approach'].includes(fvgStatus(price,g).state) && Math.abs(price-g.mid)/price*100<CFG.FVG_NEAR_PCT);
  const fnBe= fvgList.filter(g=>g.type==='BEAR' && ['inside','approach'].includes(fvgStatus(price,g).state) && Math.abs(price-g.mid)/price*100<CFG.FVG_NEAR_PCT);
  let fhit = false;
  if (direction==="LONG" && fnB.length) {
    const g=fnB[0], st=fvgStatus(price,g), tag=st.state==='inside'?`[IN ${st.fillPct.toFixed(0)}%]`:`dist ${st.distPct.toFixed(2)}%`;
    score += structure4h!=="Bearish" ? 0.5 : 0.25; fhit=true;
    detail.push([structure4h!=="Bearish"?"FVG BULL ★":"FVG BULL (unconfirmed)", structure4h!=="Bearish"?0.5:0.25, `Gap ${g.bottom.toFixed(2)}-${g.top.toFixed(2)} ${tag}`]);
  } else if (direction==="SHORT" && fnBe.length) {
    const g=fnBe[0], st=fvgStatus(price,g), tag=st.state==='inside'?`[IN ${st.fillPct.toFixed(0)}%]`:`dist ${st.distPct.toFixed(2)}%`;
    score += structure4h!=="Bullish" ? 0.5 : 0.25; fhit=true;
    detail.push([structure4h!=="Bullish"?"FVG BEAR ★":"FVG BEAR (unconfirmed)", structure4h!=="Bullish"?0.5:0.25, `Gap ${g.bottom.toFixed(2)}-${g.top.toFixed(2)} ${tag}`]);
  }
  if (!fhit) detail.push(["FVG absent/far",0.0,"No aligned FVG in proximity"]);

  // 7. POC CONFLUENCE
  const pd1=Math.abs(poc5d-poc14d)/poc14d*100, pd2=Math.abs(poc5d-poc14d)/poc5d*100;
  if (direction && pd1<CFG.POC_CONFLUENCE_PCT && pd2<CFG.POC_CONFLUENCE_PCT)
    { score+=0.5; detail.push(["POC Confluence [YES]",+0.5,`POC5d≈POC14d (<${CFG.POC_CONFLUENCE_PCT}%)`]); }
  else detail.push(["POC Confluence [-]",0.0,`POC5d=${poc5d.toFixed(2)} vs POC14d=${poc14d.toFixed(2)}`]);

  // PENALTIES
  if      (direction==="LONG"  && rsi>CFG.RSI_EXTREME_OB) { score-=0.5; detail.push(["RSI overbought vs LONG",-0.5,`RSI=${rsi.toFixed(1)}`]); }
  else if (direction==="SHORT" && rsi<CFG.RSI_EXTREME_OS) { score-=0.5; detail.push(["RSI oversold vs SHORT",-0.5,`RSI=${rsi.toFixed(1)}`]); }
  if (direction==="SHORT" && oiChange>CFG.OI_SQUEEZE_HIGH) { score-=1.0; detail.push([`OI>${CFG.OI_SQUEEZE_HIGH}% on SHORT`,-1.0,"High squeeze risk"]); }
  else if (direction==="SHORT" && oiChange>CFG.OI_SQUEEZE_MED) { score-=0.5; detail.push([`OI>${CFG.OI_SQUEEZE_MED}% on SHORT`,-0.5,"Moderate squeeze risk"]); }
  else if (direction==="LONG"  && oiChange<-CFG.OI_SQUEEZE_HIGH) { score-=1.0; detail.push([`OI<-${CFG.OI_SQUEEZE_HIGH}% on LONG`,-1.0,"Massive long liquidations"]); }
  if (structure4h!==structure30d && structure4h!=="Neutral" && structure30d!=="Neutral")
    { score-=0.5; detail.push(["Struct conflict",-0.5,`4H=${structure4h} vs 30d=${structure30d}`]); }
  // DC20 range indecision — only penalise when regime confirms ranging (not just any INSIDE candle)
  if (direction && dc20Pos === 'INSIDE' && regime === 'RANGING')
    { score-=0.25; detail.push(["DC20 range indecision",-0.25,"Direction inside DC20 range — confirmed ranging market"]); }

  // FUNDING RATE — most crypto-native signal; penalise crowded side, reward tailwind
  if (direction && funding != null) {
    if      (direction==="LONG"  && funding > 0.1)  { score-=0.5;  detail.push(["Funding crowded LONG", -0.5,  `Funding ${funding.toFixed(3)}% — longs paying heavily`]); }
    else if (direction==="SHORT" && funding < -0.1)  { score-=0.5;  detail.push(["Funding crowded SHORT",-0.5,  `Funding ${funding.toFixed(3)}% — shorts paying heavily`]); }
    else if (direction==="LONG"  && funding < 0)     { score+=0.3;  detail.push(["Funding favors LONG",  +0.3,  `Funding ${funding.toFixed(3)}% — shorts paying, tailwind`]); }
    else if (direction==="SHORT" && funding > 0)     { score+=0.3;  detail.push(["Funding favors SHORT", +0.3,  `Funding ${funding.toFixed(3)}% — longs paying, tailwind`]); }
    else detail.push(["Funding neutral", 0.0, `Funding ${funding.toFixed(3)}%`]);
  }

  return { score: Math.max(0, Math.min(10, Math.round(score*100)/100)), direction, detail };
}

// ══════════════════════════════════════════════════════════════════
//  NEW INDICATORS
// ══════════════════════════════════════════════════════════════════
export function calcADX(df, period = 14) {
  const n = df.length;
  if (n < period + 2) return { adx: 0, plusDI: 0, minusDI: 0 };
  const trArr = [], plusDMArr = [], minusDMArr = [];
  for (let i = 1; i < n; i++) {
    const h = df[i].High, l = df[i].Low, ph = df[i-1].High, pl = df[i-1].Low, pc = df[i-1].Close;
    trArr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = h - ph, dn = pl - l;
    plusDMArr.push(up > dn && up > 0 ? up : 0);
    minusDMArr.push(dn > up && dn > 0 ? dn : 0);
  }
  let atrS = trArr.slice(0, period).reduce((s, v) => s + v, 0);
  let pS   = plusDMArr.slice(0, period).reduce((s, v) => s + v, 0);
  let mS   = minusDMArr.slice(0, period).reduce((s, v) => s + v, 0);
  const dxArr = [];
  for (let i = period; i < trArr.length; i++) {
    atrS = atrS - atrS / period + trArr[i];
    pS   = pS   - pS   / period + plusDMArr[i];
    mS   = mS   - mS   / period + minusDMArr[i];
    const pDI = atrS > 0 ? pS / atrS * 100 : 0;
    const mDI = atrS > 0 ? mS / atrS * 100 : 0;
    dxArr.push({ dx: (pDI + mDI) > 0 ? Math.abs(pDI - mDI) / (pDI + mDI) * 100 : 0, pDI, mDI });
  }
  if (dxArr.length < period) return { adx: 0, plusDI: 0, minusDI: 0 };
  let adx = dxArr.slice(0, period).reduce((s, v) => s + v.dx, 0) / period;
  for (let i = period; i < dxArr.length; i++) adx = (adx * (period - 1) + dxArr[i].dx) / period;
  const last = dxArr[dxArr.length - 1];
  return { adx, plusDI: last.pDI, minusDI: last.mDI };
}

export function calcMACD(df, fast = 12, slow = 26, signal = 9) {
  if (df.length < slow + signal) return { macd: 0, signal: 0, histogram: 0, trend: 'neutral' };
  function emaArr(arr, p) {
    const k = 2 / (p + 1), r = [arr[0]];
    for (let i = 1; i < arr.length; i++) r.push(arr[i] * k + r[i-1] * (1 - k));
    return r;
  }
  const closes = df.map(k => k.Close);
  const fArr = emaArr(closes, fast), sArr = emaArr(closes, slow);
  const macdLine = fArr.map((v, i) => v - sArr[i]).slice(slow - 1);
  const sigArr   = emaArr(macdLine, signal);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSig  = sigArr[sigArr.length - 1];
  const histogram = lastMacd - lastSig;
  const threshold = 0.0001 * df[df.length - 1].Close;
  const trend = Math.abs(histogram) < threshold ? 'neutral' : histogram > 0 ? 'bull' : 'bear';
  return { macd: lastMacd, signal: lastSig, histogram, trend };
}

export function calcBB(df, period = 20, mult = 2) {
  if (df.length < period) return { upper: 0, lower: 0, mid: 0, bw: 0, label: 'normal' };
  const slice = df.slice(-period).map(k => k.Close);
  const mid = slice.reduce((s, v) => s + v, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period);
  const upper = mid + mult * std, lower = mid - mult * std;
  const bw = mid > 0 ? (upper - lower) / mid * 100 : 0;
  const label = bw < 5 ? 'squeeze' : bw > 15 ? 'expanded' : 'normal';
  return { upper, lower, mid, bw, label };
}

export function calcAtrPct(atr, price) {
  return price > 0 ? atr / price * 100 : 0;
}

export function calcRecommendation(score, direction, atrPct, funding, rsi) {
  if (!direction) return { rec: 'No bias', recClass: 'bear', blockers: [] };
  const blockers = [];
  if (atrPct > 5)              blockers.push(`ATR ${atrPct.toFixed(1)}% > 5% (high volatility)`);
  if (Math.abs(funding) > 0.1) blockers.push(`Funding ${funding >= 0 ? '+' : ''}${funding.toFixed(4)}% extreme`);
  if (direction === 'LONG'  && rsi > CFG.RSI_EXTREME_OB) blockers.push(`RSI ${rsi.toFixed(1)} overbought vs LONG`);
  if (direction === 'SHORT' && rsi < CFG.RSI_EXTREME_OS) blockers.push(`RSI ${rsi.toFixed(1)} oversold vs SHORT`);
  if (score >= CFG.SCORE_ACTIVE)
    return { rec: blockers.length ? 'Strong ⚠' : 'Strong', recClass: blockers.length ? 'warn' : 'bull', blockers };
  if (score >= 6) return { rec: 'Developing', recClass: 'warn', blockers };
  return { rec: 'Weak', recClass: 'bear', blockers };
}
