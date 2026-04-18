'use strict';

import { CFG } from './config.js';
import { fetchKlines, fetchOI } from './api.js';

// ══════════════════════════════════════════════════════════════════
//  PRIVATE HELPER — shared boolean derivations
//  Called by both interpretSignals() and calcScore() to eliminate
//  duplicate condition logic.
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

export function calcAtr(df, period = 14) {
  if (df.length < period + 1) return 0;
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += Math.max(df[i].High - df[i].Low,
                    Math.abs(df[i].High - df[i-1].Close),
                    Math.abs(df[i].Low  - df[i-1].Close));
  }
  let atr = sum / period;
  for (let i = period + 1; i < df.length; i++) {
    const tr = Math.max(df[i].High - df[i].Low,
                        Math.abs(df[i].High - df[i-1].Close),
                        Math.abs(df[i].Low  - df[i-1].Close));
    atr = (atr * (period - 1) + tr) / period;
  }
  return atr;
}

export function calcEma(df, span) {
  if (!df.length) return 0;
  const k = 2 / (span + 1);
  let ema = df[0].Close;
  for (let i = 1; i < df.length; i++) ema = df[i].Close * k + ema * (1 - k);
  return ema;
}

export function calcPocAvwap(df, nbins = 15) {
  if (!df.length) return { poc: 0, avwap: 0 };
  const closes = df.map(k => k.Close);
  const lo = Math.min(...closes), hi = Math.max(...closes);
  if (lo === hi) {
    const v = df.reduce((s,k) => s + k.Volume, 0);
    return { poc: lo, avwap: v > 0 ? df.reduce((s,k) => s + k.Close * k.Volume, 0) / v : lo };
  }
  const bsz = (hi - lo) / nbins;
  const bins = new Float64Array(nbins); // volume per bin
  for (const k of df) {
    let idx = Math.floor((k.Close - lo) / bsz);
    if (idx >= nbins) idx = nbins - 1;
    bins[idx] += k.Volume;
  }
  let maxVol = -1, pocIdx = 0;
  for (let i = 0; i < nbins; i++) if (bins[i] > maxVol) { maxVol = bins[i]; pocIdx = i; }
  const poc = lo + (pocIdx + 0.5) * bsz;
  const sumV  = df.reduce((s,k) => s + k.Volume, 0);
  const sumPV = df.reduce((s,k) => s + k.Close * k.Volume, 0);
  return { poc, avwap: sumV > 0 ? sumPV / sumV : poc };
}

export function calcCvd(raw) {
  // raw = Binance kline array; index 5=TotalVol, 9=BuyVol
  return raw.reduce((cvd, k) => {
    const tot = +k[5], buy = +k[9];
    return cvd + buy - (tot - buy);
  }, 0);
}

