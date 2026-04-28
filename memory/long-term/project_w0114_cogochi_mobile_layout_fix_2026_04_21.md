---
name: W-0114 Cogochi 모바일 레이아웃 버그 분석 (2026-04-21)
description: Cogochi 모바일 셸 1차 구현 완료 후 CTO 버그 분석 + 7개 수정 설계 저장
type: project
---

모바일 셸 1차 구현 commit `954935e` 완료. DOM 측정 결과 구조는 정상이나 7개 UX 버그 발견.
설계 문서: `work/active/W-0114-cogochi-mobile-layout-fix.md` (commit `e46fdd1`)
브랜치: `rebase-113` (이전 컨텍스트에서는 `claude/w-0114-mobile-state-persistence`)

**Why:** 모바일에서 ANL 탭 데이터 미표시, TF/Symbol 변경 불작동, ChartBoard 툴바 98px 낭비.

**How to apply:** 다음 세션에서 Fix1-7 순서로 구현. P0 먼저 (Fix1-4), 그 후 P1 (Fix5-7).

## 미구현 수정 목록

### P0 — 기능 불가

| Fix | 파일 | 내용 |
|-----|------|------|
| Fix1 | TradeMode.svelte | `:global(.mobile-chart-section .chart-toolbar) { display: none }` + `.chart-header--tv` |
| Fix2 | TradeMode.svelte | `{#if analyzeData}` 가드 제거 → `evidenceItems`/`proposal` 직접 렌더링 |
| Fix3 | AppShell.svelte | `let mobileTF = $state('4h')` + MobileTopBar `onTFChange` 연결 |
| Fix4 | AppShell.svelte | `let mobileSymbol = $state('BTCUSDT')` + Symbol 상태 관리 |

### P1 — UX 결함

| Fix | 파일 | 내용 |
|-----|------|------|
| Fix5 | AppShell.svelte | `.app-shell { padding-bottom: env(safe-area-inset-bottom, 0px) }` |
| Fix6 | AppShell.svelte | `.mobile-ai-sheet` 헤더에 `[X]` 버튼 추가 |
| Fix7 | AppShell.svelte | TABLET `$effect`에 `layoutMode: 'D'` 강제 추가 |

## 레이아웃 측정값 (375×812 기준)

```
MobileTopBar    44px
ChartSection   348px (toolbar 45px + header 53px + canvas 249px)
TabStrip        28px
Panel          368px
MobileFooter    24px
합계:          812px ✓
```

차트 캔버스가 249px뿐 → Fix1 적용 시 347px (+39%)
