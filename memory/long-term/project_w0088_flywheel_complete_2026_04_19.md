---
name: W-0088 flywheel closure — all 4 axes complete (2026-04-19)
description: W-0088 엔진 사이드 완전 완료. 4축 + observability + CTO 리팩토링. 797 tests. 다음: Verdict Inbox UI(W-0097) + 창업자 시딩.
type: project
originSessionId: a7d7611b-82ac-4b43-8c49-2b074180b6c2
---
**Fact:** 2026-04-19, main `a97d019`. W-0088 flywheel 엔진 사이드 전체 완료.

**4축 상태:**
- Axis 1 Capture: `POST /captures` + `POST /captures/bulk_import` — `engine/api/routes/captures.py`
- Axis 2 Outcome: `outcome_resolver_job` Job 3b (hourly) — `engine/scanner/jobs/outcome_resolver.py`
- Axis 3 Verdict: `POST /captures/{id}/verdict` — captures.py, body: `{user_verdict: "valid"|"invalid"|"missed"}`
- Axis 4 Refinement: `refinement_trigger_job` Job 3c (daily) — `engine/scanner/jobs/refinement_trigger.py`
- Observability: `GET /observability/flywheel/health` — 6 KPIs — `engine/api/routes/observability.py`

**CTO 리팩토링 내용:**
- `ledger/store.py`: HIT/MISS 중복 상수 제거 → `outcome_policy.decide_outcome()` 위임
- `capture/store.py`: `count_by_status() -> dict[str, int]` 추가 (단일 GROUP BY SQL)
- `observability.py`: 3× `list(limit=10000)` → `count_by_status()`, dead code 제거
- `refinement_trigger.py`: `training_runs[0]` → `most_recent_run` 명시적 네이밍

**Refinement gate 기본값:**
- `REFINEMENT_MIN_VERDICTS=10` (env override 가능)
- `REFINEMENT_MIN_DAYS=7.0` (env override 가능)
- 마지막 `training_run` 이전 verdict는 카운트에서 제외

**Why:** 설계 순서(A→B→C→D→E)와 달리 E를 먼저 실행. 이유: 트래픽 0인 상태에서 C(verdict inbox UI)보다 데이터 주입 채널(bulk_import)과 계기판(health endpoint)이 선행 필수. 데이터 없으면 inbox는 빈 화면.

**How to apply:**
- 다음 세션: Verdict Inbox UI(`W-0097`) — app `/dashboard` 페이지, `GET /captures?status=outcome_ready` + `POST /captures/{id}/verdict` 연결
- 창업자 시딩: `POST /captures/bulk_import`으로 20-50개 역사적 셋업 주입 후 `GET /observability/flywheel/health`로 KPI 확인
- `captures_to_outcome_rate` < 0.5이면 resolver 버그 의심 → 먼저 수정
