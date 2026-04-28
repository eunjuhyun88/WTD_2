---
name: 체크포인트 2026-04-22 (E)
description: W-0120~W-0126 전체 완료. main=0bc77e94. Capture chart UI(클릭+드로어+모바일) + Supabase mirror + LedgerStore O(1) + 타이밍 헤더 모두 머지.
type: project
---

main SHA: `0bc77e94` (2026-04-22)

## 완료

- **PR #167**: capture click handler (ChartBoard subscribeClick ±2bar) + CaptureReviewDrawer variant='sheet' (bottom sheet 72vh) + ChartMode mobile 연결
- **PR #173**: W-0126 SupabaseLedgerRecordStore (O(1) stats) + W-0121 capture_records Supabase mirror + W-0122 batch outcome fetch + W-0125 X-Process-Time header
- **Supabase**: capture_records 테이블 102 rows, migration 0013 실행 완료
- **Engine**: cogotchi-00181 100% traffic

## 미완료

- PR #172 머지 대기 (W-0123 indicator viz v2) — `gh auth login` 필요
- Supabase migration 018 실행 필요 (`pattern_ledger_records` 테이블)
- Tablet PeekDrawer CaptureReviewDrawer 연결 (CenterPanel.svelte, 768–1023px)
- W-0122 Confluence Phase 2 (engine-side scoring + flywheel weight learning)

**Why:** 멀티 세션에 걸친 W-0120~W-0126 완료 기록. 다음 세션 진입점은 PR #172 머지 + migration 018.
**How to apply:** 다음 세션에서 capture UI나 indicator stack 관련 작업 시 이 상태에서 시작.
