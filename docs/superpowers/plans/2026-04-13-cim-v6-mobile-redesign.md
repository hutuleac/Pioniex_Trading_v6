# CIM v6 Mobile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the table-based dashboard with two mobile-first card sections — Grid Bot Advisor (top) and Direction Signals (bottom) — each with indicator pills and a bottom sheet for full detail.

**Architecture:** Rewrite only `index.html`, `js/ui.js`, and `css/style.css`; add sheet wiring to `js/app.js`. All business logic in `api.js`, `indicators.js`, `grid.js`, `config.js` is untouched. A shared single bottom-sheet DOM instance is populated on card tap via event delegation in `app.js`, which has access to all module-level data maps.

**Tech Stack:** Vanilla JS ES Modules · CSS custom properties · No build step · Serve with `npx serve .` or open index.html via HTTP

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `css/style.css` | Modify | Add card base, pill variants, score ring, section headers, bottom sheet, responsive grid |
| `index.html` | Modify | Replace table sections with card section skeleton + bottom sheet overlay; keep topbar, config modal, legend |
| `js/ui.js` | Modify | Replace `buildFastRow`, `renderGridPanel`, `buildBotCard`, `buildDeepCard`, `buildSigCard` with new card/sheet builders; keep `buildTableRow`, `buildMarketPulseStrip`, `fmt`, `col` helpers |
| `js/app.js` | Modify | Update DOM target IDs, add `allScores`/`allBots`/`allRecs` stores (already exist), add sheet open/close event delegation |

---

## Task 1: CSS — Card Foundation

**Files:**
- Modify: `css/style.css` (append after existing rules — do NOT remove anything yet)

- [ ] **Step 1: Append card base styles**

Add to the bottom of `css/style.css`:

```css
/* ══════════════════════════════════════════════
   CIM v6 — Card Layout
   ══════════════════════════════════════════════ */

/* Section wrapper — mobile default: single column */
.cards-section {
  padding: 0 12px;
  margin-bottom: 32px;
}

/* Section header */
.section-header {
  font-family: 'Chakra Petch', sans-serif;
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-header::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.section-header.cyan   { color: var(--cyan); }
.section-header.purple { color: var(--purple); }

/* Asset card */
.asset-card {
  background: rgba(16, 20, 40, 0.85);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color .18s, background .18s;
  -webkit-tap-highlight-color: transparent;
}
.asset-card:active { background: rgba(16,20,40,1); }

/* Card color states */
.asset-card.card-bull  { border-color: rgba(0,230,118,.28); }
.asset-card.card-bear  { border-color: rgba(255,26,75,.28); }
.asset-card.card-avoid { border-color: rgba(255,215,0,.18); }
.asset-card.card-grid-ok   { border-color: rgba(0,230,118,.28); }
.asset-card.card-grid-warn { border-color: rgba(255,215,0,.28); }
.asset-card.card-grid-bad  { border-color: rgba(255,26,75,.18); }

/* Card header row */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-ticker {
  font-family: 'Chakra Petch', sans-serif;
  font-size: .9rem;
  font-weight: 700;
  color: var(--cyan);
  letter-spacing: .06em;
}
.card-price {
  font-family: 'IBM Plex Mono', monospace;
  font-size: .65rem;
  color: #555;
  margin-top: 2px;
}
.card-meta {
  display: flex;
  align-items: center;
  gap: 7px;
}

/* Score ring */
.score-ring {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid;
  font-family: 'IBM Plex Mono', monospace;
  font-size: .72rem;
  font-weight: 700;
  flex-shrink: 0;
}
.score-ring.sr-high { border-color: var(--green); color: var(--green); }
.score-ring.sr-mid  { border-color: var(--yellow); color: var(--yellow); }
.score-ring.sr-low  { border-color: var(--red); color: var(--red); }

/* Indicator pills row */
.indicator-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 7px;
}
.ind-pill {
  font-family: 'IBM Plex Mono', monospace;
  font-size: .6rem;
  padding: 2px 7px;
  border-radius: 3px;
  white-space: nowrap;
}
.ind-pill.p-bull    { color: var(--green);  background: rgba(0,230,118,.08);   border: 1px solid rgba(0,230,118,.22); }
.ind-pill.p-bear    { color: var(--red);    background: rgba(255,26,75,.08);   border: 1px solid rgba(255,26,75,.22); }
.ind-pill.p-warn    { color: var(--yellow); background: rgba(255,215,0,.08);   border: 1px solid rgba(255,215,0,.22); }
.ind-pill.p-purple  { color: var(--purple); background: rgba(179,136,255,.08); border: 1px solid rgba(179,136,255,.22); }
.ind-pill.p-neutral { color: #777;          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); }

/* Responsive: 2-col on tablet, 3-col on desktop */
@media (min-width: 640px) {
  .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cards-grid .asset-card { margin-bottom: 0; }
}
@media (min-width: 1024px) {
  .cards-grid { grid-template-columns: repeat(3, 1fr); }
}
```

