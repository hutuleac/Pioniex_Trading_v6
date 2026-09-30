// Math self-checks. Run: node tests/math.test.mjs   (offline — uses tests/fixtures)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};

const I = await import('../js/indicators.js');
const G = await import('../js/grid.js');
const A = await import('../js/api.js');
const C = await import('../js/config.js');
const fx = s => JSON.parse(readFileSync(new URL(`./fixtures/${s}.json`, import.meta.url)));

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n      ', e.message); }
}
const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}±${tol}, got ${a}`);
const bar = (mid, vol = 100, w = 1) =>
  ({ Time: 0, Open: mid, High: mid + w, Low: mid - w, Close: mid, Volume: vol, TotalVol: vol, BuyVol: vol / 2 });
const wave = (n, base, slope, amp = 10, period = 20) =>
  Array.from({ length: n }, (_, i) => bar(base + slope * i + amp * Math.sin(2 * Math.PI * i / period)));

// ── baseline indicators (already correct — regression guard) ──
await test('RSI of a strictly rising series is 100', () => {
  assert.equal(I.calcRsi(Array.from({ length: 30 }, (_, i) => bar(100 + i)), 14), 100);
});
await test('ATR of constant 2-wide bars is 2', () => {
  near(I.calcAtr(Array.from({ length: 30 }, () => bar(100)), 14), 2, 1e-9);
});

// ── Task 2: dead code removed ──
await test('dead indicator exports are gone', () => {
  for (const k of ['interpretSignals', 'calcDirectionConditions', 'calcOBV', 'calcFib', 'calcChange24h'])
    assert.equal(I[k], undefined, `${k} should be deleted`);
  assert.equal(C.SIG_TIPS, undefined, 'SIG_TIPS should be deleted');
});

// ── Task 3: data layer ──
const btc = fx('BTCUSDT');
await test('EMA over exactly `span` bars equals the SMA (SMA seed)', () => {
  near(I.calcEma(Array.from({ length: 20 }, (_, i) => bar(i + 1)), 20), 10.5, 1e-9);
});
await test('EMA200 on 499 candles is within 0.3% of EMA200 on 1000', () => {
  const d = I.parseKlines(btc.k4);
  near(I.calcEma(d.slice(-499), 200) / I.calcEma(d, 200), 1, 0.003);
});
await test('Bybit OI history is returned oldest-first', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ result: { list: [
    { openInterest: '300', timestamp: '3' }, { openInterest: '100', timestamp: '1' } ] } }) });
  try {
    const h = await A.Y.oiHist('BTCUSDT');
    assert.deepEqual(h.map(x => +x.sumOpenInterest), [100, 300]);
  } finally { globalThis.fetch = real; }
});
await test('getAdvancedMetrics makes 4 HTTP calls (was 7)', async () => {
  const real = globalThis.fetch; let n = 0;
  globalThis.fetch = async url => {
    n++; const u = String(url);
    const body = u.includes('interval=4h') ? btc.k4.slice(-499) : u.includes('interval=1h') ? btc.k1
      : u.includes('openInterestHist') ? [{ sumOpenInterest: '100' }, { sumOpenInterest: '110' }]
      : { openInterest: '110' };
    return { ok: true, json: async () => body };
  };
  try { await I.getAdvancedMetrics('BTC', 'BTCUSDT'); assert.equal(n, 4); }
  finally { globalThis.fetch = real; }
});
await test('computeMetrics on fixture: finite core values + volume5d', () => {
  const m = I.computeMetrics(btc.k4.slice(-499), btc.k1, { oiNow: 1, oiChange: 2 });
  for (const k of ['rsi', 'atr', 'emaFast', 'emaSlow', 'poc5d', 'avwap30d', 'cvd30d', 'flow', 'volume5d'])
    assert.ok(Number.isFinite(m[k]), `${k} not finite: ${m[k]}`);
  assert.ok(m.volume5d > 0);
});
await test('computeMetrics survives a 60-candle new listing', () => {
  const m = I.computeMetrics(btc.k4.slice(-60), btc.k1, { oiNow: null, oiChange: 0 });
  assert.ok(Number.isFinite(m.rsi) && Number.isFinite(m.atr) && Number.isFinite(m.emaSlow));
});

// ── Task 4: structure + sweep ──
await test('rising zigzag → Bullish, falling → Bearish', () => {
  assert.equal(I.calcMarketStructure(wave(60, 100, 0.5), 2), 'Bullish');
  assert.equal(I.calcMarketStructure(wave(60, 200, -0.5), 2), 'Bearish');
});
await test('4H and 30d structure can now differ', () => {
  const d = [...wave(140, 200, -0.5), ...Array.from({ length: 40 }, () => bar(100))];
  assert.equal(I.calcMarketStructure(d.slice(-40), 2), 'Neutral');
  assert.equal(I.calcMarketStructure(d, 5), 'Bearish');
});
const flat = n => Array.from({ length: n }, () => bar(100));   // High 101, Low 99
await test('high poked above prior 20-bar high and closed back inside → HIGH_SWEEP', () => {
  assert.equal(I.calcSweep([...flat(21), { ...bar(100), High: 103, Close: 100.5 }], 20), 'HIGH_SWEEP');
});
await test('low poked below prior 20-bar low and closed back inside → LOW_SWEEP', () => {
  assert.equal(I.calcSweep([...flat(21), { ...bar(100), Low: 97, Close: 99.5 }], 20), 'LOW_SWEEP');
});
await test('close beyond the level is a breakout, not a sweep', () => {
  assert.equal(I.calcSweep([...flat(21), { ...bar(102), High: 103, Close: 102 }], 20), 'NONE');
});
await test('computeMetrics structure fields are valid labels', () => {
  const m = I.computeMetrics(btc.k4.slice(-499), btc.k1, { oiNow: 1, oiChange: 0 });
  for (const s of [m.structure4h, m.structure30d]) assert.ok(['Bullish', 'Bearish', 'Neutral'].includes(s));
  assert.ok(['HIGH_SWEEP', 'LOW_SWEEP', 'NONE'].includes(m.sweep));
});

// ── Task 5: POC / AVWAP ──
const cdl = (l, h, c, v) => ({ Open: c, High: h, Low: l, Close: c, Volume: v });
await test('AVWAP weights typical price (HLC3), not close', () => {
  // HLC3: (0+10+5)/3 = 5 and (8+10+10)/3 = 9.333 → (5·10 + 9.333·100) / 110
  near(I.calcPocAvwap([cdl(0, 10, 5, 10), cdl(8, 10, 10, 100)]).avwap, 8.9394, 1e-3);
});
await test('POC spreads volume over the high–low range', () => {
  // A: 100 vol over [0,10] (10/unit). B: 60 vol over [0,2] (30/unit) → densest node is in [0,2]
  const { poc } = I.calcPocAvwap([cdl(0, 10, 10, 100), cdl(0, 2, 1, 60)]);
  assert.ok(poc >= 0 && poc <= 2, `poc=${poc}`);
});

// ── Task 6: squeeze + Donchian ──
await test('squeeze detected when range compresses to the coin’s lowest percentile', () => {
  const d = [...wave(300, 100, 0, 10, 20), ...Array.from({ length: 30 }, () => bar(100, 100, 0.1))];
  const s = I.calcSqueeze(d);
  assert.equal(s.squeezed, true);
  assert.ok(s.conf >= 80, `conf=${s.conf}`);
});
await test('no squeeze when range is expanding', () => {
  const d = [...wave(300, 100, 0, 10, 20), ...wave(30, 100, 0, 40, 10)];
  assert.equal(I.calcSqueeze(d).squeezed, false);
});
await test('Donchian break means beyond the closed channel, not near its edge', () => {
  const dc = I.calcDonchian(flat(20), 20);                 // high 101, low 99
  assert.equal(I.donchianPos(101.5, dc), 'BREAK_UP');
  assert.equal(I.donchianPos(100.9, dc), 'INSIDE');        // old 0.25% buffer said BREAK_UP
  assert.equal(I.donchianPos(98.5, dc), 'BREAK_DOWN');
});
await test('computeMetrics exposes squeeze + squeezeConf', () => {
  const m = I.computeMetrics(btc.k4.slice(-499), btc.k1, { oiNow: 1, oiChange: 0 });
  assert.equal(typeof m.squeeze.squeezed, 'boolean');
  assert.ok(m.squeezeConf >= 0 && m.squeezeConf <= 100);
});

// ── Task 7: direction score ──
// args: price, atr, rsi, flow, oiChange, poc5d, avwap5d, poc14d, avwap14d, avwap30d,
//       cvd5d, cvd14d, cvd30d, structure4h, structure30d, sweep, fvgList, emaFast, emaSlow, dc20Pos, funding, regime
const scoreArgs = o => [o.price ?? 100, 1, o.rsi ?? 50, 0, 0, 100, 100, 100, o.avwap ?? 100, o.avwap ?? 100,
  0, 0, o.cvd30d ?? 0, 'Neutral', o.s30 ?? 'Neutral', o.sweep ?? 'NONE', [], 0, 0, 'INSIDE', 0, 'MIXED'];
await test('no directional bias → no setup/POC points (was +1.25)', () => {
  const r = I.calcScore(...scoreArgs({ sweep: 'LOW_SWEEP' }));
  assert.equal(r.direction, null);
  assert.equal(r.score, 0);
});
await test('RSI overbought does not penalise a SHORT bias', () => {
  const r = I.calcScore(...scoreArgs({ price: 90, avwap: 100, s30: 'Bearish', cvd30d: -1, rsi: 80 }));
  assert.equal(r.direction, 'SHORT');
  assert.ok(!r.detail.some(([c]) => c.startsWith('RSI')), 'unexpected RSI penalty');
});
await test('calcRecommendation: no direction → No bias', () => {
  assert.equal(I.calcRecommendation(9, null, 1, 0, 50).rec, 'No bias');
});
await test('calcBotParams removed', () => assert.equal(I.calcBotParams, undefined));

// ── Task 8: grid engine ──
await test('grid levels: arithmetic and geometric', () => {
  assert.deepEqual(G.gridLevels(90, 110, 2, false), [90, 100, 110]);
  G.gridLevels(100, 400, 2, true).forEach((v, i) => near(v, [100, 200, 400][i], 1e-9));
});
await test('profit/grid is a min–max range net of both fees', () => {
  const p = G.profitPerGrid([90, 100, 110], 0);
  near(p.max, 0.1111, 1e-4); near(p.min, 0.1, 1e-9);
  const g = G.profitPerGrid([100, 110, 121], 0.0005);
  near(g.min, 0.099, 1e-9); near(g.max, 0.099, 1e-9);
});
await test('grid count = largest n keeping min net ≥ target', () => {
  assert.equal(G.recommendGridCount(100, 110, false, 0.0005, 0.005, [2, 500]), 15);
  assert.equal(G.recommendGridCount(100, 100.5, false, 0.0005, 0.005, [2, 500]), 2);   // impossible → floor
});
await test('spot risk walks real grid fills down to the stop', () => {
  const r = G.spotRisk([90, 100, 110], 105, 200, 80);
  near(r.coins, 2.11111, 1e-4); near(r.lossAtSL, 31.111, 1e-2); near(r.breakEven, 94.737, 1e-2);
});
await test('futures long liquidation estimate + before-stop flag', () => {
  const r3 = G.futuresRisk([90, 100, 110], 105, 100, 3, 'Long', 0.005, 85, 120);
  near(r3.down.liq, 63.475, 1e-2); assert.equal(r3.down.liqBeforeStop, false); assert.equal(r3.up, null);
  const r10 = G.futuresRisk([90, 100, 110], 105, 100, 10, 'Long', 0.005, 85, 120);
  near(r10.down.liq, 85.69, 1e-2); assert.equal(r10.down.liqBeforeStop, true);
});
await test('futures short liquidation sits above the fills', () => {
  const r = G.futuresRisk([90, 100, 110], 95, 100, 3, 'Short', 0.005, 80, 115);
  near(r.up.liq, 138.99, 1e-1); assert.equal(r.up.liqBeforeStop, false); assert.equal(r.down, null);
});
await test('expected days in range (random-walk first exit)', () => {
  near(G.expectedDaysInRange(90, 110, 100, 5), 4, 1e-9);
});
await test('extreme volatility never produces a negative lower bound', () => {
  const r = G.calcRange(1, 30, 3.5, 'Long');
  assert.ok(r.lower > 0 && r.upper > r.lower, JSON.stringify(r));
});
await test('futures side follows bias, not quality', () => {
  assert.equal(G.selectFuturesSide({ structure30d: 'Bullish', adx: { adx: 10 } }, 'LONG'), 'Long');
  assert.equal(G.selectFuturesSide({ structure30d: 'Neutral', adx: { adx: 10 } }, 'LONG'), 'Neutral');
  assert.equal(G.selectFuturesSide({ structure30d: 'Bearish', adx: { adx: 30 } }, 'SHORT'), 'Neutral');
});
await test('calcGridPlan on fixture: coherent spot + futures plans', () => {
  const m = I.computeMetrics(btc.k4.slice(-499), btc.k1, { oiNow: 1, oiChange: 0 });
  m.price = m.currClose;
  const prof = G.getTickerGridProfile('BTC');
  const s = { capital: 500, leverage: 3, feeSpot: 0.0005, feeFutures: 0.0005 };
  const spot = G.calcGridPlan(m, prof, null, { ...s, mode: 'spot' });
  assert.ok(spot.lower < m.price && m.price < spot.upper);
  assert.ok(spot.count >= 2 && spot.count <= 150 && spot.levels.length === spot.count + 1);
  assert.ok(spot.sl < spot.lower && spot.tp > spot.upper && spot.sl > 0);
  const fut = G.calcGridPlan({ ...m, structure30d: 'Bearish', adx: { adx: 5 } }, prof, 'SHORT', { ...s, mode: 'futures' });
  assert.equal(fut.side, 'Short'); assert.ok(fut.sl > fut.upper && fut.tp < fut.lower);
});
await test('getSettings falls back to defaults on corrupt storage', () => {
  localStorage.setItem('cim_settings', '{bad json');
  const s = C.getSettings();
  assert.equal(s.capital, C.GRID_CONFIG.DEFAULT_CAPITAL);
  assert.equal(s.leverage, 3); assert.equal(s.mode, 'spot');
  localStorage.removeItem('cim_settings');
});
await test('setSettings round-trips and keeps other keys', () => {
  C.setSettings({ leverage: 5 }); C.setSettings({ mode: 'futures' });
  const s = C.getSettings();
  assert.equal(s.leverage, 5); assert.equal(s.mode, 'futures');
  localStorage.removeItem('cim_settings');
});

// ── Task 9: verdict ──
const U = await import('../js/ui.js');
const baseM = { adx: { adx: 10 }, bbBw: 4, bb: { label: 'normal' }, rsi: 50, funding: 0, poc5d: 100, poc14d: 100,
  cvd5d: 0, volume5d: 1000, squeeze: { squeezed: false, bwRank: 50, dcAtrRank: 50 }, atrPct: 1, structure4h: 'Neutral', dc20Pos: 'INSIDE' };
const okPlan = { lower: 95, upper: 105, profit: { min: 0.006, max: 0.007 }, mode: 'spot', risk: {} };
await test('trending coin is BLOCKED regardless of score', () => {
  const v = G.calcGridVerdict({ ...baseM, adx: { adx: 30 } }, okPlan);
  assert.equal(v.verdict, 'BLOCKED'); assert.match(v.reason, /ADX/);
});
await test('range too narrow to beat fees is BLOCKED with a fee reason', () => {
  const v = G.calcGridVerdict(baseM, { ...okPlan, profit: { min: -0.0005, max: 0.001 } });
  assert.equal(v.verdict, 'BLOCKED'); assert.match(v.reason, /Profit\/grid .* after fees/);
});
await test('futures liquidation before stop is BLOCKED', () => {
  const v = G.calcGridVerdict(baseM, { ...okPlan, mode: 'futures', leverage: 10, risk: { down: { liqBeforeStop: true }, up: null } });
  assert.equal(v.verdict, 'BLOCKED'); assert.match(v.reason, /Liquidation/);
});
await test('CVD component scores when flow is lateral (was always 0)', () => {
  const v = G.calcGridVerdict(baseM, okPlan);
  assert.equal(v.components.find(c => c.label === 'CVD Flow').score, 1.5);
});
await test('sort: verdict rank first, then score; blocked last', () => {
  const e = [{ n: 'a', verdict: { verdict: 'BLOCKED', score: 9 } }, { n: 'b', verdict: { verdict: 'WAIT', score: 2 } },
             { n: 'c', verdict: { verdict: 'GRID_NOW', score: 7.1 } }, { n: 'd', verdict: { verdict: 'GRID_NOW', score: 8 } }];
  assert.deepEqual(G.sortGridEntries(e).map(x => x.n), ['d', 'c', 'b', 'a']);
});
await test('fmtPrice keeps significant digits on sub-cent coins, no commas', () => {
  assert.equal(U.fmtPrice(0.0000123), '0.00001230');
  assert.equal(U.fmtPrice(0.09024), '0.09024');
  assert.equal(U.fmtPrice(81234.56), '81234.6');
  assert.equal(U.fmtPrice(null), '—');
});

// ── Task 10: docs ──
await test('glossary matches v7 math', () => {
  const text = C.LEGENDS.map(([n, d]) => n + ' ' + d).join('\n');
  for (const s of ['HIGH_SWEEP', 'Grid verdict', 'Expected days in range', 'Liquidation', 'percentile'])
    assert.ok(text.includes(s), `LEGENDS missing "${s}"`);
  for (const s of ['BUY_SWP', 'OBV', 'Fibonacci', 'bot parameters']) assert.ok(!text.includes(s), `stale "${s}"`);
  assert.equal(C.CFG.APP_VERSION, '7.0');
});

// ── Task 12: grid UI ──
const gridM = (() => {
  const m = I.computeMetrics(btc.k4.slice(-499), btc.k1, { oiNow: 1, oiChange: 0 });
  m.price = m.currClose; m.funding = 0; m.direction = null;
  const s = { capital: 500, leverage: 3, feeSpot: 0.0005, feeFutures: 0.0005 };
  m.gridPlans = {}; m.gridVerdicts = {};
  for (const mode of ['spot', 'futures']) {
    m.gridPlans[mode] = G.calcGridPlan(m, G.getTickerGridProfile('BTC'), null, { ...s, mode });
    m.gridVerdicts[mode] = G.calcGridVerdict(m, m.gridPlans[mode]);
  }
  return m;
})();
await test('grid rows are buttons that open the sheet, sorted, no NaN', () => {
  const html = U.buildGridList({ BTC: gridM, ETH: { ...gridM, gridVerdicts: { spot: { ...gridM.gridVerdicts.spot, verdict: 'BLOCKED', reason: 'x' } } } }, 'spot');
  assert.ok(html.indexOf('data-open="grid:BTC"') < html.indexOf('data-open="grid:ETH"'), 'blocked should sort last');
  assert.ok(!/NaN|undefined/.test(html), 'NaN/undefined in rows');
});
await test('grid sheet has copyable Pionex fields in form order', () => {
  const html = U.buildGridSheet('BTC', gridM, 'futures', 'Binance');
  const labels = [...html.matchAll(/data-label="([^"]+)"/g)].map(x => x[1]);
  assert.deepEqual(labels, ['Lower', 'Upper', 'Grids', 'Mode', 'Direction', 'Leverage', 'Investment', 'Stop loss', 'Take profit']);
  assert.ok(!/data-copy="[^"]*,/.test(html), 'copy values must not contain thousands separators');
  assert.ok(!/NaN|undefined/.test(html));
});

// ── Task 13: signals UI ──
await test('signal rows open sheets; sheet renders every score detail row', () => {
  const sc = { score: 6.2, direction: 'LONG', detail: [['Trend Macro BULL (full)', 2, '3/4'], ['RSI overbought vs LONG', -0.5, 'RSI=78']] };
  const list = U.buildSignalList({ BTC: gridM }, { BTC: sc }, { BTC: { rec: 'Developing', blockers: [] } });
  assert.match(list, /data-open="signal:BTC"/);
  const sheet = U.buildSignalSheet('BTC', gridM, sc, { rec: 'Developing', blockers: ['RSI 78.0 overbought vs LONG'] });
  assert.match(sheet, /Trend Macro BULL \(full\)/); assert.match(sheet, /\+2\.00/); assert.match(sheet, /−0\.50|-0\.50/);
  assert.ok(!/NaN|undefined/.test(sheet));
});

// ── summary ──
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
