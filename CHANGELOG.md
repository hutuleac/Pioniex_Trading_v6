# Changelog

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## v6.0 — 2026-04-13

- Mobile-first redesign: table layout replaced with two card sections
- Section 1: Grid Bot Advisor (ADX, CVD lateral, funding, range pills)
- Section 2: Direction Signals (macro trend, RSI, pressure, structure pills)
- Bottom sheet for full detail: tap any card to expand
- Score ring (green/yellow/red) replacing numeric column
- Entry/SL/TP params in Direction sheet when rec = Enter
- Removed: Full Metrics table, Signal Analysis strip, Active Bot Parameters section

## [5.2.0] — 2026-03-24

### Added
- Signal edge bars — 3px colored left border on signal and bot cards (green=bull, red=bear, cyan=neutral)
- CIM hexagon + candlestick favicon (`favicon.svg`); page title updated to "CIM · Crypto Intelligence Matrix"
- `--card` / `--card-h` semantic CSS tokens in `:root` — used by sig/bot cards
- Max-width 1440px on all `.section` containers (ultra-wide screen friendly)

### Changed
- Card hover: lift `translateY(-2px)` + color-matched glow on sig/bot cards
- Transitions upgraded to `cubic-bezier(.4,0,.2,1)` at `.3s` across cards and buttons
- Section title divider line fades via `linear-gradient` instead of solid color
- Fixed circular `--row-stripe`, `--row-border`, `--shadow` CSS variable self-references in `:root`
- `prefers-reduced-motion` accessibility guard wraps all animations

## [5.1.0] — 2026-03-24

### Added
- Market Pulse pills in topbar: 24h Volume, Fear & Greed index, Smart Money (Binance top trader L/S ratio)
- `fetchMarketPulse()` in `js/api.js` — parallel fetch via `Promise.allSettled`, graceful per-source fallback
- `buildMarketPulseStrip()` in `js/ui.js` — renders color-coded pills inline in topbar
- Responsive topbar breakpoints: wraps at 1024px, compacts at 768px, minimal at 480px

### Changed
- Topbar title replaced with CIM / "Crypto Intelligence Matrix" logo + subtitle
- Removed duplicate "Updated:" timestamp from topbar
- Removed non-loading Retail pill

## [5.0.0] — 2026-03-24

### Changed
- Deep card dropdown: stable dark background (`--bg`), no hover flash on content
- Score Components table: tighter row padding (`3px 8px`) and section title margin
- `.claude/` and `index_to_learn_from.html` added to `.gitignore`; `settings.local.json` untracked

## [4.6.0] — 2026-03-22

### Added
- Dynamic ticker management in Config modal — add/remove symbols at runtime without editing code
- Ticker list persisted in `localStorage` (`pioniex_symbols`) and restored on page load; falls back to hardcoded defaults if empty
- Live validation on add: calls Binance/Bybit API before accepting a ticker; shows ✓/✗ inline feedback
- Minimum 1 ticker enforced — last ticker cannot be removed
- Enter key support on ticker input field

### Removed
- XMR (XMRUSDT) removed from default symbol set (delisted from Binance, unreliable on Bybit)

## [4.5.0] — 2026-03-21

### Added
- HYPE (HYPEUSDT) and XMR (XMRUSDT) added to default symbol set (now 8 tickers)
- Grid profiles for new tickers: HYPE = volatile (rangeMultiplier 3.5, maxGrids 50), XMR = moderate (3.0, 40)
- XMR automatically routes to Bybit fallback (delisted from Binance Feb 2024)

## [4.4.0] — 2026-03-21

### Added
- Version badge in topbar — reads `CFG.APP_VERSION` and renders as a cyan pill next to the title
- `APP_VERSION` constant added to `CFG` in `js/config.js` as single source of truth for version display
- `.version-pill` CSS class for styled version indicator

