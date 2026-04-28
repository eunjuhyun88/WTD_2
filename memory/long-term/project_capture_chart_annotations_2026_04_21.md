---
name: project_capture_chart_annotations_2026_04_21
description: W-0120~W-0124 전체 완료 (2026-04-22): capture 클릭 핸들러 + 반응형 drawer + Supabase mirror + engine 00181 live
type: project
---

## 전체 완료 상태 (2026-04-22)

**Why:** 패턴 캡처를 TradingView 스타일 차트에 오버레이하고 사용자가 결과를 verdict할 수 있는 flywheel axis 3 UI 완성.

**How to apply:** 다음 단계는 W-0122 (Verdict Inbox Supabase 쿼리 전환), Tablet PeekDrawer integration.

## Engine — cogotchi-00181 (100% traffic, us-east4)

- `captures.py`: `/chart-annotations` before `/{capture_id}` route fix
- `capture/store.py`: W-0121 — `_supabase_upsert_bg` fire-and-forget mirror (save + update_status)
- `capture/types.py`: `to_supabase_dict()` method
- `/jobs/status`: redis_connected=true, auto_capture/pattern_scan/outcome_resolver last_result=ok
- `/captures/chart-annotations?symbol=BTCUSDT&timeframe=1h` → 200 OK

## Supabase — capture_records 테이블

- 102 rows seeded (2026-04-21), mirror 확인됨
- project_id: hbcgipcqpuintokoooyg
- DB pooler: aws-1-ap-northeast-1.pooler.supabase.com:5432

## Frontend — PR #167 (claude/silly-gagarin → main)

- `CaptureReviewDrawer.svelte`: variant='drawer'|'sheet' prop + bottom sheet CSS (72vh, fly y:600, drag handle)
- `ChartBoard.svelte`: `subscribeClick` → nearest annotation ±2bar → `selectedCapture`; `.drawer-open { padding-right: 304px }`
- `CaptureAnnotationLayer.svelte`: `onAnnotationsChange` prop for click handler cache
- `ChartMode.svelte`: mobile CaptureAnnotationLayer + CaptureReviewDrawer variant="sheet" via `onChartReady`+`getMainSeries()`

## 남은 작업

- W-0122: VerdictInboxSection Supabase 쿼리 전환 (현재 엔진 직접 호출)
- Tablet: CenterPanel PeekDrawer review 슬롯에 CaptureReviewDrawer 연결 (768–1023px)
