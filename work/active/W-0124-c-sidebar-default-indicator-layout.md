# W-0124 — C SIDEBAR as Default + Indicator Layout Alignment

## Status

`DESIGN` — 2026-04-22

## Goal

`docs/product/indicator-visual-design-v2.md` 의 Panel 11 (C SIDEBAR 기준 목업) 을 TradeMode 에 구현한다.

1. **Layout C를 기본값으로** (현재 `'D'` → `'C'`)
2. **Regime banner + Gauge row가 C SIDEBAR 에서 항상 보임** (토글 불가)
3. **Venue strip / Liq heatmap 은 토글** (기본 on)
4. **D PEEK 에서 GAUGE ROW + ANALYZE 함께 표시**

## Owner

app (TradeMode.svelte + shell.store.ts)

## Why

- W-0123 에서 10-archetype 시스템 + ⚙ INDICATORS 토글 완성됨.
- 근데 Layout D (PEEK) 가 기본값이라 indicators 가 peek 드래그 전엔 안 보임 → 발견성 0.
- Layout C (C SIDEBAR) 가 차트 + 인디케이터 + 분석을 동시에 보여주는 더 나은 기본값.
- `indicator-visual-design-v2.md` Part 11 에 C SIDEBAR 2-column mockup 확정.

## Scope

### Change 1 — Default layout C

```typescript
// app/src/lib/cogochi/modes/TradeMode.svelte
// Before:
const layoutMode = $derived(tabState.layoutMode ?? 'D');
// After:
const layoutMode = $derived(tabState.layoutMode ?? 'C');
```

```typescript
// app/src/lib/cogochi/shell.store.ts
// FRESH_TAB_STATE() layoutMode default: 'D' → 'C'
```

### Change 2 — C SIDEBAR: Regime + Gauge always shown

In Layout C template, move `gaugePaneIds` + `IndicatorPane` OUT of the `{#if analyzed}` gate.
- Regime indicators (archetype E) rendered unconditionally via `IndicatorPane`
- Gauge row rendered unconditionally
- Add a thin `div.always-indicators` wrapper above the sidebar analyze panel

Before (Layout C, guarded):
```svelte
{#if analyzed}
  <IndicatorPane ids={gaugePaneIds} ... />
{/if}
```
After:
```svelte
<!-- Regime + Gauge always visible in C SIDEBAR -->
{#if gaugePaneIds.length}
  <IndicatorPane ids={gaugePaneIds} values={indicatorValues} layout="row" />
{/if}
```

### Change 3 — C SIDEBAR: Venue + Liq toggleable

Venue strip + liq heatmap already controlled by `venuePaneIds` from `shellStore.visibleIndicators`.
Default values in registry: `defaultVisible: true` — no code change needed for defaults.
Add CSS `collapsible` animation for toggle transitions.

### Change 4 — D PEEK: Gauge + ANALYZE together

When `peekOpen && layoutMode === 'D'`, render indicator gauges and ANALYZE tab side-by-side in the peek drawer.

```svelte
<!-- In Layout D peek drawer (currently only shows ANALYZE) -->
{#if peekOpen && gaugePaneIds.length}
  <div class="peek-indicator-col">
    <IndicatorPane ids={gaugePaneIds} values={indicatorValues} layout="col" />
  </div>
{/if}
<div class="peek-analyze-col">
  <!-- existing ANALYZE content -->
</div>
```

Use CSS grid: `grid-template-columns: 1fr 1fr` at `peekHeight > 30`.

## Non-Goals

- Drag-to-reorder panes (W-0125 backlog)
- Real data for G/H/I/J archetypes (W-0122 Phase 4)
- Copy trading features (separate W item from PRD)

## Exit Criteria

- [ ] `/cogochi` 첫 로드 → Layout C (C SIDEBAR) 렌더
- [ ] C SIDEBAR: Regime badge + Gauge row 가 setup 입력 전에도 보임
- [ ] C SIDEBAR: OI/Fund/CVD 토글 버튼 → gauge 제거/복원 즉시
- [ ] D PEEK: peek 올리면 (>30%) gauge row + ANALYZE 나란히 표시
- [ ] `localStorage.getItem('cogochi_shell_v6')` → `layoutMode: 'C'` (신규 사용자)
- [ ] 기존 사용자 (v5 → v6 migration): 저장된 layoutMode 유지됨

## Files to Edit

| File | Change |
|------|--------|
| `app/src/lib/cogochi/modes/TradeMode.svelte` | Default C; Regime+Gauge unconditional in C; D PEEK split layout |
| `app/src/lib/cogochi/shell.store.ts` | FRESH_TAB_STATE layoutMode `'D'` → `'C'` |

## Estimated Scope

~2-3h. Single axis: layout wiring. No new components, no new API.