### Changed
- Risk parameters tuned for higher risk appetite (moderate profile):
  - Leverage tiers shifted up: ≥7.5→2x · ≥8.0→3x · ≥8.5→4x · ≥9.0→5x · ≥9.5→6x (was max 5x at 9.5)
  - `SCORE_BOT_MIN` activation threshold: already 7.5 (README corrected from stale 8.0)
  - `TARGET_NET_PCT`: 0.8% → 0.6% per grid
  - `MIN_NET_PCT`: 0.6% → 0.5% per grid
  - `SL_BUFFER_PCT`: 12% → 10% below range lower bound
- Score Analysis: scores 6.5–7.4 now show "⚡ NEAR ACTIVE — monitor" instead of "waiting for confluence"

## [4.3.0] — 2026-03-21

### Changed
- Improved contrast ratio: `--text` #c8d0e8 → #dde3f5, `--text2` #7888aa → #9dafc8, `--dim` #4a5580 → #6272a0
- Increased font sizes ~20–25% for all sections from "Active Bot Parameters" downward (bot cards, score breakdown, signal cards, grid panel, legend)
- Bumped section title font size globally from .72rem to .82rem
- Full Metrics table now defaults to 15 columns (hides Fund%, ATR, POC-5d, POC-14d, AVWAP-5d, AVWAP-14d, OI-absolute, Trend, Sweep, API)
- Added "⊞ Show All / ⊟ Compact" toggle button to Full Metrics section header to reveal all 25 columns on demand

## [4.2.0] — 2026-03-21

### Added
- `js/grid.js` — new module with 9 pure grid bot calculation functions:
  `calcGridProfitPerGrid`, `calcGridCapitalPerGrid`, `calcDrawdownScenario`,
  `calcRecommendedGridCount`, `calcRangeFromATR`, `selectGridMode`,
  `calcGridStopLoss`, `calcGridTakeProfit`, `assessGridViability`, `getTickerGridProfile`
- `GRID_CONFIG` export in `config.js` — fee rate, profit targets, SL/TP buffers, ATR multiplier defaults
- `getGridCapital()` / `setGridCapital()` localStorage helpers in `config.js`
- `renderGridPanel(allMetrics, capital)` in `ui.js` — per-ticker grid bot advisory cards with
  range, grid count, mode (Arithmetic/Geometric), profit/grid, SL/TP, worst-case drawdown, copyable checklist
- `renderCryptoRiskNotice(allMetrics)` in `ui.js` — collapsible risk warning banner with static
  rules and dynamic per-ticker alerts (ADX > 25, ATR% > 5, RSI > 70)
- "Grid Bot Capital (USDT)" input added to Config modal — persisted in localStorage, triggers grid panel re-render on save

### Changed
- Default symbols updated: XRP and ZEC replaced by BNB, TRX, SUI
  (new set: BTC, ETH, BNB, SOL, TRX, SUI)
- `app.js` — grid calculations run per ticker inside `fetchAndDisplay()` after metrics are collected;
  results stored on each `allMetrics[name]` object: `gridViability`, `gridRange`, `gridRecommendation`,
  `gridProfitPerGrid`, `gridDrawdown`, `gridMode`, `gridSL`, `gridTP`

## [4.1.0] — 2026-03-21

### Changed
- Refactored monolithic `index.html` (~1,481 lines) into ES module architecture
- Extracted CSS to `css/style.css`
- Split JS into 5 modules: `config.js`, `api.js`, `indicators.js`, `ui.js`, `app.js`
- Added `deriveConditions()` private helper to eliminate duplicate boolean logic shared between `interpretSignals` and `calcScore`
- Replaced all `onclick=` attributes with `addEventListener` in `app.js`
- Event delegation on `#sym-chips` for dynamic symbol removal
- `fetchPriceFunding` now returns `provider` field; `app.js` sets `symProvider[name]` from it
- Header tooltip IIFE converted to `initHeaderTooltips()` function

## [4.0.0] — prior
- Original monolithic single-file implementation
