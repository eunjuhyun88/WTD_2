# Indicator Visual Design v2 — 2026-04-22

> Supersedes `indicator-visual-design.md` for panel layout sections.
> Archetype A-J component specs in v1 remain authoritative.
> **This doc updates only the panel assembly / layout contract.**

---

## Change Summary

v1 used a generic "Desktop 1280px" mockup that didn't match the actual TradeMode layout system (A/B/C/D).
v2 anchors the mockup to **Layout C (C SIDEBAR)** as the canonical default and adds the D PEEK contract.

---

## Layout Defaults

| Layout key | Role | Indicator behaviour |
|------------|------|---------------------|
| **C SIDEBAR** | **Default layout** | Regime + Gauge always visible below chart. Venue / Liq panes are toggleable. |
| **D PEEK** | Chart-focus mode | Peek drawer raised → indicators + ANALYZE tab shown together. |
| A GRID | Research | Full evidence grid (no change). |
| B SPLIT | Side-by-side | Analyze drawer with indicator panes (no change). |

---

## Part 11 — C SIDEBAR Panel Mockup (2-column, canonical)

```
┌──────────────────────────────────────────────────────────────┐
│ TOP HEADER  [symbol] [tf] [OI] [Fund] [CVD]  ⚙ INDICATORS   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   MAIN CHART  (candle + structure markers + gamma overlay)   │
│                                                              │
│   [ liq sub-pane ]  ← always visible when showLiq=true      │
│   [ OI sub-pane  ]  ← always visible when showOI=true       │
│   [ Fund sub-pane ] ← always visible when showFunding=true   │
│                                                              │
├─────────────────────────────────────┬────────────────────────┤
│  REGIME BANNER  (Arch E × ≤3)       │                        │
│  [↗ FUNDING 6h] [• SQUEEZE 2.1d]   │   SIDEBAR              │
├─────────────────────────────────────┤                        │
│  GAUGE ROW  (Arch A — always shown) │   ─────────────────    │
│  [OI 1h ▁▂▇] [Fund +pos] [Vol 1.8x]│   ANALYZE tab          │
│  [Skew p72]  [Premium p45]          │   (hypothesis + plan)  │
├─────────────────────────────────────┤                        │
│  VENUE STRIP  (Arch F — toggle)     │   ─────────────────    │
│  [OI/venue ↑Binance Δ+3.2%]        │                        │
│  [Fund/venue ↑Bybit spread]         │   SCAN tab             │
├─────────────────────────────────────┤   (world-model scan)   │
│  LIQ HEATMAP  (Arch C — toggle)     │                        │
│  price×time grid                    │   ─────────────────    │
└─────────────────────────────────────┴────────────────────────┘
```

### Behaviour rules

- **Regime banner + Gauge row**: always rendered in C SIDEBAR; user cannot hide them (they ARE the signal).
- **Venue strip** (`oi_per_venue`, `funding_per_venue`): default `defaultVisible=true`; user can toggle off via ⚙ INDICATORS.
- **Liq heatmap**: default `defaultVisible=true`; user can toggle.
- **Gauge row indicators**: ordered by `priority` ascending; additional indicators hidden overflow → scroll-x on mobile, wrap on desktop.
- **Sidebar** (right column): renders ANALYZE / SCAN / JUDGE tabs independently of indicator panes.

---

## D PEEK — Chart-Focus Mode Contract

```
┌──────────────────────────────────────────────────┐
│ TOP HEADER  [symbol] [tf] [OI] [Fund] [CVD] ...  │
├──────────────────────────────────────────────────┤
│                                                  │
│   MAIN CHART  (fills full height minus peek)     │
│                                                  │
│   [ sub-panes (OI / Fund / Liq) ]                │
│                                                  │
├─ resizer ────────────────────────────────────────┤  ← drag up
│  PEEK DRAWER                                     │
│  ┌──────────────────────┬───────────────────────┐│
│  │ GAUGE ROW (Arch A)   │ ANALYZE               ││  ← split 50/50
│  │ [OI][Fund][Vol][Skew]│ (hypothesis + plan)   ││
│  ├──────────────────────┴───────────────────────┤│
│  │ VENUE STRIP (Arch F) if visible              ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

### D PEEK rules

- Peek closed (`peekHeight ≈ 0`): only chart + sub-panes visible.
- Peek raised (`peekHeight > 20%`): GAUGE ROW + ANALYZE appear side-by-side in peek drawer.
- Regime banner: **not shown in D PEEK** — too dense. Only sub-pane OI/Fund/Liq live-lines visible.
- VENUE STRIP: shown in peek drawer if `peekHeight > 40%`.

---

## Mobile (375px) — unchanged from v1

- Regime: 1 badge (highest priority only).
- Gauge row: horizontal scroll (3 visible at once).
- Venue strips: stack below gauge.
- Liq heatmap: 140px fixed height.

---

## Default Layout Change

`tabState.layoutMode ?? 'C'` — changed from `'D'` to `'C'`.

**Why:** Layout C (C SIDEBAR) shows indicators + chart + analyze side-by-side on first load. Layout D (PEEK) hides indicators behind a drag gesture — not discoverable for new users. C SIDEBAR matches the indicator-visual-design contract where indicators are always visible context for the chart.

---

## Related

- `docs/product/indicator-visual-design.md` — archetype A-J component specs (authoritative)
- `work/active/W-0124-c-sidebar-default-indicator-layout.md` — implementation plan
- `app/src/lib/cogochi/modes/TradeMode.svelte` — layout implementation
- `app/src/lib/cogochi/shell.store.ts` — `layoutMode` persistence
