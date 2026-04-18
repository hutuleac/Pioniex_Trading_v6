# CIM — Crypto Intelligence Matrix `v5.4`

A client-side crypto futures intelligence dashboard for 4H setups. Pulls live data from Binance Futures (primary) and Bybit V5 (fallback), calculates all indicators locally, and outputs signals, a composite score, and bot parameters for each tracked symbol.

No build tools, no npm, no backend — pure ES Modules served over any static HTTP server.

---

## Features

- **Market Pulse Strip** — real-time topbar pills: 24h Volume, Fear & Greed index (alternative.me), Smart Money (Binance top trader L/S ratio)
- **Fast Decision Table** — click any row to expand a deep card with 4 indicator groups + score breakdown + direction checklist
- **Live Metrics Table** — price, funding rate, RSI, ATR, flow%, POC, AVWAP, CVD, OI, structure, EMA, FVG for each symbol
- **Score Engine (0–10)** — weighted composite score with breakdown; score ≥ 7.5 activates bot parameters
- **Bot Parameters** — entry, SL, TP1/TP2, leverage, position size, R:R, trail trigger — calculated per active symbol
- **Symbol Manager** — add/remove symbols at runtime; Binance or Bybit used automatically per symbol
- **Auto-refresh** — fetches every 20 minutes; countdown timer shown in topbar
- **Grid Bot Advisor** — per-ticker Spot Grid setup guide: recommended range (ATR-based), grid count, mode (Arithmetic/Geometric), net profit/grid, SL/TP levels, worst-case drawdown; includes compact **Active Signals strip** (Setup · Bot Grid · Presiune) per card
- **Compact Metrics View** — Full Metrics table defaults to 15 key columns; "⊞ Show All" toggle reveals all 25 on demand
- **Responsive** — adapts from 4K (max-width 1440px) down to mobile (480px)

---

## Quick Start

ES Modules require an HTTP server — opening `index.html` directly via `file://` will not work.

```bash
# Python (no install required)
python -m http.server 8080

# Node (requires npx)
npx serve .
```

Then open `http://localhost:8080/` in your browser.

---

## Project Structure

```
├── index.html          # Page skeleton — HTML only, no inline JS or CSS
├── css/
│   └── style.css       # All styles
└── js/
    ├── config.js       # CFG + GRID_CONFIG constants, API base URLs, SIG_TIPS, LEGENDS, localStorage helpers
    ├── grid.js         # Pure grid bot calculations (9 exported functions, no side effects)
    ├── api.js          # tryFetch, Binance/Bybit endpoints, unified fetch wrappers
    ├── indicators.js   # All pure calculations + interpretSignals, calcScore, calcBotParams
    ├── ui.js           # Formatters and DOM string builders
    └── app.js          # State, orchestration, event handlers, init
```

### Module Dependency Graph

```
index.html
  └── css/style.css
  └── js/app.js
        ├── js/config.js
        ├── js/grid.js         (no dependencies — pure functions)
        ├── js/api.js          → config.js
        ├── js/indicators.js   → config.js, api.js
        └── js/ui.js           → config.js, indicators.js
```

No circular dependencies.

---

## Data Sources

| Source | Used for |
|--------|----------|
| `fapi.binance.com` | Price, funding rate, klines, open interest (primary) |
| `api.bybit.com` | All of the above (fallback when Binance fails) |

Bybit CVD uses a Williams %R volume approximation when taker buy volume is unavailable.

---

## Indicators

| Indicator | Timeframe | Notes |
|-----------|-----------|-------|
| RSI | 4H × 210 candles | 14-period |
| ATR | 4H | 14-period; used for SL/TP sizing |
| EMA 50 / 200 | 4H | Golden/death cross detection |
| POC + AVWAP | 5d / 14d / 30d | Volume-profile point of control + anchored VWAP |
| CVD | 5d / 14d / 30d | Cumulative Volume Delta — accumulation vs. distribution |
| Market Structure | 4H / 30d | HH+HL = Bullish · LH+LL = Bearish |
| FVG | Last 100 × 4H candles | Up to 5 intact fair value gaps, sorted by proximity |
| Flow% 24h | 1H × 24 candles | (BuyVol − SellVol) / TotalVol |
| Open Interest | 4H × 42 periods | 7-day % change used for scoring |
| Volume Spike | 4H | Current vs. 20-candle average; ≥ 2× = spike |
| Liquidity Sweep | Latest 4H candle | Compares against all-time high/low of prior candles |

