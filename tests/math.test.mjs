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

// ── summary ──
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
