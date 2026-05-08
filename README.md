# CIM — Crypto Intelligence Matrix `v6.4`

**Live:** [pioniex.vercel.app](https://pioniex.vercel.app/)

Real-time crypto futures dashboard. Pulls live market data from Binance Futures and Bybit V5, runs all technical analysis in the browser, and scores each asset 0–10 to surface high-probability 4H setups. No backend. No API keys. No build step.

---

## Screenshots

### Dashboard — Fast Decision Table
![Dashboard](docs/screenshots/dashboard.png)

### Signal Cards & Grid Bot Advisor
![Grid Bot Advisor](docs/screenshots/grid-bot.png)

### Mobile View
![Mobile](docs/screenshots/mobile.png)

---

## What it does

You open the dashboard and see a table of crypto futures ranked by signal score. Each row shows: price, RSI, funding rate, order flow bias, market structure, and a composite score (0–10). Click any row to expand a deep card with full indicator breakdown, score components, and — if the score is high enough — ready-to-use bot parameters.

Below the decision table sits the **Grid Bot Advisor**: ATR-derived grid ranges, grid count, profit-per-grid, worst-case drawdown, and SL/TP levels for each tracked symbol.

**Signal color system:** green = bullish, red = bearish, yellow = caution/divergence, gray = neutral.

---

## Features

| Feature | Description |
|---------|-------------|
| **Market Pulse topbar** | Live pills: 24h Volume · Fear & Greed (alternative.me) · Smart Money (Binance top-trader L/S ratio) |
| **Fast Decision Table** | Quick signal overview — click any row to expand a deep analysis card |
| **Deep Card** | 4 indicator groups (Trend · Momentum · Volatility · Setup) + score breakdown + direction checklist |
| **Score Engine (0–10)** | Weighted composite score; ≥ 7.5 activates bot parameters |
| **Bot Parameters** | Entry, SL, TP1/TP2, leverage, position size, R:R — auto-calculated per asset |
| **Grid Bot Advisor** | Per-ticker spot grid setup: ATR-based range, grid count, net profit/grid, drawdown, SL/TP |
| **Full Metrics Table** | 15 key columns by default; toggle to show all 25 (price · funding · RSI · ATR · flow% · POC · AVWAP · CVD · OI · structure · EMA · FVG) |
| **Symbol Manager** | Add/remove tickers at runtime — validated against Binance/Bybit, persisted in localStorage |
| **Auto-refresh** | Fetches every 20 minutes; countdown timer in topbar |
| **Responsive** | 4K (1440px max) down to 480px mobile |

---

## Quick Start

ES Modules require HTTP — `file://` won't work.

```bash
# Python (no install required)
python -m http.server 8080

# Node
npx serve .
```

Open `http://localhost:8080/`.

Deployed on Vercel — pushes to `master` auto-deploy. No CI, no tests, no build step needed.

---

## Project Structure

```
├── index.html          # Page skeleton — HTML only, no inline JS/CSS
├── css/
│   └── style.css       # All styles — CSS variables, responsive breakpoints
└── js/
    ├── config.js       # CFG + GRID_CONFIG constants, API base URLs, localStorage helpers
    ├── api.js          # tryFetch, Binance/Bybit endpoints, unified fetch wrappers
    ├── indicators.js   # All calculations: RSI/ATR/EMA/POC/AVWAP/CVD/FVG + calcScore + calcBotParams
    ├── ui.js           # DOM string builders: buildTableRow, buildDeepCard, buildBotCard, renderGridPanel
    ├── grid.js         # Grid bot math — pure functions, no side effects
    └── app.js          # State, orchestration, event handlers, init
```

Module dependency graph (no circular dependencies):

```
index.html
  └── css/style.css
  └── js/app.js
        ├── js/config.js
        ├── js/grid.js         (pure — no imports)
        ├── js/api.js          → config.js
        ├── js/indicators.js   → config.js, api.js
        └── js/ui.js           → config.js, indicators.js
```

---

## Data Sources

| Source | Used for |
|--------|----------|
| `fapi.binance.com` | Price, funding rate, klines, open interest (primary) |
| `api.bybit.com/v5` | All of the above (fallback when Binance fails) |

No API keys required — all public market data endpoints.

---

## Indicators

| Indicator | Timeframe | Notes |
|-----------|-----------|-------|
| RSI | 4H × 210 candles | 14-period; extreme >75 / <25 trigger score penalty |
| ATR | 4H | 14-period; drives SL/TP sizing; ATR% >5% blocks bot activation |
| EMA 50 / 200 | 4H | Golden/death cross; BULL/PULLBACK = price dipped below EMA50 in uptrend |
| POC + AVWAP | 5d / 14d / 30d | Volume-profile point of control + anchored VWAP |
| CVD | 5d / 14d / 30d | Cumulative Volume Delta — ACC / DIS / FULL ACCUM (all 3 aligned) |
| Market Structure | 4H / 30d | HH+HL = Bullish · LH+LL = Bearish · conflict = −0.5 penalty |
| ADX | 4H | Trend strength: <18 = ranging, >22 = trending; drives Regime + grid viability |
| Donchian Channel | 4H × 20 / 55 | Short-term range (DC20) + macro context (DC55); INSIDE / BREAK_UP / BREAK_DOWN |
| Regime | 4H composite | RANGING / TRENDING ↑↓ / SQUEEZE / EXPANSION / MIXED — derived from ADX + BB + DC20 |
| Squeeze Conf | 4H composite | 0–100 score: BB width + DC20/ATR ratio + ATR% — higher = breakout imminent |
| Bollinger Bands | 4H × 20 | BW <5% = squeeze · BW >15% = expanded; used in Regime + Squeeze Conf |
| MACD | 4H | 12/26/9; histogram direction shown in deep card |
| OBV | 4H | On-Balance Volume trend: UP / DOWN / FLAT; confirms or diverges from price |
| Fibonacci | 4H × 50 | Retracement zones (23.6% – 78.6%) from last 50-candle swing high/low |
| FVG | Last 100 × 4H | Up to 5 intact fair value gaps, sorted by proximity; ★ = structure confirmed |
| Liquidity Sweep | Latest 4H | Pierces all-time high/low then closes back — BUY_SWP / SELL_SWP |
| Flow% 24h | 1H × 24 | (BuyVol − SellVol) / TotalVol; >±5% = strong pressure |
| Open Interest | 4H × 42 | 7-day % change; OI↑+Price↓ = squeeze risk |
| Volume Spike | 4H | Current vs. 20-candle average; ≥ 2× = spike |

---

## Scoring

Scores range **0–10**. Score ≥ 7.5 activates bot parameters.

| Component | Max Points |
|-----------|-----------|
| Trend Macro (AVWAP14d/30d + Structure30d + CVD30d) | +2.0 |
| Pressure (Flow + OI change + CVD5d) | +2.0 |
| Setup (Sweep / POC confluence / FVG entry) | +2.0 |
| Trend Swing (AVWAP5d + CVD5d + Flow) | +1.5 |
| CVD Quality (5d/14d/30d alignment) | +1.0 |
| EMA alignment | +0.5 |
| FVG proximity | +0.5 |
| POC Confluence (5d ≈ 14d) | +0.5 |

**Penalties:** RSI extreme (−0.5) · OI squeeze on short (−0.5 to −1.0) · Structure timeframe conflict (−0.5) · DC20 range indecision (−0.25)

**Thresholds:** ≥ 7.5 = bot active · 6–7.4 = developing · < 6 = avoid

---

## Bot Parameters

Activated when score ≥ 7.5.

| Parameter | Formula |
|-----------|---------|
| Entry | FVG top/bottom near price, else current price |
| Stop Loss | Entry ± 1.5 × ATR4H |
| Take Profit 1 | Entry ± 3.0 × ATR4H (close 50%, move SL to breakeven) |
| Take Profit 2 | Entry ± 5.25 × ATR4H (trail remaining 50%) |
| Leverage | ≥ 9.5 → 6× · ≥ 9.0 → 5× · ≥ 8.5 → 4× · ≥ 8.0 → 3× · ≥ 7.5 → 2× |

---

## Configuration

All parameters in `js/config.js` under the `CFG` object:

```js
REFRESH_INTERVAL_SEC : 1200   // 20 minutes
SCORE_BOT_MIN        : 7.5    // minimum score to activate bot params
RSI_OB / RSI_OS      : 70 / 30
FLOW_STRONG          : 5.0    // % threshold for strong buy/sell flow
SL_ATR_MULT          : 1.5
TP1_ATR_MULT         : 3.0
TP2_ATR_MULT         : 5.25
```

Grid bot parameters in `GRID_CONFIG`:

```js
DEFAULT_CAPITAL        : 500    // USDT per session (overridable via Config modal)
FEE_PCT                : 0.001  // 0.1% per side (0.2% round-trip per grid)
TARGET_NET_PCT         : 0.008  // 0.8% target net profit per grid
MIN_NET_PCT            : 0.006  // minimum viable net profit per grid
ATR_MULTIPLIER_DEFAULT : 2.5    // range = price ± (ATR% × multiplier)
GEOMETRIC_THRESHOLD_PCT: 20     // use Geometric mode when range ≥ 20%
// Viability: ADX_BLOCK 22, RSI_BLOCK 68, BB_MIN 2.0
// Direction: LONG if score ≥ 6.5, SHORT if score < 4.5
```

Default symbols: BTC, ETH, BNB, SOL, TRX, SUI, HYPE — all editable at runtime via the Config modal, persisted in localStorage.

---

## Browser Requirements

Any modern browser with ES Module support: Chrome 61+, Firefox 60+, Safari 11+, Edge 79+. Must be served over HTTP — `file://` is not supported.

---

## Changelog

### v6.4 — 2026-05-08
- Reference Guide and Indicator Glossary fully rewritten — all 20 indicators documented with thresholds, formulas, and how-to-read guidance
- Signal card tooltips (SIG_TIPS) rewritten with concrete conditions and score contributions for all 10 categories
- Quick Reference box updated: ADX ranges, Regime SQUEEZE cue, RSI extreme threshold (25/75)
- Score Weights box updated: DC20 range −0.25 penalty now listed

### v6.2 — 2026-04-18
- Donchian Channels 20 + 55 period added — canonical range detector for regime and breakout context
- Regime composite label: RANGING / TRENDING ↑↓ / SQUEEZE / EXPANSION / MIXED (from ADX + BB + DC20)
- Squeeze Confidence 0–100 score (BB width + DC20/ATR ratio + ATR percentile)
- DC20 Squeeze component added to grid score (max +1.5): full score when BB <5% AND DC20/ATR <1.0
- DC20 breakout check blocks grids when price is breaking the 20-period channel
- Direction penalty −0.25 added when a directional signal appears inside DC20 range
- Grid score weights rebalanced: ADX 3.0 + BB 1.0 + DC Squeeze 1.5 + CVD 1.5 + POC 2.0 + RSI 1.0 + Fund 0.5
- ADX thresholds unified: ADX_IDEAL 18, ADX_BLOCK 22 (replaces 3 inconsistent values)
- CVD laterality converted from binary cliff to linear ramp (0.15 → 0.30)
- FVG_ENTRY_PCT relaxed 1.5 → 2.0, POC_CONFLUENCE_PCT relaxed 0.5 → 1.0

### v6.0 — 2026-04-13
- Mobile-first redesign: table layout replaced with card sections (Grid Bot Advisor + Direction Signals)
- Bottom sheet for full detail — tap any card to expand
- Score ring (green/yellow/red) replaces numeric column
- Entry/SL/TP params shown in Direction sheet when rec = Enter

### v5.4 — 2026-04-02
- Signal Analysis section removed — signals surfaced inside each Grid Bot card as compact "Active Signals" strip (Setup · Bot Grid · Presiune)
- Grid Bot Advisor promoted above Full Metrics table
- Contextual subtitles added to Fast Decision and Grid Bot sections
- TradingView links on symbol names in Fast Decision table
- Grid risk tightening — stricter ADX/structure viability thresholds
- Incremental ticker rendering — renders as data arrives, not after full batch

### v5.2 — 2026-03-22
- Visual polish: signal edge bars, favicon, max-width layout
- Deep card: 4 indicator groups + score breakdown table

### v5.1 — 2026-03-15
- CIM rebrand, Market Pulse topbar pills (Fear & Greed · Smart Money · 24h Volume)
- Responsive layout and topbar

### v5.0 — 2026-03-10
- Deep card UX polish, compact score table, initial v5 architecture

---

## License

MIT
