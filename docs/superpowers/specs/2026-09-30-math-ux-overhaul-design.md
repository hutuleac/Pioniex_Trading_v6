# CIM v7 — Math Correctness + Grid-First UX

**Date:** 2026-09-30 · **Status:** Approved in chat, pending spec review

## Intent

**User:** Peter. He runs **Spot Grid and Futures Grid bots on Pionex**. He uses the app mostly on an iPhone 17 (402×874 CSS px) and sometimes on a PC.

**The 10-second job:** open the app, see which coin to grid right now, tap it, and copy the parameters into Pionex.

**Direction Signals** are context only. He rarely trades them manually.

**Success criteria:**
1. Every number shown is mathematically correct and reproducible. It is covered by `node tests/math.test.mjs`.
2. Grid output maps 1:1 to Pionex's bot form, including fees and leverage.
3. On iPhone, the first screen is useful in under 1 s (cached) and the best coin sits on top. No horizontal scroll, and no text under 12px.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Approach | A: fix and calibrate the math, then rebuild the UX grid-first. Backtest calibration (B) is a later spec. |
| Direction sheet | Keep the score and its breakdown. **Remove leverage and position sizing.** |
| Futures leverage | User setting, default **3×** |
| Fees | Settings. Spot defaults to **0.05%/side**, which Pionex publishes. Futures defaults to 0.05%/side (not confirmed, so conservative). |
| Delivery | Phase 1 (math) goes straight to master, and each commit ships on its own. Phase 2 (UX) goes on branch `v7-ux` with a Vercel preview, and merges after an iPhone test. |
| Stack | Vanilla ES modules. No build step, no package.json. |

## Verified defects (live Binance data, 2026-09-30)

| # | Defect | Evidence |
|---|---|---|
| D1 | `structure30d` uses the same last 5 4H candles as `structure4h` | Identical on 9/9 tickers. The conflict penalty can never fire. |
| D2 | The structure detector compares raw bars 0/2/4, not pivots | 8/9 tickers show "Neutral" |
| D3 | `m.volume5d` is never set, so the grid CVD ratio is \|CVD\|/1 | The CVD component is always 0/1.5 and every card shows "CVD Directional" |
| D4 | The squeeze threshold is DC20 width / ATR < 1.0 | The live range is 2.96–4.95, so SQUEEZE never fires |
| D5 | Bybit OI history is newest-first, but the code assumes oldest-first | OI 7d sign is inverted on the fallback path |
| D6 | EMA200 is seeded from one close with only 210 candles | 0.1–2.5% error against a 1000-candle EMA |
| D7 | The score `detail` is computed but never rendered | `buildDirectionSheet` ignores the argument |
| D8 | Direction position sizing ignores the SL distance | Account risk varies from 1% to 7% |
| D9 | The legend has the sweep meaning inverted, and a sweep is checked against all 209 prior candles | The legend contradicts the code, and sweeps almost never fire |
| D10 | Donchian, sweep and vol spike include the forming candle | "BREAK_UP" really means "within 0.25% of the current high" |
| D11 | Grid direction uses the 0–10 quality score as if it measured bearishness | A low score is read as "short grid" |
| D12 | Grid drawdown assumes all capital was bought at `rangeLow` | Drawdown is misstated |
| D13 | Profit/grid (arithmetic) divides by `rangeLow` | This overstates it. Pionex shows a min–max range. |
| D14 | Score and viability are independent | A card can show 7/10 while the coin is blocked |
| D15 | Three redundant 4H kline fetches per ticker | 27 wasted requests per refresh |
| D16 | Direction score adds Setup and POC points when there is no direction; the RSI penalty ignores direction | Non-directional coins get inflated scores |
| D17 | Two `SQUEEZE` configs (`CFG` and `GRID_CONFIG`) | They drift apart when retuned |

## Phase 1 — Math

### 1.1 Data layer (`api.js`, `indicators.js`, `config.js`)
- Fetch **one** 4H series per ticker with `KLINES_MAIN = 500`. The 5d, 14d and 30d windows are slices of it (the last 30, 84 and 180 candles). Keep the 1H×24 flow fetch and OI. (D15, D6)
- `calcEma` is seeded with the SMA of the first `span` closes. (D6)
- Bybit `oiHist` is reversed to oldest-first. (D5)
- Split the candles into `closed = df.slice(0, -1)` and `live = last`. Donchian, sweep, volume spike and structure use `closed`. Price, RSI, ATR and EMA keep using all candles, which is the standard live-indicator behaviour. (D10)

