---
name: W-0123 완료 체크포인트 (2026-04-22)
description: W-0123 Indicator Visualization System v2 — 3 슬라이스 전체 완료. PR #172 오픈. 10 archetype, AI search, TV 토글 UX.
type: project
---

W-0123 3개 슬라이스 전체 ship됨. PR #172 (eunjuhyun88/WTD_2#172) 오픈.

**Why:** W-0122 Phase 3 로 indicator 시스템 기초 완성 후, 트레이더 UX gap 3개 메움: AI 검색 부재, 토글/설정 부재, 시각 아키타입 부족.

**How to apply:** W-0123 코드를 기준으로 indicator 관련 작업 시 참고.

## Slice α — AI 검색
- `app/src/lib/indicators/search.ts` (NEW): 7단계 퍼지 매칭 (id→label→synonym→example→description→fuzzy), 한국어+영어
- `AIPanel.svelte`: send() 에서 indicator intent 먼저 감지 → `cogochi:cmd { id: 'focus_indicator' }` dispatch
- `TradeMode.svelte`: `[data-indicator-id]` 쿼리 → scrollIntoView + `.highlight` pulse
- `IndicatorPane.svelte`: `data-indicator-id` 속성 + amber pulse CSS

## Slice β — TV급 토글 UX
- `shell.store.ts`: ShellState v5→v6, `visibleIndicators[]`, `archetypePrefs{}`, `indicatorSettings{}` 추가. migration fn.
- `IndicatorSettingsSheet.svelte` (NEW): TV 스타일 modal — family별 그룹, 토글, archetype 선택
- `CommandBar.svelte`: ⚙ INDICATORS 버튼
- `CommandPalette.svelte`: registry에서 24개 toggle_indicator:* intent 자동생성
- `TradeMode.svelte`: hardcoded gaugePaneIds → $derived($shellStore.visibleIndicators); dead OI/Fund/CVD 버튼 → chartIndicators store 연결

## Slice γ — 4개 신규 아키타입
- `IndicatorCurve.svelte` (G): tenor curve (Laevitas style)
- `IndicatorSankey.svelte` (H): flow net-arrow (Arkham style)
- `IndicatorHistogram.svelte` (I): distribution bars (Coinglass style)
- `IndicatorTimeline.svelte` (J): event timeline (Arkham feed style)
- `IndicatorRenderer.svelte`: archetypePrefs 읽어 G/H/I/J 라우팅
- `adapter.ts`: funding_term_structure(G), exchange_netflow stub(H), liq_by_level histogram(I), whale_transfers empty(J)
- `registry.ts`: exchange_netflow archetype A→H; funding_term_structure/liq_by_level/whale_transfers 신규 등록

## 다음: W-0124
C SIDEBAR 기본값 + indicator layout alignment. `work/active/W-0124-c-sidebar-default-indicator-layout.md` 참조.
- Default layoutMode `'D'` → `'C'`
- C SIDEBAR: Regime + Gauge always visible (setup 전에도)
- D PEEK: peek 올리면 gauge + ANALYZE 나란히
