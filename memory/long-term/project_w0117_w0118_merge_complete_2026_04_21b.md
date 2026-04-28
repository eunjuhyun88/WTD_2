---
name: W-0117/W-0118 mobile-fix merge complete
description: claude/w-0117-mobile-fix → main 머지 완료 (8f5871be, 2026-04-21 오후). 모든 모바일 UX + WS + a11y + geometry fix 포함.
type: project
---

W-0117/W-0118 branch `claude/w-0117-mobile-fix` (5196c198) → `main` 머지 완료 (8f5871be, pushed).

**Why:** 모바일 UX 통합(4-tab, ModeSheet, nav 통합) + WS 실시간 캔들 + a11y + geometry fix를 main에 반영하기 위해. 이전 머지 시도는 AppShell/TradeMode 충돌로 abort됨. 최종 전략: w-0117-mobile-fix base + WS/a11y 추가 커밋(bc58179b) → conflicts 수동 해결(AppShell: 두 버전 취합, TradeMode: --theirs).

**포함된 변경사항:**
- Nav 통합: 전체 `/terminal` → `/cogochi`
- MobileBottomNav 전역화 (isTerminal gate 제거 → /cogochi 포함)
- Cogochi MobileFooter 제거 → global nav + padding-bottom 보상
- 4-tab mobile strip: 01 CHART | 02 ANL | 03 SCAN | 04 JUDGE
- SymbolPickerSheet, ModeSheet, chartLoading 스피너, AI-CTA proposal
- Lab/Market PageCover overlay (준비 중입니다.)
- Binance WS kline stream 실시간 (candle close → refetch)
- WCAG 2.1 AA: role=tablist/tab, aria-selected, aria-controls
- responseMapper 숏 geometry fix (Chandelier Exit stop_long 이슈)
- passport, settings: prerender=false (auth redirect 충돌 방지)

**검증:** preview 375px mobile → MobileTopBar + 4-tab + global nav + chartLoading 스피너 확인. 에러 없음.

**How to apply:** 다음 UX 작업 시 /cogochi는 mobile-first 4-tab shell 기준으로 개발.
