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

CIM (Crypto Intelligence Matrix) — a client-side crypto futures monitoring dashboard (v5.4). Fetches live data from Binance Futures (primary) and Bybit V5 (fallback), calculates technical indicators entirely in the browser, and scores assets 0–10 to surface trading setups. Includes Market Pulse topbar (Fear & Greed, Smart Money, 24h Volume), signal edge bars, and responsive layout. Deployed on Vercel. No backend, no build step.

**Stack:** Vanilla HTML + CSS + ES Modules (`<script type="module">`) · Google Fonts (Chakra Petch, IBM Plex Mono) · Vercel Analytics

## Running the Project

No build step. No npm install needed. Open `index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# or just open index.html in browser (ES Modules require HTTP — not file://)
```

Deployed to Vercel — pushes to `master` deploy automatically. No CI, no tests, no linter configured.

## Architecture

| File | Responsibility |
|------|---------------|
| `index.html` | All layout, table structures, modal shell, section scaffolding |
| `js/config.js` | All constants: `CFG`, `GRID_CONFIG`, `BINANCE_BASE`, `BYBIT_BASE`, `BB_INT`, `LEGENDS`, `getGridCapital()`, `setGridCapital()` |
| `js/api.js` | HTTP layer: `B` (Binance endpoints), `Y` (Bybit endpoints), `tryFetch()`, `fetchPriceFunding()`, `fetchKlines()`, `fetchOI()` |
| `js/indicators.js` | All calculations: RSI, ATR, EMA, POC/AVWAP, CVD, Market Structure, FVG, ADX, MACD, BB, OBV, Fib, `getAdvancedMetrics()`, `calcScore()`, `calcBotParams()`, `calcRecommendation()`, `calcDirectionConditions()`, `interpretSignals()` |
| `js/ui.js` | All HTML builders: `buildTableRow`, `buildFastRow`, `buildDeepCard`, `buildSigCard`, `buildBotCard`, `renderGridPanel`, `renderCryptoRiskNotice` |
| `js/grid.js` | Grid bot math: range from ATR, profit/grid, drawdown, viability, grid count, SL/TP, `getTickerGridProfile()` |
| `js/app.js` | Orchestrator: `SYMBOLS` state, `fetchAndDisplay()` loop, modal wiring, timer/countdown, event listeners |

**Module dependency graph (no circular deps):**
```
index.html
  └── css/style.css
  └── js/app.js
        ├── js/config.js
        ├── js/grid.js         (pure functions — no imports)
        ├── js/api.js          → config.js
        ├── js/indicators.js   → config.js, api.js
        └── js/ui.js           → config.js, indicators.js
```

**Data flow:**
```
app.js::fetchAndDisplay()
  → api.js::fetchPriceFunding()          (price + funding rate)
  → indicators.js::getAdvancedMetrics()  (klines → RSI/ATR/EMA/POC/CVD/FVG/Structure)
  → indicators.js::interpretSignals()    (signal objects)
  → indicators.js::calcScore()           (0–10 score + detail array)
  → indicators.js::calcBotParams()       (entry/SL/TP)
  → grid.js::assess/calc functions       (grid bot advisory)
  → ui.js::buildDeepCard(…, detail)      (score breakdown injected here)
  → ui.js::build* functions              (HTML strings)
  → innerHTML into DOM tables/grids
```

## Key Constants (js/config.js)

| Constant | Value | Notes |
|----------|-------|-------|
| `CFG.APP_VERSION` | `'5.4'` | Update on releases |
| `CFG.REFRESH_INTERVAL_SEC` | `1200` | 20 min auto-refresh |
| `CFG.SCORE_BOT_MIN` | `7.5` | Score threshold for bot params activation |
| `CFG.RSI_OB/OS` | `70 / 30` | Standard overbought/oversold |
| `CFG.RSI_EXTREME_OB/OS` | `75 / 25` | Extreme levels — apply score penalty |
| `CFG.SL_ATR_MULT` | `1.5` | Stop-loss = 1.5× ATR |
| `CFG.TP1_ATR_MULT` | `3.0` | TP1 = 3× SL distance |
| `CFG.TP2_ATR_MULT` | `5.25` | TP2 = 5.25× SL distance |
| `GRID_CONFIG.DEFAULT_CAPITAL` | `500` | Grid capital default (USDT) |

## Score System

**Composite 0–10 score.** Components and max weights:

| Component | Max |
|-----------|-----|
| Trend Macro (AVWAP14d/30d, Structure30d, CVD30d) | +2.0 |
| Pressure (Flow, OI, CVD5d) | +2.0 |
| Setup (Sweep, POC confluence) | +2.0 |
| Trend Swing (AVWAP5d, Flow) | +1.5 |
| CVD Quality (5d/14d/30d alignment) | +1.0 |
| EMA (50/200 position) | +0.5 |
| FVG (nearest fair value gap) | +0.5 |
| POC Confluence | +0.5 |