### 1.2 Indicators
- **Structure (D1, D2):** find fractal pivots, where a pivot high is a high greater than the `k` bars on each side. Compare the last two pivot highs and the last two pivot lows:
  - HH + HL = Bullish
  - LH + LL = Bearish
  - anything else = Neutral

  4H uses `k=2` over the last 40 closed candles. The 30d window uses `k=5` over 180 candles.
- **Sweep (D9):** the prior DC20 extreme, taken from closed candles excluding the last closed candle, is the level. The last closed candle is the one tested:
  - its high goes above the level and it closes back below → `HIGH_SWEEP` (bearish)
  - its low goes below the level and it closes back above → `LOW_SWEEP` (bullish)

  The Setup and legend text are updated to match.
- **POC/AVWAP:** each candle's volume is spread evenly across the bins its [Low, High] range overlaps. VWAP uses HLC3. Use 24 bins.
- **OBV trend:** ΔOBV over 10 bars ÷ total volume over those 10 bars. Below 5% = FLAT.
- **Squeeze/regime (D4, D17):** add a single `CFG.SQUEEZE`, deleting `GRID_CONFIG.SQUEEZE`. Thresholds are **per-coin percentiles** over the 500-candle history:
  - squeeze = the current BB width **and** the DC20 width/ATR both sit at or below the coin's 20th percentile
  - `squeezeConf` = 100 − the average percentile rank of the two
- **ADX, RSI, ATR, MACD, BB:** verified correct against Wilder and the standard definitions. No change.

### 1.3 Direction score (context) (D7, D8, D16)
- `direction == null` → the Setup, POC-confluence and FVG components score 0.
- The RSI penalty follows direction: RSI > 75 penalises LONG, RSI < 25 penalises SHORT.
- A single threshold `CFG.SCORE_ACTIVE = 7.5` is used by both `calcRecommendation` and the UI.
- `calcBotParams` is removed. The Direction sheet renders `detail`.

### 1.4 Grid engine (`grid.js`) — core
Types:
- `mode ∈ {spot, futures}`, from a setting
- `futures side ∈ {Long, Short, Neutral}`

- **Range:** ATR-based as today, but use the **daily σ** = ATR4h% × √6 (random-walk scaling) and a per-profile multiplier. Spot is always centred.
- **Futures side (D11):** based on bias, not quality.
  - `bias = sign(macro) when macro and 30d structure agree`
  - Long if bias > 0, Short if bias < 0, Neutral otherwise
  - Long and Short require ADX < ADX_BLOCK, otherwise the verdict is WAIT
- **Grid levels:** an explicit array. Arithmetic: `L + i·(U−L)/n`. Geometric: `L·(U/L)^(i/n)`. Every derived number comes from this array.
- **Profit/grid (D13):** for each step, net = `(p[i+1]/p[i] − 1) − 2·fee`. The result is `{min, max}`. Viability uses **min**, and the count recommender targets min ≥ `TARGET_NET_PCT`. Count is clamped to Pionex's limits: 2–500 for futures (from Pionex's FAQ), and 2–150 for spot, which is **unverified**. Both are kept in config.
- **SL/TP:** SL = `L − SL_ATR_MULT·ATR`, TP = `U + TP_ATR_MULT·ATR`. They are shown as a price and as a % from the current price.
- **Spot drawdown at SL (D12):** starting at the current price P:
  - the levels below P hold USDT and buy one slice each on the way down
  - the levels above P hold coin bought at P

  Coins held at L = the sum of the slices. Loss at SL = capital − (coins × SL + unspent USDT). Break-even price is shown too.
- **Futures:** margin = capital. Notional = capital × leverage.
  - Estimate the average entry and position at L (Long/Neutral) or at U (Short) using the same level walk.
  - Liquidation estimate = `avgEntry × (1 ∓ 1/lev ± MMR)`, with MMR = 0.5% in config.
  - **Flag** if the liquidation price is closer than SL.
  - This is labelled "estimate". A test fixture from a real Pionex bot will be added when the user provides one.
- **Time before exit:** `T_days ≈ ((U−L)/2 / P / σ_daily)²` (first-exit time of a random walk from the centre), labelled "expected days in range".
- **Verdict (D14):** `calcGridVerdict(m, settings)` → `{verdict: GRID_NOW|DEVELOPING|WAIT|BLOCKED, score, reason, components, recs}`.
  - BLOCKED overrides the score.
  - Sorting: verdict rank first, then score.
- **CVD lateral (D3):** `volume5d` = the sum of 5d volume. Ratio = |CVD5d| / volume5d. The UI pill uses the same ramp as the score, not the stale `CFG.CVD_LATERAL_RATIO`, which is deleted.

