# W-0120 — Capture Chart Wire-up + Server Deploy

**Status:** READY TO IMPLEMENT
**Branch:** `claude/silly-gagarin` (PR #149 — merge pending)
**Priority:** P1

---

## Goal

ChartBoard에 캡처 어노테이션을 실제 렌더링하고, Supabase migration 실행 + 엔진 재배포로 end-to-end 동작 확인.

---

## Scope

### Slice 1 — ChartBoard wire-up (FE, ~1h)
1. `ChartBoard.svelte`에 `<CaptureAnnotationLayer>` 추가
   - `series={candleSeries}` (LWC candlestick series ref)
   - `symbol={activePair}` + `timeframe={activeTf}`
   - `onSelect={(ann) => selectedCapture = ann}`
2. `<CaptureReviewDrawer annotation={selectedCapture} onClose={...} onVerdict={...}` 추가
3. 클릭 이벤트: `series.subscribeClick(handler)` → capture_id 매핑
   - captured_at_s 기준 ±2bar 범위 내 가장 가까운 annotation 선택

### Slice 2 — Supabase migration 실행 (~10min)
```bash
# Supabase MCP로 실행
mcp apply_migration 0013_capture_records.sql
```
- RLS 확인: service_role = full access, anon = no access
- 인덱스 생성 확인

### Slice 3 — Engine 재배포 (~15min)
```bash
gcloud run deploy cogotchi \
  --project=notional-impact-463709-e3 \
  --region=us-east4 \
  --source=./engine
```
- `/jobs/status` 엔드포인트 검증
- `/captures/chart-annotations?symbol=BTCUSDT&timeframe=1h` 검증
- SCHEDULER_SECRET 유지 확인 (`--update-env-vars` 사용)

### Slice 4 — 클릭 이벤트 & 검증
- 브라우저에서 캡처 어노테이션 렌더링 확인
- CaptureReviewDrawer open/close 확인
- Verdict submit → `/api/engine/captures/{id}/verdict` → 상태 변경 확인

---

## Files to Touch

```
app/src/components/terminal/workspace/ChartBoard.svelte   (add ~20 lines)
engine/ (redeploy)
Supabase (run migration)
```

---

## Non-Goals
- 캡처 생성 UI (이미 SaveStrip에 구현됨)
- 패턴 상세 분석 화면 (별도 W-0121)
- 모바일 최적화 (W-0122)

---

## Exit Criteria
- [x] ChartBoard에 캡처 마커 visible (vertical + price lines)
- [x] EvalWindow shading 보임
- [x] 클릭 → CaptureReviewDrawer 열림 (subscribeClick + ±2bar threshold)
- [x] Verdict submit → 200 OK + drawer 닫힘
- [x] `/api/engine/jobs/status` → `redis_connected: true`
- [x] `/api/engine/captures/chart-annotations` → 200 OK (빈 배열도 ok)

## 추가 완료 (2026-04-22)
- [x] W-0121: Supabase fire-and-forget mirror (save + update_status)
- [x] W-0123: cogotchi-worker 삭제 완료
- [x] W-0124: chart click handler (ChartBoard.svelte subscribeClick)
- [x] Mobile: CaptureReviewDrawer bottom sheet variant + ChartMode wire-up
- [x] Desktop: chart padding-right 304px when drawer open

---

## 다음 우선순위 (W-0120 완료 후)

### W-0121 — Supabase capture_records sync (engine → Supabase)
**문제:** 엔진은 SQLite에만 저장. Supabase에는 mirror가 없어서 Verdict Inbox UI가 직접 SQLite에 못 접근.
**설계:**
- Option A: outcome_resolver 완료 시 Supabase upsert (권장)
  - `_capture_store.save()` 후 `sb.table("capture_records").upsert(record_dict).execute()`
  - 비동기 fire-and-forget (실패 시 log + continue)
- Option B: 별도 sync cron (복잡도 높음)
- **결정:** Option A — capture 저장 시점에 즉시 Supabase mirror

### W-0122 — Verdict Inbox UI refresh
- `VerdictInboxSection.svelte`가 현재 `/api/engine/captures/outcomes` 직접 호출
- Supabase mirror 완성 후 Supabase 쿼리로 전환 (더 빠름, 엔진 부하 줄임)
- 필터: symbol, pattern_slug, status, date range

### W-0123 — Cloud Run 최적화
**현재 문제:**
- cogotchi: min=1, max=3 (항상 1인스턴스 비용)
- cogotchi-worker: min=0이지만 실제로 하는 일 없음 (Cloud Scheduler가 대체)
**설계:**
- cogotchi-worker 삭제 (Cloud Scheduler가 직접 cogotchi API 호출하므로 불필요)
- cogotchi: min=0 고려 (cold start ~2s, Cloud Scheduler timeout=180s이므로 허용)
- 또는 min=1 유지 + CPU=1 → CPU=0.5 (비용 -50%)

### W-0124 — pattern_capture SQLite → Supabase 완전 이전
- 현재: 엔진 SQLite (ephemeral, Cloud Run restart 시 데이터 소실)
- 목표: Supabase가 primary store, SQLite를 write-through cache로만 사용
- 선행 조건: W-0121 완료

---

## CTO 우선순위 순서

```
W-0120 ChartBoard wire-up           → 즉시 (1-2h, PR #149 merge 후)
W-0121 Supabase capture sync        → 이후 (2h, 데이터 영속성 P0)
W-0123 Cloud Run 최적화             → 병렬 가능 (30min, 비용 절감)
W-0122 Verdict Inbox UI refresh     → W-0121 완료 후
W-0124 SQLite → Supabase 완전 이전  → W-0121 안정화 후
```
