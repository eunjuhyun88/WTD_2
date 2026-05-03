# W-0401-p4 — Verdict Velocity Telemetry + F-60 Dashboard Panel

> Wave: 6 | Priority: P0 | Effort: S
> Charter: In-Scope (Terminal Hub UX + Layer C observability)
> Issue: #1004 (parent)
> Status: 🟡 Design Draft
> Created: 2026-05-04

## Goal
verdict_velocity_per_user 지표 도입으로 flywheel 효과를 실측하고, 베타 코호트 데이터 충분 후(14일, n≥20) Wilcoxon p<0.05 검증으로 P1/P2/P3 효과를 정량 확인한다.

## Owner
engine + app

## Scope

**포함:**
- `engine/observability/verdict_velocity.py` — 사용자별 rolling 7d verdict count snapshot 저장
- `app/supabase/migrations/057_verdict_velocity_snapshots.sql` — verdict_velocity_snapshots 테이블
- F-60 dashboard panel (`app/src/lib/hubs/terminal/pages/F60Page.svelte` 또는 `/observability`) — 코호트별 velocity 차트
- `engine/api/routes/observability.py` — `/observability/verdict-velocity` endpoint 추가

**파일:**
- `engine/observability/verdict_velocity.py` (신규)
- `engine/api/routes/observability.py` (수정)
- `app/supabase/migrations/057_verdict_velocity_snapshots.sql` (신규)
- `app/src/lib/hubs/terminal/pages/F60Page.svelte` (수정 — velocity panel 추가)

## Non-Goals
- A/B 실험 assignment (별도 infra 필요)
- Push notification
- LightGBM 재학습 트리거 변경 (W-0398 담당)

## Exit Criteria
- [ ] AC4: verdict_velocity_per_user 도입 후 ≥30% 증가, paired Wilcoxon p<0.05, Cohen's d≥0.5 (n≥20, 14일)
- [ ] AC10: F-60 dashboard verdict_velocity panel 노출
- [ ] migration 057 idempotent, CI green
- [ ] `/observability/verdict-velocity` 응답 p95 < 300ms

## Implementation Plan
1. migration 057: `verdict_velocity_snapshots(user_id, snapshot_date, count_7d)`
2. `verdict_velocity.py`: APScheduler 1일 1회 스냅샷 저장
3. `/observability/verdict-velocity` endpoint: 최근 30d snapshot 집계 반환
4. F60Page panel: line chart, before/after flywheel 비교

## Facts
- F-60 dashboard: `engine/research/validation/reporters.py:11` — promotion_level "f60_publishable"
- observability routers in `engine/api/main.py:339` — `observability.router` 이미 등록됨
- 기존 스냅샷 테이블 패턴: migrations/053_agent_equity_snapshots.sql 참고

## Canonical Files
- `engine/observability/verdict_velocity.py` (신규)
- `engine/api/routes/observability.py`
- `app/supabase/migrations/057_verdict_velocity_snapshots.sql`
- `app/src/lib/hubs/terminal/pages/F60Page.svelte`