### 1.5 Verification
- `tests/fixtures/klines-BTC-4h.json` (500 candles) and `tests/fixtures/klines-SOL-4h.json` are checked in.
- `tests/math.test.mjs` uses `node:assert` and runs with plain `node tests/math.test.mjs`. It sets up a `localStorage` stub before its dynamic import.

  Asserts:
  - RSI, ATR and EMA against reference values (the SMA-seed convergence test)
  - that structure4h ≠ structure30d is reachable
  - that pivots are detected on a synthetic HH/HL series
  - sweep on synthetic candles
  - Bybit OI order
  - grid levels, profit min/max and drawdown on hand-computed examples
  - liquidation ordering against SL
  - verdict sorting
- Checked: Node v26 imports the repo's `.js` ES modules without a package.json (module syntax detection), so no package.json is added.

## Phase 2 — UX (branch `v7-ux`)

### 2.1 Shell
- `viewport-fit=cover`. Every fixed element uses `env(safe-area-inset-*)`.
- Topbar is one line: `CIM` · status dot + "updated 2m ago" · refresh icon button, 44px.
- Market pulse (F&G, Smart $, 24h vol) sits in a horizontally scrollable chip row under the topbar.
- **Tab bar:** Grid (default) · Signals · Settings.
  - On phones it's a fixed bottom bar with 44px targets.
  - At ≥1024px the same markup is restyled as top tabs, and cards flow into 2–3 columns.
  - The active tab is remembered in localStorage.

### 2.2 Grid tab
- A **Spot | Futures** segmented control, persisted.
- A ranked list, sorted by verdict then score. Each row shows:
  - ticker, price
  - verdict badge, score
  - range width %, profit/grid min–max, expected days in range
  - for BLOCKED rows: dimmed, sorted to the bottom, with the one-line reason shown inline
- **Sheet**, in Pionex form order. Each field is tap-to-copy (Clipboard API with a toast):
  - Lower, Upper, Grids, Mode (Arithmetic/Geometric)
  - Futures only: Direction, Leverage
  - Investment, SL, TP
- Risk box:
  - Spot: drawdown at SL in $ and %, and the break-even price
  - Futures: estimated liquidation price and the gap to SL, with a red flag when the liquidation price comes before SL
  - profit/grid min–max, expected days in range
- "Why this score" is collapsible: component bars plus the missing-condition recs.
- "Regime & indicators" is collapsible.
- The sheet closes by swiping down on the handle, tapping the backdrop, the close button or Esc. It sets `role="dialog"` and moves focus into itself.

### 2.3 Signals tab
- A compact list: ticker · LONG/SHORT/— · score · regime badge.
- Sheet: the score breakdown (`detail` rows with +/− values), trend table, and regime block. No entry, leverage or sizing.

### 2.4 Settings tab
- Grid capital, futures leverage, spot fee, futures fee, and tickers (add/remove chips).
- All inputs have a font-size of at least 16px.
- The glossary is collapsed here, and LEGENDS are rewritten to match the phase-1 math.

### 2.5 Speed and freshness
- The last successful results are cached in localStorage (`cim_cache_v7`) and rendered instantly with a "stale" marker.
- Each ticker renders progressively as it completes. The loop stays sequential for rate limits.
- The market pulse fetch runs in parallel and no longer blocks tickers.
- On `visibilitychange` → visible, refresh if the last update is older than `REFRESH_INTERVAL_SEC`.

### 2.6 Visual
- Existing palette tokens are kept.
- Minimum text 12px. Numbers use `font-variant-numeric: tabular-nums`.
- Fonts: Chakra Petch and JetBrains Mono only. The stray `IBM Plex Mono` references are removed.
- Inline styles in ui.js and app.js move into CSS classes.
- Light theme is not in scope.

### 2.7 Removed
`buildTableRow`, the header-tooltip floater, `window._attachHeaderTips`, the duplicate card sections, `calcBotParams`, `CFG.CVD_LATERAL_RATIO`, `GRID_CONFIG.SQUEEZE`, and the unused `socialHype` pulse field.

### 2.8 Verification
- Playwright screenshots at 402×874 and 1440×900, before and after.
- Check for no horizontal overflow at 402px (`scrollWidth === clientWidth`).
- Check that no console errors appear.
- The user tests on a real iPhone via the Vercel preview URL before merge.

## Docs sync (in scope)
Update README, CHANGELOG (v7.0), `CFG.APP_VERSION = '7.0'`, and CLAUDE.md (architecture, constants, score system, UI layout). CLAUDE.md is currently stale at v5.4.

## Out of scope
- Backtest-driven weight calibration (the follow-up spec, approach B)
- Monitoring running bots
- Other Pionex bot types
- Push notifications
- Light theme