---

## Scoring

Scores range from **0 to 10**. A score ≥ 8.0 generates bot parameters.

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

**Penalties:** RSI extreme (−0.5) · OI squeeze on short (−0.5 to −1.0) · Structure timeframe conflict (−0.5)

---

## Bot Parameters (score ≥ 7.5)

| Parameter | Formula |
|-----------|---------|
| Entry | FVG top/bottom near price, else current price |
| Stop Loss | Entry ± 1.5 × ATR4H |
| Take Profit 1 | Entry ± 3.0 × ATR4H (close 50%, move SL to breakeven) |
| Take Profit 2 | Entry ± 5.25 × ATR4H (trail remaining 50%) |
| Leverage | Score ≥ 9.5 → 6x · ≥ 9.0 → 5x · ≥ 8.5 → 4x · ≥ 8.0 → 3x · ≥ 7.5 → 2x |

---

## Configuration

All parameters are in `js/config.js` under the `CFG` object. Key values:

```js
REFRESH_INTERVAL_SEC : 1200   // 20 minutes
SCORE_BOT_MIN        : 7.5    // minimum score to activate bot params
RSI_OB / RSI_OS      : 70 / 30
FLOW_STRONG          : 5.0    // % threshold for strong buy/sell flow
SL_ATR_MULT          : 1.5
TP1_ATR_MULT         : 3.0
TP2_ATR_MULT         : 5.25
```

Grid bot parameters are in `GRID_CONFIG` (also in `js/config.js`):

```js
DEFAULT_CAPITAL        : 500    // USDT per session (overridable via Config modal → saved in localStorage)
FEE_PCT                : 0.001  // 0.1% per side (0.2% round-trip per grid)
TARGET_NET_PCT         : 0.006  // 0.6% target net profit per grid
MIN_NET_PCT            : 0.005  // minimum viable net profit per grid
SL_BUFFER_PCT          : 0.10   // SL sits 10% below range lower bound
TP_BUFFER_PCT          : 0.05   // TP sits 5% above range upper bound
ATR_MULTIPLIER_DEFAULT : 2.5    // range = price ± (ATR% × multiplier)
GEOMETRIC_THRESHOLD_PCT: 20     // use Geometric mode when range width ≥ 20%
```

Default symbols: BTC, ETH, BNB, SOL, TRX, SUI, HYPE — all editable at runtime via the Config modal (add/remove with live Binance/Bybit validation, persisted in localStorage).

---

## Browser Requirements

Any modern browser with ES Module support (Chrome 61+, Firefox 60+, Safari 11+, Edge 79+). Must be served over HTTP — `file://` is not supported.

---

## Changelog

### v5.4 — 2026-04-02
- **Signal Analysis section removed** — signals surfaced directly inside each Grid Bot card as a compact "Active Signals" strip (Setup · Bot Grid · Presiune)
- **Grid Bot Advisor promoted** — moved above Full Metrics table for faster access after the Fast Decision table
- **Contextual subtitles added** — Fast Decision explains the Rec column (directional signal, not grid); Grid Bot Advisor explains the grid vs. directional trade distinction
- **TradingView links** — symbol names in Fast Decision table link directly to TradingView chart (v5.3)
- **Grid risk tightening** — stricter ADX/structure viability thresholds, improved warning messages (v5.3)
- **Incremental ticker rendering** — tickers render as data arrives rather than waiting for full batch (v5.3)
- **Default symbol list** — BTC, BNB, SOL, SUI, TRX, DOGE, XLM, XRP, HYPE (v5.3)

### v5.2 — 2026-03-22
- Visual polish: signal edge bars, favicon, max-width layout
- Deep card: 4 indicator groups + score breakdown table
- Score Analysis section consolidated into deep card

### v5.1 — 2026-03-15
- CIM rebrand, Market Pulse topbar pills (Fear & Greed · Smart Money · 24h Volume)
- Responsive layout and topbar

### v5.0 — 2026-03-10
- Deep card UX polish, compact score table, initial v5 architecture
