// One-off: snapshot live Binance klines for offline tests.  Run: node tests/fetch-fixtures.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const get = async u => (await fetch(u)).json();
const base = 'https://fapi.binance.com/fapi/v1/klines';
mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true });
for (const s of ['BTCUSDT', 'SOLUSDT']) {
  const k4 = await get(`${base}?symbol=${s}&interval=4h&limit=1000`);
  const k1 = await get(`${base}?symbol=${s}&interval=1h&limit=24`);
  writeFileSync(new URL(`./fixtures/${s}.json`, import.meta.url), JSON.stringify({ k4, k1 }));
  console.log(s, k4.length, k1.length);
}
