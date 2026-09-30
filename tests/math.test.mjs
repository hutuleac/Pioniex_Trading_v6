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

// ── summary ──
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