- [ ] **Step 2: Verify visually**

Open `index.html` via HTTP. Existing layout should be intact (no classes applied yet). No visual change expected — just confirming no CSS parse errors (check browser devtools console).

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/Peter/Desktop/Claude/Pioniexx_Trading_v5"
git add css/style.css
git commit -m "feat: v6 card base CSS — section headers, pills, score ring, responsive grid"
```

---

## Task 2: CSS — Bottom Sheet

**Files:**
- Modify: `css/style.css` (append after Task 1 additions)

- [ ] **Step 1: Append bottom sheet styles**

```css
/* ══════════════════════════════════════════════
   CIM v6 — Bottom Sheet
   ══════════════════════════════════════════════ */

.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.55);
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s;
}
.sheet-backdrop.open {
  opacity: 1;
  pointer-events: all;
}

.bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 72vh;
  background: rgba(10, 13, 28, 0.98);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 18px 18px 0 0;
  z-index: 101;
  transform: translateY(100%);
  transition: transform .28s cubic-bezier(0.32, 0.72, 0, 1);
  display: flex;
  flex-direction: column;
}
.bottom-sheet.open {
  transform: translateY(0);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: #2a2f3e;
  border-radius: 2px;
  margin: 12px auto 8px;
  flex-shrink: 0;
}

.sheet-title {
  font-family: 'Chakra Petch', sans-serif;
  font-size: .8rem;
  font-weight: 700;
  letter-spacing: .06em;
  color: #cdd6f4;
  padding: 0 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

#sheet-content {
  overflow-y: auto;
  flex: 1;
  padding: 12px 16px 32px;
  -webkit-overflow-scrolling: touch;
}

/* Sheet detail table */
.sheet-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'IBM Plex Mono', monospace;
  font-size: .7rem;
}
.sheet-table td {
  padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,.04);
  vertical-align: middle;
}
.sheet-table td:first-child {
  color: #555;
  text-transform: uppercase;
  letter-spacing: .04em;
  width: 45%;
}
.sheet-table td:last-child { text-align: right; }

.sheet-section-label {
  font-family: 'Chakra Petch', sans-serif;
  font-size: .6rem;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: #333;
  margin: 10px 0 4px;
}

.sheet-note {
  font-family: 'IBM Plex Mono', monospace;
  font-size: .65rem;
  color: #555;
  text-align: center;
  margin-top: 12px;
  font-style: italic;
}

/* Desktop: constrain sheet width */
@media (min-width: 640px) {
  .bottom-sheet {
    max-width: 480px;
    left: 50%;
    right: auto;
    transform: translateX(-50%) translateY(100%);
    border-radius: 18px 18px 0 0;
  }
  .bottom-sheet.open {
    transform: translateX(-50%) translateY(0);
  }
}
```

- [ ] **Step 2: Verify**

Open `index.html` via HTTP. No visual change expected. Check console for no CSS errors.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: v6 bottom sheet CSS — backdrop, slide-up panel, scrollable content"
```

---

## Task 3: index.html — New Skeleton

**Files:**
- Modify: `index.html`

The goal: replace the three old sections (Fast Decision table, Grid Bot Advisor div, Full Metrics table, bot-grid section) with the two new card sections + bottom sheet overlay. Keep: topbar `<header>`, config modal, legend section, all `<script>` tags.

- [ ] **Step 1: Locate and replace the main content sections**

In `index.html`, find the block starting with:
```html
<div class="section">
  <div class="section-title">Fast Decision</div>
```
...and ending with the closing `</div>` of the Full Metrics section and the `<div id="bot-grid">` section.

Replace everything between `</header>` and the config modal `<div id="config-modal"` with:

```html
<main id="main-content">

  <!-- ── Section 1: Grid Bot Advisor ─────────────────────── -->
  <section class="cards-section" id="grid-section">
    <div class="section-header purple">Grid Bot Advisor</div>
    <div class="cards-grid" id="grid-cards">
      <div class="asset-card"><span style="color:#555;font-size:.7rem;font-family:'IBM Plex Mono',monospace">Loading…</span></div>
    </div>
  </section>

  <!-- ── Section 2: Direction Signals ────────────────────── -->
  <section class="cards-section" id="direction-section">
    <div class="section-header cyan">Direction Signals</div>
    <div class="cards-grid" id="direction-cards">
      <div class="asset-card"><span style="color:#555;font-size:.7rem;font-family:'IBM Plex Mono',monospace">Loading…</span></div>
    </div>
  </section>

  <!-- ── Legend (collapsible, unchanged) ─────────────────── -->
  <section class="cards-section" id="legend-section">
    <!-- existing legend/reference HTML goes here — move it from old position -->
  </section>

</main>

<!-- ── Bottom Sheet Overlay ──────────────────────────────── -->
<div id="sheet-backdrop" class="sheet-backdrop"></div>
<div id="bottom-sheet" class="bottom-sheet">
  <div class="sheet-handle"></div>
  <div class="sheet-title">
    <span id="sheet-title-text">Detail</span>
    <span id="sheet-title-badge"></span>
  </div>
  <div id="sheet-content"></div>
</div>
```

- [ ] **Step 2: Verify page loads**

