# CIM v6 — Dashboard Redesign Spec

## Overview

Mobile-first rebuild of the CIM dashboard. Two dedicated card sections replace the current table-heavy layout. Only `index.html`, `js/ui.js`, and `css/style.css` are rewritten. All business logic files (`api.js`, `indicators.js`, `grid.js`, `config.js`, `app.js`) are untouched.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Primary device | Mobile (mostly) |
| Layout model | Two separate page sections |
| Card density | Medium — indicator pills visible by default |
| Expand pattern | Bottom sheet (slides up, ~70% screen height) |
| Tech stack | Stay vanilla JS + ES modules |
| Files changed | `index.html`, `js/ui.js`, `css/style.css`, `js/app.js` (wiring only) |

---

## Page Structure (top to bottom)

```
┌──────────────────────────────┐
│  Topbar (CIM v6 · F&G · SM) │
├──────────────────────────────┤
│  Section 1: Grid Bot Advisor │  ← purple accent
│  [card] [card] [card] ...    │
├──────────────────────────────┤
│  Section 2: Direction Signals│  ← cyan accent
│  [card] [card] [card] ...    │
└──────────────────────────────┘
```

Grid Bot Advisor is first — viability check before directional bias.

---

## Section 1 — Grid Bot Advisor

**Section header color:** `--purple` (#b388ff)

### Card (default state)

```
┌─────────────────────────────────────────┐  border: --purple tint
│ BTC          $83,420         [RECOMMENDED]│
│ [ADX 14 ✓] [CVD Lateral] [Fund 0.01%]  │
│ [Range $80k–$86k]                       │
└─────────────────────────────────────────┘
```

**Pills shown (4 max):**
| Pill | Source | Color logic |
|------|--------|-------------|
| ADX value | `m.adx.adx` | green <20, yellow 20–25, red >25 |
| CVD lateral / directional | derived: `Math.abs(m.cvd5d) / m.volume5d < CFG.CVD_LATERAL_RATIO` | green=lateral, red=directional |
| Funding rate | `m.fundingRate` | green <0.05%, yellow 0.05–0.1%, red >0.1% |
| ATR range estimate | `m.gridRange.rangeLow` – `m.gridRange.rangeHigh` | always purple |

**Viability badge (top-right):**
- `RECOMMENDED` — green — ADX <20 + CVD lateral + no warnings
- `CAUTION` — yellow — ADX 20–25 or mild warnings
- `AVOID GRID` — red — ADX >25 or strong trend

**Card border tint:** green=recommended, yellow=caution, red=avoid

### Bottom Sheet (tap to open)

Full grid parameters:

| Row | Value |
|-----|-------|
| Range | `m.gridRange.rangeLow` – `m.gridRange.rangeHigh` |
| Grid Count | `m.gridCount` (from `calcRecommendedGridCount`) |
| Profit / Grid | `gridProfitPerGrid` % |
| Drawdown (worst) | `gridDrawdown` % |
| ADX 4H | value + verdict |
| CVD 5d | delta % + lateral/directional label |
| Direction Bias | Long Grid / Short Grid / Neutral (purple badge) |
| Capital ($500) | `getGridCapital()` / `m.gridCount` per grid |
| Warnings | all warning strings from `renderCryptoRiskNotice` |

Swipe down or tap backdrop to dismiss.

---

## Section 2 — Direction Signals

**Section header color:** `--cyan` (#00d4ff)

### Card (default state)

```
┌──────────────────────────────────────────────────┐  border: green/red/yellow tint
│ BTC        $83,420 · BN    [LONG · ENTER]  [8.2]│
│ [Macro Bull ✓] [RSI 52] [Buy Pressure] [Bull/Bull]│
└──────────────────────────────────────────────────┘
```

**Header elements:**
- Ticker (Chakra Petch, --cyan)
- Price + provider badge (BN / BB)
- Direction + Rec badge (LONG·ENTER / SHORT·WATCH / AVOID)
- Score ring (circular border, color = score tier)

**Score ring color:**
- ≥7.5 → `--green`
- 6–7.4 → `--yellow`
- <6 → `--red`

> Note: score ring uses `CFG.SCORE_BOT_MIN` (7.5) as the activation threshold. The Rec badge tiers (`calcRecommendation`) use **≥8 = Enter, ≥6 = Watch, <6 = Avoid** — these are separate thresholds and must not be conflated.

**Pills shown (4 max):**
| Pill | Source | Color logic |
|------|--------|-------------|
| Macro Trend | `calcScore` direction + uMac/bMac count | bull=green, bear=red, partial=yellow, neutral=grey |
| RSI 4H | `m.rsi` | <30=green, >70=red, else neutral. ⚠ if extreme |
| Pressure | `_sharedBooleans`: buyP/selP/neutral | green/red/grey |
| Structure 4H/30d | `m.structure4h` + `m.structure30d` | aligned=green, conflict=yellow, bear=red |

**Card border tint:** bull=green, bear=red, avoid=yellow

**Recommendation badge:**
- `LONG · ENTER` — green
- `LONG · WATCH` / `SHORT · WATCH` — yellow
- `SHORT · ENTER` — red
- `AVOID` — yellow/dim

### Bottom Sheet (tap to open)

Content varies by recommendation tier (from `calcRecommendation` — score ≥8 = Enter, ≥6 = Watch, <6 = Avoid):

**Score ≥8 / Rec = Enter (full detail):**
| Row | Value |
|-----|-------|
| Signal | direction + rec badge |
| Score | x.x / 10 |
| Trend Macro | bull/bear full/partial, N/4 conditions |
| Trend Swing | AVWAP5d + CVD5d label |
| Pressure | buy/sell strong/partial |
| CVD 5/14/30d | ACC/DIS/NEUTRAL each |
| AVWAP 5/14/30d | Above/Below each |
| OI% 7d | value + color |
| Funding | value + color |
| ATR 4H | raw value |
| Entry | `bot.entry` |
| Stop Loss | `bot.sl` (1.5×ATR) |
| Take Profit 1 | `bot.tp1` |
| Take Profit 2 | `bot.tp2` |
| Leverage | `bot.leverage`x |
| R:R TP1 / TP2 | ratios |

**Score 6–7.9 / Rec = Watch (developing):**
Same as above minus Entry/SL/TP rows. Show "Setup developing — no entry params yet" note.

**Score <6 / Rec = Avoid:**
Abbreviated — Score, Macro, RSI only. Show "No setup — skip this asset" note.

---

## CSS Architecture

### Mobile-first breakpoints

```css
/* Base = mobile (≤480px) */
.cards-section { padding: 0 12px; }
.asset-card    { border-radius: 12px; padding: 12px 14px; }

/* Tablet+ */
@media (min-width: 640px) {
  .cards-section { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
}

/* Desktop */
@media (min-width: 1024px) {
  .cards-section { grid-template-columns: repeat(3, 1fr); }
}
```

### Bottom sheet

```css
.bottom-sheet {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 70vh;
  border-radius: 16px 16px 0 0;
  transform: translateY(100%);
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}
.bottom-sheet.open {
  transform: translateY(0);
}
#sheet-content {
  overflow-y: auto;
  max-height: calc(70vh - 48px); /* subtract handle + title */
  padding-bottom: 24px;          /* safe-area breathing room */
}
```

Backdrop: `position: fixed; inset: 0; background: rgba(0,0,0,.5)` — tap to dismiss.

### Existing CSS variables reused

All existing `--green`, `--red`, `--yellow`, `--cyan`, `--purple`, `--row-stripe`, `--row-border`, `--shadow` stay. No new color tokens needed.

---

## ui.js — Function Signatures

```js
// Wrapper: iterates allMetrics, returns joined HTML string of all direction cards
buildDirectionCards(allMetrics: Record<string, MetricsObject>): string

// Wrapper: iterates allMetrics, returns joined HTML string of all grid cards
buildGridCards(allMetrics: Record<string, MetricsObject>): string

// Single direction card (collapsed state with pills)
buildDirectionCard(name, m, prov, score, direction, rec): string

// Single grid card (collapsed state with pills)
buildGridCard(name, m): string

// Direction bottom sheet HTML (injected into #sheet-content on tap)
buildDirectionSheet(name, m, score, bot, rec): string

// Grid bottom sheet HTML (injected into #sheet-content on tap)
buildGridSheet(name, m): string
```

## ui.js — Changed Functions

| Old function | New function | Change |
|---|---|---|
| `buildFastRow()` | `buildDirectionCard()` | Returns card HTML instead of `<tr>` |
| `renderGridPanel()` | `buildGridCard()` | Returns card HTML, no more `<div id="grid-panel">` |
| `buildBotCard()` | merged into `buildDirectionCard()` sheet | Entry/SL/TP now lives in the bottom sheet |
| `buildSigCard()` | removed | Signal strip replaced by pill system |
| `buildDeepCard()` | `buildDirectionSheet()` | Bottom sheet HTML for direction detail |
| *(new)* | `buildGridSheet()` | Bottom sheet HTML for grid detail |
| `renderCryptoRiskNotice()` | moved into `buildGridSheet()` | Warnings appear inside sheet, not above cards |

---

## index.html — New Structure

```html
<header class="topbar">…</header>

<main>
  <section class="cards-section" id="grid-section">
    <div class="section-header purple">Grid Bot Advisor</div>
    <div id="grid-cards"><!-- built by buildGridCard() --></div>
  </section>

  <section class="cards-section" id="direction-section">
    <div class="section-header cyan">Direction Signals</div>
    <div id="direction-cards"><!-- built by buildDirectionCard() --></div>
  </section>
</main>

<!-- Bottom sheet overlay (shared, single instance) -->
<div id="sheet-backdrop" class="sheet-backdrop"></div>
<div id="bottom-sheet" class="bottom-sheet">
  <div class="sheet-handle"></div>
  <div id="sheet-content"></div>
</div>
```

Single bottom sheet instance — `sheet-content` is replaced on each open.

---

## app.js — Minimal wiring changes

`app.js` only changes how it calls `ui.js` render functions — no data flow changes:

```js
// Old
document.getElementById('fast-tbody').innerHTML = rows.join('');
document.getElementById('grid-panel').innerHTML = renderGridPanel(allMetrics);

// New
document.getElementById('direction-cards').innerHTML = buildDirectionCards(allMetrics);
document.getElementById('grid-cards').innerHTML = buildGridCards(allMetrics);
```

Bottom sheet open/close wired in `app.js` via event delegation on `.asset-card` click.

---

## Out of Scope (v6)

- Full Metrics table — removed (data accessible via bottom sheet)
- Reference Guide / Legends — kept as collapsible at bottom
- Config modal (ticker add/remove, capital) — unchanged
- Topbar (Market Pulse pills) — unchanged
- All `js/indicators.js` logic — untouched
