# W-0305 — D2 NSM WVPL Instrumentation

> Wave: Wave4/D | Priority: P0 | Effort: M (3-4일)
> Charter: In-Scope L7 (Refinement) — feedback loop measurement
> Status: 🔵 Design Draft
> Created: 2026-04-29 by Agent A077

## Goal

Jin이 매주 자기 WVPL 점수를 보고 "이번주 3개 못 채웠다 → 더 capture/verdict 해야지"로 행동을 조정할 수 있게, NSM(Weekly Verified Pattern Loops per user) 계산·표시 인프라를 구축한다.

## Owner

engine + app

## Scope

### engine
- `engine/observability/wvpl.py` (신규 ~80줄)
  - `compute_wvpl_for_user(user_id, week_start) -> WVPLBreakdown`
  - 1 loop = 1 user × 1 pattern × {capture → search → verdict} sequence in week window
  - per-component: capture_count / search_count / verdict_count / completed_loop_count
- `engine/api/routes/metrics_user.py` (신규 ~40줄)
  - `GET /metrics/user/{user_id}/wvpl?weeks=4`
  - returns `[{week_start, loop_count, breakdown}, ...]`
- `engine/observability/wvpl_aggregator.py` (신규 ~50줄)
  - APScheduler job: 매 일요일 23:55 KST에 weekly aggregate `user_wvpl_weekly` 테이블 upsert
- `engine/tests/observability/test_wvpl.py` (신규 ≥6 tests)

### app
- `app/supabase/migrations/029_user_wvpl_weekly.sql` (신규)
  - `user_wvpl_weekly` 테이블: `(user_id, week_start, loop_count, capture_n, search_n, verdict_n)`
  - PRIMARY KEY (user_id, week_start)
- `app/src/lib/components/dashboard/WVPLCard.svelte` (신규 ~120줄)
  - 최근 4주 sparkline + M3 목표(≥3) 비교 + Kill threshold(<1.0) 경고
- `app/src/routes/api/dashboard/wvpl/+server.ts` (신규)
  - engine `GET /metrics/user/{id}/wvpl` 프록시

## Non-Goals

- 멀티 유저 leaderboard (D3 Persona Jin 단일 → 의미 없음)
- 실시간 streaming (배치 일요일 1회로 충분)
- 시각화 라이브러리 신규 도입 (svelte 기본 SVG sparkline)

## Exit Criteria (수치)

- [ ] `GET /metrics/user/{id}/wvpl?weeks=4` p95 < 200ms
- [ ] APScheduler job 1회 실행 < 5s (현재 active user 기준)
- [ ] `compute_wvpl_for_user` 단위테스트 ≥ 6 cases (0 loop / 1 loop / multi-pattern / 주말 경계 / 시점 경계 / null user)
- [ ] WVPLCard 렌더 < 100ms (mock data) — Vitest perf
- [ ] M3 목표값 3.0 vs 본인 WVPL 시각 비교 가능 (UX accept)
- [ ] migration 029 non-destructive (CREATE TABLE IF NOT EXISTS)

## AI Researcher 리스크

- **편향**: WVPL은 행동 선행지표지만 "loop 양 증가 = 품질 향상"은 가정. verdict 정확도(`pattern_verdict.label = valid 비율`)는 별도 지표 유지 필요
- **분포**: M1 평균 0~1 예상 → 표본 작아 분산 큼. Kill threshold(<1.0) 발동은 N≥30 user 후 적용 권장
- **데이터 무결성**: `pattern_capture` row 없는 verdict는 loop count에서 제외 (orphan verdict drift 방지)
- **시계열 정합**: week boundary는 KST 일요일 00:00로 고정 (사용자 timezone 무시 ← Jin 단일 페르소나니까 OK)

## CTO 설계 결정

- **성능**: weekly aggregate를 사전 계산해 read는 단순 `SELECT WHERE user_id AND week_start >= ?` (인덱스 (user_id, week_start) 단일)
- **안정성**: APScheduler job 실패 시 다음 주 catch-up 가능 — `(user_id, week_start)` upsert로 idempotent
- **보안**: `/metrics/user/{user_id}` JWT subject == user_id 검증 (다른 user 데이터 차단)
- **유지보수**: WVPL 계산 로직은 `engine/observability/wvpl.py` 1곳만 — Card UI도 prop only, 재사용 용이

## Facts (실측 grep)

```
$ grep -rn "WVPL" engine/ app/src/ --include="*.py" --include="*.ts"
(0 matches)

$ grep -rn "loop_count\|verdict_count" engine/ledger/
engine/ledger/store.py:233:    verdict_count = counts["verdict"]
engine/ledger/store.py:241:    verdict_count=verdict_count,
engine/ledger/store.py:246:    verdict_to_entry_rate=verdict_count / entry_count if entry_count > 0 else None,
engine/ledger/types.py:259:    verdict_count: int

$ ls app/supabase/migrations/ | tail -3
024_ledger_4table_split.sql
025_beta_allowlist.sql
026_beta_feedback.sql
(027/028 from F-12/F-13 in-flight; 다음 = 029)
```

→ WVPL 측정 인프라 **0% 구현**. ledger.store는 시스템 전체 verdict_count만 보유 (per-user/per-week 없음).

## Canonical Files

- `engine/observability/wvpl.py` (신규)
- `engine/observability/wvpl_aggregator.py` (신규)
- `engine/api/routes/metrics_user.py` (신규)
- `engine/tests/observability/test_wvpl.py` (신규)
- `app/supabase/migrations/029_user_wvpl_weekly.sql` (신규)
- `app/src/lib/components/dashboard/WVPLCard.svelte` (신규)
- `app/src/routes/api/dashboard/wvpl/+server.ts` (신규)

## Decisions

- [D-001] WVPL 계산 = 배치 (실시간 X) → 비용/복잡도 trade-off 최소
- [D-002] Week boundary = KST 일요일 00:00 → Jin 단일 페르소나, timezone 분기 회피
- [D-003] orphan verdict (capture 없음) 제외 → loop 정의의 무결성
- [D-004] M3 목표(≥3) + Kill(<1.0) UI 노출 → CTO 결정 가시화 (제품 자체가 자기 KPI 표시)

## Open Questions

- [ ] [Q-001] M1~M3 사용자 수가 적을 때 (N<10) WVPL 평균 표시 의미? → 본인 차주 비교가 본질, OK
- [ ] [Q-002] verdict label `near_miss/too_early/too_late`도 "verified"로 카운트? → label != null이면 모두 1 verdict로 카운트 (loop completion 기준)

## Implementation Plan

**Phase 1 — engine (1.5일)**
1. `engine/observability/wvpl.py` — compute_wvpl_for_user + WVPLBreakdown dataclass
2. `engine/tests/observability/test_wvpl.py` — 6 cases
3. `engine/api/routes/metrics_user.py` — GET endpoint + JWT subject 검증
4. `engine/observability/wvpl_aggregator.py` + APScheduler 등록

**Phase 2 — app (1.5일)**
5. migration 029 + non-destructive 검증
6. `+server.ts` proxy
7. `WVPLCard.svelte` — sparkline + 목표/Kill 라인
8. dashboard 페이지에 카드 삽입

**Phase 3 — 통합 검증 (0.5-1일)**
9. seed 데이터로 WVPL 계산 → UI 표시 골든패스
10. p95 측정 (Apache Bench 100 req)
11. CI green