Serve with `npx serve .` and open in browser. Should see:
- Topbar (Market Pulse pills) still renders
- "Grid Bot Advisor" and "Direction Signals" section headers appear
- "Loading…" placeholder cards visible
- No JS errors in console (existing app.js will fail to find old DOM IDs — that's expected and will be fixed in Task 7)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: v6 index.html skeleton — two card sections, bottom sheet overlay"
```

---

## Task 4: ui.js — Grid Bot Card Builders

**Files:**
- Modify: `js/ui.js`

Add two new exported functions. Do NOT remove any existing functions yet (app.js still imports them).

- [ ] **Step 1: Add `buildGridCard()` after `renderGridPanel`**

```js
// ── Grid Bot card (collapsed) ─────────────────────────────
export function buildGridCard(name, m, prov = '?') {
  if (!m) return '';

  const v     = m.gridViability;
  const range = m.gridRange;
  const adx   = m.adx?.adx ?? 0;

  // Viability badge + card class
  let viabBadge, cardCls;
  if (v?.recommended === true && adx < 20) {
    viabBadge = `<span class="badge-sm green">RECOMMENDED</span>`;
    cardCls   = 'card-grid-ok';
  } else if (v?.recommended === true || adx < 25) {
    viabBadge = `<span class="badge-sm yellow">CAUTION</span>`;
    cardCls   = 'card-grid-warn';
  } else {
    viabBadge = `<span class="badge-sm red">AVOID GRID</span>`;
    cardCls   = 'card-grid-bad';
  }

  // ADX pill
  const adxCls = adx < 20 ? 'p-bull' : adx < 25 ? 'p-warn' : 'p-bear';
  const adxIcon = adx < 20 ? ' ✓' : adx < 25 ? ' ⚠' : ' ✗';
  const adxPill = `<span class="ind-pill ${adxCls}">ADX ${adx.toFixed(0)}${adxIcon}</span>`;

  // CVD lateral pill
  const cvdDelta = Math.abs(m.cvd5d ?? 0);
  const vol5d    = Math.max(m.volume5d ?? 1, 1);
  const isLateral = (cvdDelta / vol5d) < CFG.CVD_LATERAL_RATIO;
  const cvdPill = isLateral
    ? `<span class="ind-pill p-bull">CVD Lateral</span>`
    : `<span class="ind-pill p-bear">CVD Directional</span>`;

  // Funding pill
  const fund = m.fundingRate ?? 0;
  const fundAbs = Math.abs(fund * 100);
  const fundCls = fundAbs < 0.05 ? 'p-bull' : fundAbs < 0.1 ? 'p-warn' : 'p-bear';
  const fundPill = `<span class="ind-pill ${fundCls}">Fund ${(fund*100).toFixed(3)}%</span>`;

  // Range pill
  let rangePill = '';
  if (range?.rangeLow != null && range?.rangeHigh != null) {
    const lo = range.rangeLow < 1 ? range.rangeLow.toFixed(4) : range.rangeLow.toFixed(0);
    const hi = range.rangeHigh < 1 ? range.rangeHigh.toFixed(4) : range.rangeHigh.toFixed(0);
    rangePill = `<span class="ind-pill p-purple">$${lo}–$${hi}</span>`;
  }

  return `
<div class="asset-card ${cardCls}" data-name="${name}" data-type="grid">
  <div class="card-header">
    <div>
      <div class="card-ticker">${name}</div>
      <div class="card-price">$${fmt(m.price,2)} · ${prov}</div>
    </div>
    <div class="card-meta">${viabBadge}</div>
  </div>
  <div class="indicator-row">
    ${adxPill}${cvdPill}${fundPill}${rangePill}
  </div>
</div>`;
}

// ── Grid Bot cards wrapper ────────────────────────────────
export function buildGridCards(allMetrics, symProvider = {}) {
  return Object.entries(allMetrics)
    .filter(([, m]) => m != null)
    .map(([name, m]) => buildGridCard(name, m, symProvider[name] || '?'))
    .join('') || '<div class="asset-card"><span style="color:#555;font-size:.7rem">No data yet.</span></div>';
}
```

- [ ] **Step 2: Add `badge-sm` CSS to style.css** (these replace the old `.badge` inside cards)

```css
/* Small inline badge for cards */
.badge-sm {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Chakra Petch', sans-serif;
  font-size: .6rem;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
}
.badge-sm.green  { background: rgba(0,230,118,.15);  color: var(--green);  border: 1px solid rgba(0,230,118,.3); }
.badge-sm.red    { background: rgba(255,26,75,.15);   color: var(--red);    border: 1px solid rgba(255,26,75,.3); }
.badge-sm.yellow { background: rgba(255,215,0,.12);   color: var(--yellow); border: 1px solid rgba(255,215,0,.3); }
.badge-sm.cyan   { background: rgba(0,212,255,.12);   color: var(--cyan);   border: 1px solid rgba(0,212,255,.3); }
.badge-sm.purple { background: rgba(179,136,255,.12); color: var(--purple); border: 1px solid rgba(179,136,255,.3); }
```

- [ ] **Step 3: Commit**

```bash
git add js/ui.js css/style.css
git commit -m "feat: v6 buildGridCard + buildGridCards — pills, viability badge, card states"
```

---

## Task 5: ui.js — Grid Bot Sheet

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add `buildGridSheet()` after `buildGridCards`**

```js
// ── Grid Bot bottom sheet ──────────────────────────────────
export function buildGridSheet(name, m, prov = '?') {
  if (!m) return '<p class="sheet-note">No data available.</p>';

  const v      = m.gridViability;
  const range  = m.gridRange;
  const adx    = m.adx?.adx ?? 0;
  const cap    = getGridCapital();
  const count  = m.gridCount ?? '—';
  const capPer = count !== '—' && cap ? fmt(cap / count, 2) : '—';

  const cvdDelta  = Math.abs(m.cvd5d ?? 0);
  const vol5d     = Math.max(m.volume5d ?? 1, 1);
  const isLateral = (cvdDelta / vol5d) < CFG.CVD_LATERAL_RATIO;
  const cvdLabel  = isLateral ? 'Lateral ✓' : 'Directional ✗';
  const cvdColor  = isLateral ? 'var(--green)' : 'var(--red)';

  const dir = m.gridDirection;
  const dirLabel = dir?.label ?? '—';

  // Warnings
  const warns = [];
  if (adx > 25)    warns.push(`ADX ${adx.toFixed(1)} — strong trend, grid risky`);
  if (m.rsi > 70)  warns.push(`RSI ${m.rsi.toFixed(1)} — overbought, wait for pullback`);
  if (m.rsi < 30)  warns.push(`RSI ${m.rsi.toFixed(1)} — oversold`);
  const warnsHtml = warns.length
    ? warns.map(w => `<div style="color:var(--yellow);font-size:.65rem;margin-top:3px">⚠ ${w}</div>`).join('')
    : `<div style="color:var(--green);font-size:.65rem;margin-top:3px">No warnings</div>`;

  const lo = range?.rangeLow  != null ? fmt(range.rangeLow,  range.rangeLow  < 1 ? 4 : 2) : '—';
  const hi = range?.rangeHigh != null ? fmt(range.rangeHigh, range.rangeHigh < 1 ? 4 : 2) : '—';

  return `
<div class="sheet-section-label">Grid Parameters</div>
<table class="sheet-table">
  <tr><td>Range</td><td>$${lo} – $${hi}</td></tr>
  <tr><td>Grid Count</td><td>${count}</td></tr>
  <tr><td>Profit / Grid</td><td style="color:var(--green)">${m.gridProfitPerGrid != null ? m.gridProfitPerGrid.toFixed(2)+'%' : '—'}</td></tr>
  <tr><td>Drawdown (worst)</td><td style="color:var(--yellow)">${m.gridDrawdown != null ? m.gridDrawdown.toFixed(1)+'%' : '—'}</td></tr>
  <tr><td>Capital ($${cap})</td><td>$${capPer} / grid</td></tr>
  <tr><td>Direction Bias</td><td style="color:var(--purple)">${dirLabel}</td></tr>
</table>

<div class="sheet-section-label">Conditions</div>
<table class="sheet-table">
  <tr><td>ADX 4H</td><td style="color:${adx < 20 ? 'var(--green)' : adx < 25 ? 'var(--yellow)' : 'var(--red)'}">${adx.toFixed(1)} ${adx < 20 ? '✓ Low trend' : adx < 25 ? '⚠ Mild trend' : '✗ Strong trend'}</td></tr>
  <tr><td>CVD 5d</td><td style="color:${cvdColor}">${cvdLabel}</td></tr>
  <tr><td>RSI 4H</td><td style="color:${m.rsi > 70 || m.rsi < 30 ? 'var(--yellow)' : 'var(--green)'}">${m.rsi != null ? m.rsi.toFixed(1) : '—'}</td></tr>
  <tr><td>Funding</td><td>${m.fundingRate != null ? (m.fundingRate*100).toFixed(3)+'%' : '—'}</td></tr>
</table>

<div class="sheet-section-label">Warnings</div>
${warnsHtml}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui.js
git commit -m "feat: v6 buildGridSheet — full grid params, conditions, warnings"
```

---

## Task 6: ui.js — Direction Card Builders

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add `buildDirectionCard()` and `buildDirectionCards()`**

```js
// ── Direction card (collapsed) ────────────────────────────
export function buildDirectionCard(name, m, prov = '?', score = 0, direction = null, rec = null) {
  if (!m) return '';

  // Score ring class
  const srCls = score >= CFG.SCORE_BOT_MIN ? 'sr-high' : score >= 6 ? 'sr-mid' : 'sr-low';

  // Rec badge
  const recLabel = rec?.rec ?? 'AVOID';
  const recDir   = direction === 'LONG' ? 'LONG' : direction === 'SHORT' ? 'SHORT' : '';
  const recText  = recDir ? `${recDir} · ${recLabel}` : recLabel;
  const recCls   = recLabel === 'Enter' ? 'green' : recLabel === 'Watch' ? 'yellow' : 'red';
  const recBadge = `<span class="badge-sm ${recCls}">${recText}</span>`;

  // Card border class
  const cardCls = direction === 'LONG' ? 'card-bull'
                : direction === 'SHORT' ? 'card-bear'
                : 'card-avoid';

  // Pill 1: Macro Trend
  const isBull = direction === 'LONG';
  const isBear = direction === 'SHORT';
  const macroLabel = isBull ? 'Macro Bull' : isBear ? 'Macro Bear' : 'Neutral';
  const macroCls   = isBull ? 'p-bull' : isBear ? 'p-bear' : 'p-neutral';
  const macroFull  = score >= CFG.SCORE_BOT_MIN;
  const macroPill  = `<span class="ind-pill ${macroCls}">${macroLabel}${macroFull ? ' ✓' : ''}</span>`;

  // Pill 2: RSI
  const rsi = m.rsi ?? 0;
  const rsiCls = rsi < 30 ? 'p-bull' : rsi > 70 ? 'p-bear' : rsi > 65 ? 'p-warn' : 'p-neutral';
  const rsiWarn = rsi > 70 || rsi < 30 ? ' ⚠' : '';
  const rsiPill = `<span class="ind-pill ${rsiCls}">RSI ${rsi.toFixed(0)}${rsiWarn}</span>`;

  // Pill 3: Flow / Pressure
  const flow = m.flow ?? 0;
  const flowCls = flow > CFG.FLOW_STRONG ? 'p-bull'
                : flow < -CFG.FLOW_STRONG ? 'p-bear'
                : flow > CFG.FLOW_PARTIAL ? 'p-warn'
                : 'p-neutral';
  const flowLabel = flow > CFG.FLOW_STRONG ? 'Buy Pressure'
                  : flow < -CFG.FLOW_STRONG ? 'Sell Pressure'
                  : flow > CFG.FLOW_PARTIAL ? 'Mild Buy'
                  : flow < -CFG.FLOW_PARTIAL ? 'Mild Sell'
                  : 'No Pressure';
  const flowPill = `<span class="ind-pill ${flowCls}">${flowLabel}</span>`;

  // Pill 4: Structure
  const s4h  = m.structure4h  ?? '—';
  const s30d = m.structure30d ?? '—';
  const strMatch = s4h === s30d;
  const strBull  = s4h === 'Bullish' && s30d === 'Bullish';
  const strBear  = s4h === 'Bearish' && s30d === 'Bearish';
  const strCls   = strBull ? 'p-bull' : strBear ? 'p-bear' : !strMatch ? 'p-warn' : 'p-neutral';
  const strPill  = `<span class="ind-pill ${strCls}">${s4h.slice(0,4)} / ${s30d.slice(0,4)}</span>`;

  return `
<div class="asset-card ${cardCls}" data-name="${name}" data-type="direction">
  <div class="card-header">
    <div>
      <div class="card-ticker">${name}</div>
      <div class="card-price">$${fmt(m.price,2)} · ${prov}</div>
    </div>
    <div class="card-meta">
      ${recBadge}
      <span class="score-ring ${srCls}">${score.toFixed(1)}</span>
    </div>
  </div>
  <div class="indicator-row">
    ${macroPill}${rsiPill}${flowPill}${strPill}
  </div>
</div>`;
}

// ── Direction cards wrapper ───────────────────────────────
export function buildDirectionCards(allMetrics, allScores = {}, allRecs = {}, symProvider = {}) {
  return Object.entries(allMetrics)
    .filter(([, m]) => m != null)
    .sort((a, b) => (allScores[b[0]]?.score ?? 0) - (allScores[a[0]]?.score ?? 0))
    .map(([name, m]) => buildDirectionCard(
      name, m,
      symProvider[name] || '?',
      allScores[name]?.score ?? 0,
      allScores[name]?.direction ?? null,
      allRecs[name] ?? null
    ))
    .join('') || '<div class="asset-card"><span style="color:#555;font-size:.7rem">No data yet.</span></div>';
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui.js
git commit -m "feat: v6 buildDirectionCard + buildDirectionCards — pills, score ring, rec badge"
```

---

## Task 7: ui.js — Direction Sheet

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add `buildDirectionSheet()`**

```js
// ── Direction bottom sheet ────────────────────────────────
export function buildDirectionSheet(name, m, score = 0, direction = null, detail = [], bot = null, rec = null) {
  if (!m) return '<p class="sheet-note">No data available.</p>';

  const recLabel = rec?.rec ?? 'Avoid';
  const hasEntry = recLabel === 'Enter' && bot != null;
  const hasDev   = recLabel === 'Watch';

  // AVWAP above/below
  const price = m.price ?? 0;
  const av5   = m.avwap5d  != null ? (price > m.avwap5d  ? 'Above ↑' : 'Below ↓') : '—';
  const av14  = m.avwap14d != null ? (price > m.avwap14d ? 'Above ↑' : 'Below ↓') : '—';
  const av30  = m.avwap30d != null ? (price > m.avwap30d ? 'Above ↑' : 'Below ↓') : '—';
  const avColor = (v) => v.startsWith('Above') ? 'var(--green)' : 'var(--red)';

  // CVD labels
  const cvdLabel = (v) => v == null ? '—' : v > 0 ? 'ACC' : v < 0 ? 'DIS' : 'NEUTRAL';
  const cvdColor = (v) => v == null ? '#555' : v > 0 ? 'var(--green)' : 'var(--red)';

  // Entry/SL/TP block (only when rec = Enter)
  const entryHtml = hasEntry ? `
<div class="sheet-section-label">Entry Parameters</div>
<table class="sheet-table">
  <tr><td>Entry</td><td style="color:var(--cyan)">${fmt(bot.entry, bot.entry < 1 ? 4 : 2)}</td></tr>
  <tr><td>Stop Loss (1.5×ATR)</td><td style="color:var(--red)">${fmt(bot.sl, bot.sl < 1 ? 4 : 2)}</td></tr>
  <tr><td>Take Profit 1</td><td style="color:var(--green)">${fmt(bot.tp1, bot.tp1 < 1 ? 4 : 2)}</td></tr>
  <tr><td>Take Profit 2</td><td style="color:var(--green)">${fmt(bot.tp2, bot.tp2 < 1 ? 4 : 2)}</td></tr>
  <tr><td>Leverage</td><td>${bot.leverage ?? '—'}x</td></tr>
  <tr><td>R:R TP1 / TP2</td><td>1:${bot.rr1?.toFixed(1) ?? '—'} / 1:${bot.rr2?.toFixed(1) ?? '—'}</td></tr>
</table>` : hasDev
    ? `<p class="sheet-note">Setup developing — no entry params yet</p>`
    : `<p class="sheet-note">No setup — skip this asset</p>`;

  return `
<div class="sheet-section-label">Signal</div>
<table class="sheet-table">
  <tr><td>Score</td><td style="color:${score>=7.5?'var(--green)':score>=6?'var(--yellow)':'var(--red)'}">${score.toFixed(1)} / 10</td></tr>
  <tr><td>Direction</td><td>${direction ?? 'WAIT'}</td></tr>
  <tr><td>RSI 4H</td><td style="color:${m.rsi>70||m.rsi<30?'var(--yellow)':'var(--green)'}">${m.rsi?.toFixed(1) ?? '—'}</td></tr>
  <tr><td>Funding</td><td>${m.fundingRate != null ? (m.fundingRate*100).toFixed(3)+'%' : '—'}</td></tr>
  <tr><td>OI% 7d</td><td style="color:${(m.oiChange??0)>0?'var(--green)':'var(--red)'}">${m.oiChange != null ? m.oiChange.toFixed(1)+'%' : '—'}</td></tr>
  <tr><td>ATR 4H</td><td>${m.atr != null ? fmt(m.atr, m.atr<1?4:2) : '—'}</td></tr>
</table>

<div class="sheet-section-label">Trend</div>
<table class="sheet-table">
  <tr><td>Structure 4H</td><td>${m.structure4h ?? '—'}</td></tr>
  <tr><td>Structure 30d</td><td>${m.structure30d ?? '—'}</td></tr>
  <tr><td>AVWAP 5d</td><td style="color:${avColor(av5)}">${av5}</td></tr>
  <tr><td>AVWAP 14d</td><td style="color:${avColor(av14)}">${av14}</td></tr>
  <tr><td>AVWAP 30d</td><td style="color:${avColor(av30)}">${av30}</td></tr>
  <tr><td>CVD 5d / 14d / 30d</td>
      <td><span style="color:${cvdColor(m.cvd5d)}">${cvdLabel(m.cvd5d)}</span> / <span style="color:${cvdColor(m.cvd14d)}">${cvdLabel(m.cvd14d)}</span> / <span style="color:${cvdColor(m.cvd30d)}">${cvdLabel(m.cvd30d)}</span></td></tr>
</table>

${entryHtml}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui.js
git commit -m "feat: v6 buildDirectionSheet — signal, trend, entry params tiers"
```

---

## Task 8: app.js — Wire New Builders + Sheet

**Files:**
- Modify: `js/app.js`

This task has 3 sub-steps: update imports, update DOM injection calls, add sheet event delegation.

- [ ] **Step 1: Update imports at top of app.js**

Find the existing import line:
```js
import { buildTableRow, buildBotCard,
         buildFastRow, buildDeepCard, renderCryptoRiskNotice, renderGridPanel,
         buildMarketPulseStrip } from './ui.js';
```

Replace with:
```js
import { buildMarketPulseStrip,
         buildGridCards, buildGridSheet,
         buildDirectionCards, buildDirectionSheet } from './ui.js';
```

- [ ] **Step 2: Add module-level score/bot/rec maps (they already exist — verify)**

Check that these lines exist in app.js around line 30–40:
```js
let allScores  = {};
let allBots    = {};
let allRecs    = {};
```
If they don't exist under those names, find their actual names (may be `allScores`, `allBots`, `allRecs`) — they are set in `fetchSingleTicker` and `fetchAndDisplay`. No change needed if they exist.

- [ ] **Step 3: Replace DOM injection calls**

Find in `fetchAndDisplay()` (the block that runs after the fetch loop completes, around line 256–270):

```js
// OLD — find and remove these lines:
const fastTbody = document.getElementById('fast-tbody');
// ... buildFastRow calls ...
document.getElementById('bot-grid').innerHTML = ...
document.getElementById('grid-risk-notice').innerHTML = renderCryptoRiskNotice(allMetrics);
document.getElementById('grid-panel').innerHTML = renderGridPanel(allMetrics, allSignals, getGridCapital(), symProvider);
```

Replace with:
```js
const gridEl = document.getElementById('grid-cards');
if (gridEl) gridEl.innerHTML = buildGridCards(allMetrics, symProvider);

const dirEl = document.getElementById('direction-cards');
if (dirEl) dirEl.innerHTML = buildDirectionCards(allMetrics, allScores, allRecs, symProvider);
```

Also find the incremental update block (inside `fetchSingleTicker` result handling, ~line 176):
```js
// OLD:
if (shimmerFast) shimmerFast.outerHTML = buildFastRow(name, mFull, ...);
if (deepTd) deepTd.innerHTML = buildDeepCard(name, ...);
```
Remove those lines (the incremental shimmer replaced by full re-render after loop completes is fine).

- [ ] **Step 4: Add sheet open/close event delegation**

Add after the existing event listener block (near the bottom of app.js, before the closing IIFE or after `fetchAndDisplay()` call):

```js
// ── Bottom sheet ──────────────────────────────────────────
document.addEventListener('click', e => {
  const card = e.target.closest('.asset-card[data-name]');
  if (!card) return;
  const name = card.dataset.name;
  const type = card.dataset.type;
  const m    = allMetrics[name];
  if (!m) return;

  let html;
  if (type === 'grid') {
    html = buildGridSheet(name, m, symProvider[name] || '?');
    document.getElementById('sheet-title-text').textContent = `${name} — Grid Bot`;
    document.getElementById('sheet-title-badge').innerHTML  =
      m.gridViability?.recommended ? '<span class="badge-sm green">RECOMMENDED</span>' : '<span class="badge-sm yellow">CAUTION</span>';
  } else {
    const score     = allScores[name]?.score ?? 0;
    const direction = allScores[name]?.direction ?? null;
    const detail    = allScores[name]?.detail ?? [];
    const bot       = allBots[name] ?? null;
    const rec       = allRecs[name] ?? null;
    html = buildDirectionSheet(name, m, score, direction, detail, bot, rec);
    document.getElementById('sheet-title-text').textContent = `${name} — Analysis`;
    document.getElementById('sheet-title-badge').innerHTML  = '';
  }

  document.getElementById('sheet-content').innerHTML = html;
  document.getElementById('bottom-sheet').classList.add('open');
  document.getElementById('sheet-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
});

document.getElementById('sheet-backdrop').addEventListener('click', () => {
  document.getElementById('bottom-sheet').classList.remove('open');
  document.getElementById('sheet-backdrop').classList.remove('open');
  document.body.style.overflow = '';
});
```

- [ ] **Step 5: Verify end-to-end in browser**

Serve with `npx serve .`, open `http://localhost:3000`.

Expected:
1. Both card sections render after data loads (~5–10 sec)
2. Grid Bot Advisor shows cards with ADX/CVD/Funding/Range pills
3. Direction Signals shows cards sorted by score (highest first) with Macro/RSI/Pressure/Structure pills
4. Tapping any card opens the bottom sheet with correct content
5. Tapping backdrop closes the sheet
6. On mobile (or DevTools mobile sim): cards stack single column, sheet slides up from bottom
7. No console errors

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat: v6 app.js wiring — new card DOM targets, sheet open/close delegation"
```

---

## Task 9: Cleanup + Version Bump

**Files:**
- Modify: `js/config.js` — bump `APP_VERSION`
- Modify: `js/ui.js` — remove now-unused old functions
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version**

In `js/config.js`, change:
```js
APP_VERSION: '5.4',
```
to:
```js
APP_VERSION: '6.0',
```

- [ ] **Step 2: Remove dead functions from ui.js**

Remove these exports (they are no longer imported by app.js):
- `buildFastRow()`
- `buildBotCard()`
- `buildDeepCard()`
- `buildSigCard()`
- `renderCryptoRiskNotice()`
- `renderGridPanel()`

Keep: `buildTableRow`, `buildMarketPulseStrip`, `fmt`, `fmtB`, `col`, `sCol`, `scClass`, `scColor`, `sigValHtml`

> **Important:** Before removing each function, verify it is not referenced anywhere with:
> ```bash
> grep -rn "buildFastRow\|buildBotCard\|buildDeepCard\|buildSigCard\|renderCryptoRiskNotice\|renderGridPanel" C:/Users/Peter/Desktop/Claude/Pioniexx_Trading_v5/js/
> ```
> Only remove if the only reference is the function definition itself.

- [ ] **Step 3: Update CHANGELOG.md**

Add entry at top:
```markdown
## v6.0 — 2026-04-13
- Mobile-first redesign: table layout replaced with two card sections
- Section 1: Grid Bot Advisor (ADX, CVD lateral, funding, range pills)
- Section 2: Direction Signals (macro trend, RSI, pressure, structure pills)
- Bottom sheet for full detail: tap any card to expand
- Score ring (green/yellow/red) replacing numeric column
- Entry/SL/TP params in Direction sheet when rec = Enter
- Removed: Full Metrics table, Signal Analysis strip, Active Bot Parameters section
```

- [ ] **Step 4: Final verification**

Open on actual mobile device (or DevTools iPhone 12 Pro sim at 390px):
- [ ] Cards are thumb-reachable
- [ ] No horizontal scroll
- [ ] Bottom sheet scrolls internally when content overflows
- [ ] Score rings render crisp (no clipping)
- [ ] Pill text is readable at 9px

- [ ] **Step 5: Commit and push**

```bash
git add index.html css/style.css js/ui.js js/app.js js/config.js CHANGELOG.md
git commit -m "feat: v6.0 — mobile-first card layout, grid bot + direction sections, bottom sheet"
git push origin master
```
