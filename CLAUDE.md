# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

---

## Git Workflow

After every commit, always push immediately to `origin master` without asking for confirmation. Never leave commits unpushed.

---

# Pioniex Trading Dashboard — Project Reference

## Project Overview

CIM (Crypto Intelligence Matrix) v7.0 — client-side grid-bot advisor for **Pionex** (spot + futures grids), iPhone-first. Fetches Binance Futures (Bybit V5 fallback), computes indicators in the browser, and gives each coin one grid verdict (GRID NOW / DEVELOPING / WAIT / BLOCKED) plus Pionex-ready parameters. Direction score is context only (no trade entries). Deployed on Vercel. No backend, no build step.

**Stack:** Vanilla HTML + CSS + ES Modules (`<script type="module">`) · Google Fonts (Chakra Petch, IBM Plex Mono) · Vercel Analytics

## Running the Project

No build step. No npm install needed. Open `index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# or just open index.html in browser (ES Modules require HTTP — not file://)
```

Deployed to Vercel — pushes to `master` deploy automatically. No CI, no linter configured.

Tests: `node tests/math.test.mjs` (offline; fixtures in `tests/fixtures/`, refresh with `node tests/fetch-fixtures.mjs`).

## Architecture

| File | Responsibility |
|------|---------------|
| `index.html` | Shell: topbar, pulse row, tab bar, three tab panels, bottom sheet, toast |
| `js/config.js` | All constants: `CFG`, `GRID_CONFIG`, `BINANCE_BASE`, `BYBIT_BASE`, `BB_INT`, `LEGENDS`, `getSettings()/setSettings()` |
| `js/api.js` | HTTP layer: `B` (Binance endpoints), `Y` (Bybit endpoints), `tryFetch()`, `fetchPriceFunding()`, `fetchKlines()`, `fetchOI()` |
| `js/indicators.js` | Pure `computeMetrics(raw4h, rawFlow, oi)` (all indicators, one 499-candle 4H series sliced to 5d/14d/30d; closed candles for Donchian/sweep/structure/vol spike); `calcScore`, `calcRecommendation` |
| `js/ui.js` | `buildGridList/Sheet`, `buildSignalList/Sheet`, `buildPulse`, `buildRegimeBlock`, `fmtPrice` |
| `js/grid.js` | Grid engine: `calcGridPlan` (explicit levels → profit/grid min–max, spot drawdown, futures liquidation, days in range), `calcGridScore`, `calcGridVerdict`, `sortGridEntries` |
| `js/app.js` | State, sequential progressive fetch, cache (`cim_cache_v7`), tabs, sheet, settings, tickers |

**Module dependency graph (no circular deps):**
```
index.html
  └── css/style.css
  └── js/app.js
        ├── js/config.js
        ├── js/grid.js         → config.js
        ├── js/api.js          → config.js
        ├── js/indicators.js   → config.js, api.js
        └── js/ui.js           → config.js, grid.js
```

**Data flow:**
```
app.js::fetchSingleTicker()
  → api.js::fetchPriceFunding()
  → indicators.js::getAdvancedMetrics() → computeMetrics()
  → indicators.js::calcScore() / calcRecommendation()      (direction context)
  → app.js::attachGrid() → grid.js::calcGridPlan() + calcGridVerdict()  (spot + futures)
  → ui.js builders → innerHTML (#grid-list, #signal-list, #bottom-sheet)
```

## Key Constants (js/config.js)

| Constant | Value | Notes |
|----------|-------|-------|
| `CFG.APP_VERSION` | `'7.0'` | Update on releases |
| `CFG.REFRESH_INTERVAL_SEC` | `1200` | 20 min auto-refresh |
| `CFG.SCORE_ACTIVE` | `7.5` | Direction score ≥ this = strong bias |
| `CFG.RSI_OB/OS` | `70 / 30` | Standard overbought/oversold |
| `CFG.RSI_EXTREME_OB/OS` | `75 / 25` | Extreme levels — apply score penalty vs bias |
| `CFG.KLINES_MAIN` | `499` | One 4H fetch; 5d/14d/30d are slices |
| `CFG.SQUEEZE` | `{PCTL:20, HISTORY:300}` | Per-coin percentile squeeze |
| `GRID_CONFIG.DEFAULT_CAPITAL` | `500` | Grid capital default (USDT) |
| `GRID_CONFIG.FEES` | `{spot:.0005, futures:.0005}` | Per side; futures unverified |
| `GRID_CONFIG.DEFAULT_LEVERAGE` | `3` | Futures leverage default |
| `GRID_CONFIG.MMR` | `.005` | Maintenance margin for liquidation estimate |
| `GRID_CONFIG.GRID_LIMITS` | `{spot:[2,150], futures:[2,500]}` | Spot limit unverified |
| `GRID_CONFIG.STOP_ATR_MULT` | `2` | Grid SL/TP = range ± 2 ATR |
| `GRID_CONFIG.TARGET_NET_PCT` | `.005` | Worst-step net target for grid count |
| `GRID_CONFIG.MIN_NET_PCT` | `.003` | Below this the plan is BLOCKED |
| `GRID_CONFIG.VERDICT` | `{NOW:7, DEVELOPING:5}` | Grid score thresholds |

## Score System

**Composite 0–10 score.** Components and max weights:

| Component | Max |
|-----------|-----|
| Trend Macro (AVWAP14d/30d, Structure30d, CVD30d) | +2.0 |
| Pressure (Flow, OI, CVD5d) | +2.0 |
| Setup (Sweep, POC confluence) | +2.0 |
| Trend Swing (AVWAP5d, Flow) | +1.5 |
| CVD Quality (5d/14d/30d alignment) | +1.5 |
| EMA (50/200 position) | ±0.25 |
| FVG (nearest fair value gap) | +0.5 |
| POC Confluence | +0.5 |

**Penalties:** RSI extreme (±0.5), OI squeeze (−0.5/−1.0), structure conflict (−0.5)

**Thresholds:** Direction ≥7.5 = strong bias · Grid verdict thresholds in `GRID_CONFIG.VERDICT`

**Grid score (0–10):**

| Component | Max |
|-----------|-----|
| ADX | 3.0 |
| BB width | 1.0 |
| Squeeze | 1.5 |
| CVD flow | 1.5 |
| POC in range | 2.0 |
| RSI | 1.0 |
| Funding | 0.5 |

## Common Change Patterns

| Task | Touch |
|------|-------|
| Change default tickers | `js/app.js` → `DEFAULT_SYMBOLS` (runtime: Settings tab) |
| Change refresh interval | `js/config.js` → `CFG.REFRESH_INTERVAL_SEC` |
| Change direction strong-bias threshold | `js/config.js` → `CFG.SCORE_ACTIVE` |
| Add a new indicator calculation | `js/indicators.js` → add fn + wire into `computeMetrics()` |
| Change score weights/penalties | `js/indicators.js` → `calcScore()` |
| Add a score component row | `js/indicators.js` → `calcScore()` — push `[comp, val, reason]` to `detail` array |
| Change grid math | `js/grid.js` + add a test in `tests/math.test.mjs` |
| Change Pionex fees/limits | `js/config.js` → `GRID_CONFIG` |
| Add a sheet field | `js/ui.js` → `buildGridSheet` |
| Update version badge | `js/config.js` → `CFG.APP_VERSION` |
| Add legend entry | `js/config.js` → `LEGENDS` array |

## UI Layout

Topbar → pulse chips → tabs (Grid: Spot|Futures toggle + ranked rows; Signals: rows; Settings: form + glossary) → bottom sheet (Pionex copy fields, risk, why-score, regime).

## CSS Color System

All colors are CSS variables in `:root`. Key semantic tokens:

| Variable | Value | Semantic use |
|----------|-------|-------------|
| `--green` | `#00e676` | Bull / positive / high score |
| `--red` | `#ff1a4b` | Bear / negative / low score |
| `--yellow` | `#ffd700` | Warning / mid score / caution |
| `--cyan` | `#00d4ff` | Primary accent · Trend group title |
| `--purple` | `#b388ff` | Setup group title |
| `--orange` | `#ff8c00` | Bybit exchange badge |
| `--row-border` | `rgba(30,38,64,.4)` | Row separator borders |
| `--shadow` | `rgba(0,0,0,.65)` | Card / tooltip drop shadow |

Badge background opacities are standardised: green `.15`, yellow `.12`, red `.15`. Never use hardcoded `rgba(30,38,64,...)` — use `--row-border` instead. Layout tokens: `--sans`, `--mono`, `--tab-h`, `--safe-t`, `--safe-b`.

## indicators.js Internal Pattern

`deriveConditions(...)` is a private helper called by `calcScore()`. It centralises derived boolean conditions (e.g. `bullMac`, `sqR`, `aAcc`). If you add a new score component that needs a derived boolean, add it here — not inline.

## API Layer Notes

- **Binance primary** for all data: `fapi.binance.com`
- **Bybit fallback** when Binance fails: `api.bybit.com/v5`
- **Bybit CVD approximation:** Bybit doesn't expose taker buy volume. Buy vol is estimated via Williams %R: `buyVol = volume × (close − low) / (high − low)`. This is intentional — do not remove.
- **Timeout pattern:** `Promise.race([fetchPromise, timeoutPromise])` — `AbortSignal` is NOT used due to `DataCloneError` in some browser environments.
- **Bybit interval mapping:** `BB_INT` in `config.js` maps standard intervals (`'4h'`) to Bybit's format (`'240'`).

## Persistence (localStorage)

| Key | Set by | Used for |
|-----|--------|---------|
| `pioniex_symbols` | `app.js::saveSymbols()` | User's ticker list (persists across sessions) |
| `cim_settings` | `config.js::setSettings()` | capital, leverage, feeSpot, feeFutures, mode |
| `cim_cache_v7` | `app.js::saveCache()` | Last good results for instant open |
| `cim_tab` | `app.js::showTab()` | Last active tab |

The legacy `gridCapital` key is read once as a fallback.

## Reference File

`index_to_learn_from.html` — a self-contained reference snapshot kept at the repo root. Do not deploy or modify it; it exists as a design reference only.

## Architecture Decisions

- **No build step / no bundler** (2026-03-22): Deliberately kept vanilla JS. React + Vite + Tailwind were evaluated and rejected — dashboard is read-mostly with no complex nested state. Adds friction for no proportional gain at this scale.
- **No backend:** All API calls are client-side to public Binance/Bybit endpoints. No API keys needed — all public market data.
- **Sequential ticker fetching:** `fetchAndDisplay()` loops tickers with `for...of` (not `Promise.all`) to avoid rate-limiting on Binance's public API.
- **Grid-first (2026-09-30):** user runs Pionex spot + futures grids; direction signals are context only — no entry/leverage/size outputs.
- **Tests without package.json:** Node v26 imports the ES modules directly; adding package.json could change Vercel's build detection.