export function calcMarketStructure(df, lookback = 20) {
  if (df.length < lookback + 2) return "Neutral";
  const s = df.slice(-lookback);
  const n = s.length;
  const H = i => s[n - 1 - i].High, L = i => s[n - 1 - i].Low;
  if (H(0)>H(2) && H(2)>H(4) && L(0)>L(2) && L(2)>L(4)) return "Bullish";
  if (H(0)<H(2) && H(2)<H(4) && L(0)<L(2) && L(2)<L(4)) return "Bearish";
  return "Neutral";
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

export function fvgStatus(price, g) {
  if (g.bottom <= price && price <= g.top) {
    const fillPct = (g.top-g.bottom) > 0 ? (price-g.bottom)/(g.top-g.bottom)*100 : 0;
    return { state:'inside', distPct:0, fillPct };
  }
  const distPct = Math.abs(price - g.mid) / price * 100;
  return { state: distPct < 1.0 ? 'approach' : 'far', distPct, fillPct:null };
}

export async function getAdvancedMetrics(name, symbol) {
  // Fetch all candles; OI in parallel
  const [raw4h, raw5d, raw14d, raw30d, rawFlow, oi] = await Promise.all([
    fetchKlines(name, symbol, '4h', CFG.KLINES_MAIN),
    fetchKlines(name, symbol, '4h', CFG.KLINES_5D),
    fetchKlines(name, symbol, '4h', CFG.KLINES_14D),
    fetchKlines(name, symbol, '4h', CFG.KLINES_30D),
    fetchKlines(name, symbol, '1h', CFG.FLOW_LIMIT),
    fetchOI(name, symbol),
  ]);

  const df4h  = parseKlines(raw4h);
  const df5d  = parseKlines(raw5d);
  const df14d = parseKlines(raw14d);
  const df30d = parseKlines(raw30d);
  const dfFl  = parseKlines(rawFlow);

  // ── Indicators on 4H ──────────────────────────────────────────
  const rsi     = calcRsi(df4h, CFG.RSI_PERIOD);
  const atr     = calcAtr(df4h, CFG.ATR_PERIOD);
  const emaFast = calcEma(df4h, CFG.EMA_FAST);
  const emaSlow = calcEma(df4h, CFG.EMA_SLOW);

  const volAvg  = df4h.slice(-(CFG.VOL_AVG_WINDOW+1), -1).reduce((s,k)=>s+k.Volume,0) / CFG.VOL_AVG_WINDOW;
  const volCurr = df4h[df4h.length-1].Volume;
  const volSpike = volCurr >= CFG.VOL_SPIKE_MULT * volAvg;

  // Sweep: current candle vs ALL-TIME high/low of previous candles
  const last = df4h[df4h.length-1];
  const prevSlice = df4h.slice(0, -1);
  let prevHighV = -Infinity, prevLowV = Infinity;
  for (const k of prevSlice) { if (k.High > prevHighV) prevHighV = k.High; if (k.Low < prevLowV) prevLowV = k.Low; }
  let sweep = "Neutral";
  if (last.High > prevHighV && last.Close < prevHighV) sweep = "BUY_SWP";
  else if (last.Low  < prevLowV  && last.Close > prevLowV)  sweep = "SELL_SWP";

  // ── Multi-timeframe POC / AVWAP ────────────────────────────────
  const { poc:poc5d,  avwap:avwap5d  } = calcPocAvwap(df5d);
  const { poc:poc14d, avwap:avwap14d } = calcPocAvwap(df14d);
  const { poc:poc30d, avwap:avwap30d } = calcPocAvwap(df30d);

  // ── CVD (uses raw Binance-format arrays, index 5=total, 9=buy) ─
  const cvd5d  = calcCvd(raw5d);
  const cvd14d = calcCvd(raw14d);
  const cvd30d = calcCvd(raw30d);

  // ── Structure ──────────────────────────────────────────────────
  const structure4h  = calcMarketStructure(df4h,  CFG.STRUCT_LOOKBACK_4H);
  const structure30d = calcMarketStructure(df30d, CFG.STRUCT_LOOKBACK_30D);

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
  const obvData   = calcOBV(df4h);
  const fibData   = calcFib(df4h);
  const change24h = calcChange24h(dfFl);
  const atrPct    = calcAtrPct(atr, last.Close);

  return {
    rsi, atr, poc5d, avwap5d, poc14d, avwap14d, poc30d, avwap30d,
    sweep, flow, structure4h, structure30d,
    oiNow:oi.oiNow, oiChange:oi.oiChange,
    cvd5d, cvd14d, cvd30d,
    currClose:last.Close, fvgList,
    emaFast, emaSlow, volSpike, volCurr, volAvg,
    adx: adxData, macd: macdData, bb: bbData, bbBw: bbData.bw,
    obv: obvData, fib: fibData, change24h, atrPct,
  };
}

// ══════════════════════════════════════════════════════════════════
//  SIGNAL INTERPRETATION
// ══════════════════════════════════════════════════════════════════
export function interpretSignals(price, rsi, atr, flow, oiChange,
  poc5d, avwap5d, poc14d, avwap14d, avwap30d,
  cvd5d, cvd14d, cvd30d, structure4h, structure30d,
  sweep, fvgList, emaFast, emaSlow, volSpike, volCurr, volAvg)
{
  const { bearMac, bullMac, nPoc5d, nPoc14d, sBull, sBear, dBull, dBear,
          buyP, selP, shOp, sqR, aAcc, aDis, bnce, corr } =
    deriveConditions(price, flow, oiChange, poc5d, avwap5d, poc14d, avwap14d, avwap30d,
      cvd5d, cvd14d, cvd30d, structure30d);

  const S = {};
  const fvgTag = g => `[FVG ${g.bottom.toFixed(2)}-${g.top.toFixed(2)} ${g.sizePct.toFixed(2)}%]`;

  // 1. TREND MACRO
  if      (bearMac>=3) S['Trend Macro'] = ["BEAR",    "bear",    "Price below AVWAP 14d/30d + CVD/Structure confirms"];
  else if (bullMac>=3) S['Trend Macro'] = ["BULL",    "bull",    "Price above AVWAP 14d/30d + CVD/Structure confirms"];
  else                 S['Trend Macro'] = ["NEUTRAL",  "neutral", "Mixed signals, no clear direction"];

  // 2. TREND SWING
  const fvgBN = fvgList.filter(g=>g.type==='BULL' && Math.abs(price-g.mid)/price*100<CFG.FVG_NEAR_PCT && price>=g.bottom);
  const fvgBE = fvgList.filter(g=>g.type==='BEAR' && Math.abs(price-g.mid)/price*100<CFG.FVG_NEAR_PCT && price<=g.top);
  if      (sBull) S['Trend Swing'] = ["BULLISH",  "bull",    "Price > AVWAP5d + ACC + 24h flow positive"];
  else if (sBear) S['Trend Swing'] = ["BEARISH",  "bear",    "Price < AVWAP5d + DIS + 24h flow negative"];
  else if (dBear) S['Trend Swing'] = ["DIV BEAR", "warn",    "Price high but CVD5d distributing — weak rally"];
  else if (dBull) S['Trend Swing'] = ["DIV BULL", "warn",    "Price low but CVD5d accumulating — reversal potential"];
  else            S['Trend Swing'] = ["NEUTRAL",  "neutral", "No clear swing signal"];

  // 3. PRESSURE
  if      (selP) S['Presiune'] = ["SELL STRONG",   "bear",    "24h flow neg + OI 7d falling + CVD5d DIS"];
  else if (buyP) S['Presiune'] = ["BUY STRONG",    "bull",    "24h flow pos + OI 7d rising + CVD5d ACC"];
  else if (shOp) S['Presiune'] = ["SHORT ACTIVE",  "warn",    "Neg flow but OI rising — new shorts opening"];
  else if (sqR)  S['Presiune'] = ["SQUEEZE RISK",  "warn",    "Positive flow + OI 7d falling — short squeeze possible"];
  else           S['Presiune'] = ["BALANCED",       "neutral", "Buy/sell pressure approximately balanced"];

  // 4. TREND QUALITY (CVD convergence)
  if      (aDis) S['Calitate Trend'] = ["FULL DISTRIB",    "bear",    "DIS on all 3 horizons — robust 4H bear"];
  else if (aAcc) S['Calitate Trend'] = ["FULL ACCUM",      "bull",    "ACC on all 3 horizons — robust 4H bull"];
  else if (bnce) S['Calitate Trend'] = ["BOUNCE/BEAR",     "warn",    "Recent ACC (5d) in macro bear — caution"];
  else if (corr) S['Calitate Trend'] = ["PULLBACK/BULL",   "warn",    "Recent DIS (5d) in macro bull — entry opportunity"];
  else           S['Calitate Trend'] = ["MIXED",            "neutral", "CVD inconsistent across horizons"];

  // 5. SETUP
  if (sweep==="SELL_SWP" && flow>0 && oiChange>0) {
    const ex = fvgBN.length ? " ★ "+fvgTag(fvgBN[0]) : "";
    S['Setup'] = ["LONG VALID",    "bull", "Sell sweep 4H + positive 24h flow + OI rising"+ex];
  } else if (sweep==="BUY_SWP" && flow<0 && oiChange<0) {
    const ex = fvgBE.length ? " ★ "+fvgTag(fvgBE[0]) : "";
    S['Setup'] = ["SHORT VALID",   "bear", "Buy sweep 4H + neg 24h flow + OI falling"+ex];
  } else if (nPoc5d && cvd5d>0 && price>avwap5d && structure4h!=="Bearish" && structure30d!=="Bearish") {
    const ex = fvgBN.length ? " ★ "+fvgTag(fvgBN[0]) : "";
    S['Setup'] = ["LONG @ POC5d",  "bull", "At POC5d + ACC + above AVWAP + structure ok"+ex];
  } else if (nPoc5d && cvd5d<0 && price<avwap5d && structure4h!=="Bullish" && structure30d!=="Bullish") {
    const ex = fvgBE.length ? " ★ "+fvgTag(fvgBE[0]) : "";
    S['Setup'] = ["SHORT @ POC5d", "bear", "At POC5d + DIS + below AVWAP + structure ok"+ex];
  } else if (nPoc14d && structure4h==="Bullish" && !(price<avwap5d && cvd5d<0 && flow<0)) {
    S['Setup'] = ["LONG SWING14d", "bull", "At POC14d + 4H structure bullish"];
  } else if (nPoc14d && structure4h==="Bearish" && !(price>avwap5d && cvd5d>0 && flow>0)) {
    S['Setup'] = ["SHORT SWING14d","bear", "At POC14d + 4H structure bearish"];
  } else {
    S['Setup'] = ["WAIT",          "neutral", "No clear entry confluence on 4H"];
  }

  // 6. RISK
  if      (rsi>CFG.RSI_OB && flow>CFG.FLOW_STRONG)               S['Risc'] = ["HIGH",   "bear", "RSI 4H overbought + 24h flow extreme"];
  else if (rsi<CFG.RSI_OS && flow<-CFG.FLOW_STRONG)              S['Risc'] = ["HIGH",   "bear", "RSI 4H oversold + 24h flow extreme"];
  else if (Math.abs(flow)>CFG.FLOW_STRONG && Math.abs(oiChange)>CFG.OI_SQUEEZE_MED)
                                                                   S['Risc'] = ["MEDIUM", "warn", "24h flow and 7d OI both accelerating"];
  else if (structure4h!==structure30d && structure4h!=="Neutral" && structure30d!=="Neutral")
                                                                   S['Risc'] = ["MEDIUM", "warn", `Str 4H (${structure4h}) vs 30d (${structure30d}) conflict`];
  else                                                             S['Risc'] = ["LOW",    "bull", "Normal conditions, no 4H extremes"];

  // 7. GRID BOT
  const gridLo = Math.min(poc5d,poc14d)*(1-CFG.GRID_BUFFER), gridHi = Math.max(poc5d,poc14d)*(1+CFG.GRID_BUFFER);
  if (Math.abs(cvd5d) < Math.abs(cvd14d)*CFG.CVD_LATERAL_RATIO && Math.abs(flow)<CFG.FLOW_STRONG)
    S['Bot Grid'] = ["RECOMMENDED","bull", `4H sideways. Zone: ${gridLo.toFixed(2)} – ${gridHi.toFixed(2)}`];
  else if (structure4h==="Neutral" && structure30d==="Neutral")
    S['Bot Grid'] = ["POSSIBLE",   "warn", `Neutral structure. Zone: ${gridLo.toFixed(2)} – ${gridHi.toFixed(2)}`];
  else
    S['Bot Grid'] = ["AVOID",      "bear", "Active 4H trend detected — grid may be breached"];

  // 8. FVG
  const inside = fvgList.filter(g => g.bottom<=price && price<=g.top);
  const near   = fvgList.filter(g => !inside.includes(g) && Math.abs(price-g.mid)/price*100 < 1.0)
                        .sort((a,b) => Math.abs(a.mid-price)-Math.abs(b.mid-price));
  if (inside.length) {
    const g = inside[0];
    const fp = (g.top-g.bottom)>0 ? (price-g.bottom)/(g.top-g.bottom)*100 : 0;
    const z  = `${g.bottom.toFixed(2)}–${g.top.toFixed(2)} (${g.sizePct.toFixed(2)}%, filled ${fp.toFixed(1)}%)`;
    if (g.type==='BULL' && structure4h!=="Bearish") S['FVG'] = ["FILLING BULL ★","bull", "Price INSIDE bull FVG: "+z];
    else if (g.type==='BULL')                       S['FVG'] = ["FILLING BULL",   "warn", "Inside bull FVG (str not confirming): "+z];
    else if (g.type==='BEAR' && structure4h!=="Bullish") S['FVG'] = ["FILLING BEAR ★","bear","Price INSIDE bear FVG: "+z];
    else                                            S['FVG'] = ["FILLING BEAR",   "warn", "Inside bear FVG (str not confirming): "+z];
  } else if (near.length) {
    const g = near[0], dp = (Math.abs(price-g.mid)/price*100).toFixed(2);
    const z = `${g.bottom.toFixed(2)}–${g.top.toFixed(2)} (${g.sizePct.toFixed(2)}%, dist ${dp}%)`;
    if (g.type==='BULL' && structure4h!=="Bearish") S['FVG'] = ["BULL FVG ★","bull", "Bull gap near: "+z];
    else if (g.type==='BULL')                       S['FVG'] = ["BULL FVG",   "warn", "Bull gap (4H str not confirming): "+z];
    else if (g.type==='BEAR' && structure4h!=="Bullish") S['FVG'] = ["BEAR FVG ★","bear","Bear gap near: "+z];
    else                                            S['FVG'] = ["BEAR FVG",   "warn", "Bear gap (4H str not confirming): "+z];
  } else if (fvgList.length) {
    const g = fvgList[0], dp = (Math.abs(price-g.mid)/price*100).toFixed(2);
    S['FVG'] = [`${g.type} FVG FAR`, "neutral", `Nearest: ${g.bottom.toFixed(2)}-${g.top.toFixed(2)}, dist ${dp}%`];
  } else {
    S['FVG'] = ["–", "neutral", "No active FVG on last 100 4H candles"];
  }

  // 9. EMA TREND
  if      (emaFast>emaSlow && price>emaFast) S['EMA Trend'] = ["BULL",         "bull",    `Price > EMA50(${emaFast.toFixed(2)}) > EMA200(${emaSlow.toFixed(2)})`];
  else if (emaFast<emaSlow && price<emaFast) S['EMA Trend'] = ["BEAR",         "bear",    `Price < EMA50(${emaFast.toFixed(2)}) < EMA200(${emaSlow.toFixed(2)})`];
  else if (emaFast>emaSlow && price<emaFast) S['EMA Trend'] = ["BULL/PULLBACK","warn",    "EMA50>EMA200 but price below EMA50 — pullback?"];
  else if (emaFast<emaSlow && price>emaFast) S['EMA Trend'] = ["BEAR/BOUNCE",  "warn",    "EMA50<EMA200 but price above EMA50 — dead cat?"];
  else                                       S['EMA Trend'] = ["NEUTRAL",       "neutral", `EMA50≈EMA200, no clear bias`];

  // 10. VOLUME SPIKE
  const vr = volAvg > 0 ? volCurr / volAvg : 1;
  if      (volSpike && price>avwap5d) S['Vol Spike'] = ["BULL SPIKE", "bull",    `Volume ${vr.toFixed(1)}x avg — bullish breakout`];
  else if (volSpike && price<avwap5d) S['Vol Spike'] = ["BEAR SPIKE", "bear",    `Volume ${vr.toFixed(1)}x avg — bearish breakdown`];
  else if (vr > 1.5)                  S['Vol Spike'] = ["ELEVATED",   "warn",    `Volume ${vr.toFixed(1)}x avg — watch direction`];
  else                                S['Vol Spike'] = ["NORMAL",     "neutral", `Volume ${vr.toFixed(1)}x avg`];

  return S;
}

// ══════════════════════════════════════════════════════════════════
//  SCORING ENGINE
// ══════════════════════════════════════════════════════════════════
export function calcScore(price, atr, rsi, flow, oiChange,
  poc5d, avwap5d, poc14d, avwap14d, avwap30d,
  cvd5d, cvd14d, cvd30d, structure4h, structure30d,
  sweep, fvgList, emaFast, emaSlow)
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
  if      (aAcc && direction==="LONG")   { score+=1.0; detail.push(["CVD ACC all 3 TFs",+1.0,"CVD5d/14d/30d all positive"]); }
  else if (aDis && direction==="SHORT")  { score+=1.0; detail.push(["CVD DIS all 3 TFs",+1.0,"CVD5d/14d/30d all negative"]); }
  else if (corr && direction==="LONG")   { score+=0.5; detail.push(["CVD Pullback in BULL",+0.5,"Recent DIS(5d) in bull trend"]); }
  else if (bnce && direction==="SHORT")  { score+=0.5; detail.push(["CVD Bounce in BEAR",+0.5,"Recent ACC(5d) in bear trend"]); }
  else if (aAcc && direction==="SHORT")  { score-=0.3; detail.push(["CVD ACC contra SHORT",-0.3,"CVD acc contradicts short"]); }
  else if (aDis && direction==="LONG")   { score-=0.3; detail.push(["CVD DIS contra LONG",-0.3,"CVD dis contradicts long"]); }
  else detail.push(["CVD mixed",0.0,"Inconsistent across TFs"]);

  // 5. SETUP
  if (sweep==="SELL_SWP" && flow>0 && oiChange>0 && direction==="LONG")
    { score+=2.0; detail.push(["Setup SELL SWEEP→LONG",+2.0,"Liq sweep+flow+OI rising"]); }
  else if (sweep==="BUY_SWP" && flow<0 && oiChange<0 && direction==="SHORT")
    { score+=2.0; detail.push(["Setup BUY SWEEP→SHORT",+2.0,"Liq sweep+flow+OI falling"]); }
  else if (["SELL_SWP","BUY_SWP"].includes(sweep))
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
    if      (direction==="LONG"  && eb) { score+=0.5; detail.push(["EMA50/200 aligned LONG",+0.5,"Price>EMA50>EMA200"]); }
    else if (direction==="SHORT" && eB) { score+=0.5; detail.push(["EMA50/200 aligned SHORT",+0.5,"Price<EMA50<EMA200"]); }
    else if (direction==="LONG"  && eB) { score-=0.5; detail.push(["EMA50/200 contra LONG",-0.5,"Price<EMA50<EMA200"]); }
    else if (direction==="SHORT" && eb) { score-=0.5; detail.push(["EMA50/200 contra SHORT",-0.5,"Price>EMA50>EMA200"]); }
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
  if (pd1<CFG.POC_CONFLUENCE_PCT && pd2<CFG.POC_CONFLUENCE_PCT)
    { score+=0.5; detail.push(["POC Confluence [YES]",+0.5,`POC5d≈POC14d (<${CFG.POC_CONFLUENCE_PCT}%)`]); }
  else detail.push(["POC Confluence [-]",0.0,`POC5d=${poc5d.toFixed(2)} vs POC14d=${poc14d.toFixed(2)}`]);

  // PENALTIES
  if      (rsi>CFG.RSI_EXTREME_OB) { score-=0.5; detail.push(["RSI overbought",-0.5,`RSI=${rsi.toFixed(1)}`]); }
  else if (rsi<CFG.RSI_EXTREME_OS) { score-=0.5; detail.push(["RSI oversold",-0.5,`RSI=${rsi.toFixed(1)}`]); }
  if (direction==="SHORT" && oiChange>CFG.OI_SQUEEZE_HIGH) { score-=1.0; detail.push([`OI>${CFG.OI_SQUEEZE_HIGH}% on SHORT`,-1.0,"High squeeze risk"]); }
  else if (direction==="SHORT" && oiChange>CFG.OI_SQUEEZE_MED) { score-=0.5; detail.push([`OI>${CFG.OI_SQUEEZE_MED}% on SHORT`,-0.5,"Moderate squeeze risk"]); }
  else if (direction==="LONG"  && oiChange<-CFG.OI_SQUEEZE_HIGH) { score-=1.0; detail.push([`OI<-${CFG.OI_SQUEEZE_HIGH}% on LONG`,-1.0,"Massive long liquidations"]); }
  if (structure4h!==structure30d && structure4h!=="Neutral" && structure30d!=="Neutral")
    { score-=0.5; detail.push(["Struct conflict",-0.5,`4H=${structure4h} vs 30d=${structure30d}`]); }

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

export function calcOBV(df) {
  if (df.length < 2) return { obv: 0, trend: 'FLAT' };
  let obv = 0;
  const obvArr = [0];
  for (let i = 1; i < df.length; i++) {
    if (df[i].Close > df[i-1].Close) obv += df[i].Volume;
    else if (df[i].Close < df[i-1].Close) obv -= df[i].Volume;
    obvArr.push(obv);
  }
  const lookback = Math.min(10, obvArr.length - 1);
  const obvOld = obvArr[obvArr.length - 1 - lookback];
  const obvNow = obvArr[obvArr.length - 1];
  const diffPct = obvOld !== 0 ? Math.abs((obvNow - obvOld) / Math.abs(obvOld)) * 100 : 0;
  const trend = diffPct < 2 ? 'FLAT' : obvNow > obvOld ? 'UP' : 'DOWN';
  return { obv: obvNow, trend };
}

export function calcFib(df, lookback = 50) {
  const slice = df.slice(-lookback);
  const swingHigh = Math.max(...slice.map(k => k.High));
  const swingLow  = Math.min(...slice.map(k => k.Low));
  const range = swingHigh - swingLow;
  const fibs = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
  const levels = fibs.map(f => ({ ratio: f, price: swingLow + f * range }));
  const price = df[df.length - 1].Close;
  let priceZone = 'Below 0';
  if (price > levels[levels.length - 1].price) {
    priceZone = 'Above 786';
  } else {
    for (let i = 0; i < levels.length - 1; i++) {
      if (price >= levels[i].price && price <= levels[i + 1].price) {
        priceZone = `${Math.round(fibs[i] * 1000)}–${Math.round(fibs[i+1] * 1000)}`;
        break;
      }
    }
  }
  return { swingHigh, swingLow, levels, priceZone };
}

export function calcChange24h(dfFl) {
  if (!dfFl || dfFl.length < 2) return 0;
  const firstOpen = dfFl[0].Open;
  const lastClose = dfFl[dfFl.length - 1].Close;
  return firstOpen > 0 ? (lastClose - firstOpen) / firstOpen * 100 : 0;
}

export function calcAtrPct(atr, price) {
  return price > 0 ? atr / price * 100 : 0;
}

export function calcRecommendation(score, direction, atrPct, funding, rsi) {
  const blockers = [];
  if (atrPct > 5)              blockers.push(`ATR ${atrPct.toFixed(1)}% > 5% (high volatility)`);
  if (Math.abs(funding) > 0.1) blockers.push(`Funding ${funding >= 0 ? '+' : ''}${funding.toFixed(4)}% extreme`);
  if (rsi > 75)                blockers.push(`RSI ${rsi.toFixed(1)} overbought (>75)`);
  if (rsi < 25)                blockers.push(`RSI ${rsi.toFixed(1)} oversold (<25)`);
  if (score >= 8 && blockers.length === 0) return { rec: 'Enter',   recClass: 'bull', blockers };
  if (score >= 8)              return { rec: 'Watch ⚠', recClass: 'warn', blockers };
  if (score >= 6)              return { rec: 'Watch',   recClass: 'warn', blockers };
  return                              { rec: 'Avoid',   recClass: 'bear', blockers };
}

export function calcDirectionConditions(price, emaSlow, structure4h, structure30d, avwap30d, rsi, adx, direction) {
  if (!direction) return { condsMet: 0, condsTotal: 6, pct: 0, conditions: [] };
  const isLong = direction === 'LONG';
  const conditions = [
    { met: isLong ? price > emaSlow    : price < emaSlow,         longDesc: 'Price > EMA200',         shortDesc: 'Price < EMA200' },
    { met: isLong ? structure4h === 'Bullish' : structure4h === 'Bearish', longDesc: 'Structure 4H: Bullish',  shortDesc: 'Structure 4H: Bearish' },
    { met: isLong ? structure30d === 'Bullish': structure30d === 'Bearish',longDesc: 'Structure 30d: Bullish', shortDesc: 'Structure 30d: Bearish' },
    { met: isLong ? price > avwap30d   : price < avwap30d,         longDesc: 'Price > AVWAP30d',       shortDesc: 'Price < AVWAP30d' },
    { met: adx > 20,                                               longDesc: `ADX ${adx.toFixed(1)} > 20 (trending)`, shortDesc: `ADX ${adx.toFixed(1)} > 20 (trending)` },
    { met: isLong ? (rsi >= 30 && rsi <= 65) : (rsi >= 35 && rsi <= 70),
      longDesc: `RSI ${rsi.toFixed(1)} in zone (30–65)`, shortDesc: `RSI ${rsi.toFixed(1)} in zone (35–70)` },
  ];
  const condsMet = conditions.filter(c => c.met).length;
  return { condsMet, condsTotal: 6, pct: Math.round(condsMet / 6 * 100), conditions };
}

export function calcBotParams(price, atr, score, direction, poc5d, poc14d, avwap5d, fvgList) {
  if (score < CFG.SCORE_BOT_MIN || !direction) return null;
  const slDist = atr * CFG.SL_ATR_MULT;
  let entry, sl, tp1, tp2, side;
  if (direction === "LONG") {
    const fvgE = fvgList.find(g=>g.type==='BULL' && Math.abs(price-g.mid)/price*100<CFG.FVG_ENTRY_PCT)?.top ?? price;
    entry = fvgE; sl = entry-slDist;
    tp1 = entry + slDist*(CFG.TP1_ATR_MULT/CFG.SL_ATR_MULT);
    tp2 = entry + slDist*(CFG.TP2_ATR_MULT/CFG.SL_ATR_MULT);
    side = "BUY / LONG";
  } else {
    const fvgE = fvgList.find(g=>g.type==='BEAR' && Math.abs(price-g.mid)/price*100<CFG.FVG_ENTRY_PCT)?.bottom ?? price;
    entry = fvgE; sl = entry+slDist;
    tp1 = entry - slDist*(CFG.TP1_ATR_MULT/CFG.SL_ATR_MULT);
    tp2 = entry - slDist*(CFG.TP2_ATR_MULT/CFG.SL_ATR_MULT);
    side = "SELL / SHORT";
  }
  const lev = score>=9.5?6:score>=9.0?5:score>=8.5?4:score>=8.0?3:2;
  const posPct = Math.min(30,(10-lev)*5);
  return { side, entry, sl, tp1, tp2, leverage:lev, posPct,
    rr1:Math.abs(tp1-entry)/Math.abs(sl-entry), rr2:Math.abs(tp2-entry)/Math.abs(sl-entry),
    trailTrigger:tp1, trailOffset:slDist*0.5, atrUsed:atr };
}