**Penalties:** RSI extreme (±0.5), OI squeeze (−0.5/−1.0), structure conflict (−0.5)

**Thresholds:** ≥7.5 = bot active · 6–7.4 = developing · <6 = avoid

## Common Change Patterns

| Task | Touch |
|------|-------|
| Change default tickers | `js/app.js` → `DEFAULT_SYMBOLS` |
| Add/remove a ticker permanently | `js/app.js` → `DEFAULT_SYMBOLS` (runtime: Config modal) |
| Change refresh interval | `js/config.js` → `CFG.REFRESH_INTERVAL_SEC` |
| Change score bot threshold | `js/config.js` → `CFG.SCORE_BOT_MIN` |
| Change SL/TP ratios | `js/config.js` → `CFG.SL_ATR_MULT`, `TP1_ATR_MULT`, `TP2_ATR_MULT` |
| Add column to Full Metrics table | `index.html` (thead) + `js/ui.js` → `buildTableRow()` |
| Add column to Fast Decision table | `index.html` (thead) + `js/ui.js` → `buildFastRow()` |
| Add a new indicator calculation | `js/indicators.js` → add fn + wire into `getAdvancedMetrics()` |
| Add a new signal | `js/indicators.js` → `interpretSignals()` + `js/ui.js` → `buildSigCard()` |
| Change score weights/penalties | `js/indicators.js` → `calcScore()` |
| Add a score component row | `js/indicators.js` → `calcScore()` — push `[comp, val, reason]` to `detail` array |
| Change indicator groups in deep card | `js/ui.js` → `buildDeepCard()` → `groups` array |
| Change grid bot math | `js/grid.js` |
| Change grid defaults | `js/config.js` → `GRID_CONFIG` |
| Update version badge | `js/config.js` → `CFG.APP_VERSION` |
| Add legend entry | `js/config.js` → `LEGENDS` array |

## UI Layout (current page sections, top to bottom)

1. **Fast Decision table** — click any row to expand the deep card inline
2. **Deep card** (expanded) — 4 indicator groups (Trend/Momentum/Volatility/Setup) + direction checklist + Score Components table
3. **Grid Bot Advisor** — `#grid-risk-notice` + `#grid-panel` rendered immediately after Fast Decision
4. **Full Metrics table** — all raw indicator values (collapsible)
5. **Active Bot Parameters** — cards for assets scoring ≥7.5
6. **Reference Guide** — legend (glossary collapsible)

Signal Analysis section was removed in v5.4. Score data lives exclusively inside the deep card's "Score Components" section (`buildDeepCard` receives `detail` from `calcScore()`). Score Analysis table was also removed earlier.

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
| `--row-stripe` | `rgba(30,38,64,.35)` | Alternating row tint (all tables) |
| `--row-border` | `rgba(30,38,64,.4)` | Row separator borders |
| `--shadow` | `rgba(0,0,0,.65)` | Card / tooltip drop shadow |

Badge background opacities are standardised: green `.15`, yellow `.12`, red `.15`. Never use hardcoded `rgba(30,38,64,...)` — use `--row-stripe` or `--row-border` instead.

## indicators.js Internal Pattern

`_sharedBooleans(metrics)` is a private helper called by **both** `interpretSignals()` and `calcScore()`. It centralises derived boolean conditions (e.g. `bullMac`, `sqR`, `aAcc`). If you add a new score component or signal that needs a derived boolean, add it here — not inline in each function.

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
| `gridCapital` | `config.js::setGridCapital()` | Grid bot capital input |

## Reference File

`index_to_learn_from.html` — a self-contained reference snapshot kept at the repo root. Do not deploy or modify it; it exists as a design reference only.

## Architecture Decisions

- **No build step / no bundler** (2026-03-22): Deliberately kept vanilla JS. React + Vite + Tailwind were evaluated and rejected — dashboard is read-mostly with no complex nested state. Adds friction for no proportional gain at this scale.
- **No backend:** All API calls are client-side to public Binance/Bybit endpoints. No API keys needed — all public market data.
- **Sequential ticker fetching:** `fetchAndDisplay()` loops tickers with `for...of` (not `Promise.all`) to avoid rate-limiting on Binance's public API.
- **`window._removeTicker`:** Exposed globally to allow inline `onclick` from dynamically-generated HTML inside the modal. Intentional pattern.
- **Header tooltips via fixed floater:** Column header tooltips use a `position:fixed` floater div (`#th-tip-floater`) to escape the `overflow-x:auto` clipping on the scrollable metrics table.
