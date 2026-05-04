# W-0402 — Verdict 데이터 모델 재설계 (DB engineer)

> Wave: 6 | Priority: P0 | Effort: L (4 PR)
> Charter: In-Scope (Layer C 가속 + observability)
> Issue: #1045
> Status: 🟡 Design Draft
> Created: 2026-05-04
> Depends on: W-0401 (#1004, #1032)
> Blocks: W-0401-p4 (verdict_velocity telemetry — 동일 base table 의존)

## Goal

verdict 누적 → streak 집계 → digest 발송 → inbox dot count의 정확성·성능·멀티인스턴스 일관성을 DB 스키마 + 집계 티어 레벨에서 보장한다.

## Scope

**포함:**
- `pattern_ledger_records` 인덱싱 재설계
- `verdict_streak_history` view correctness fix (record_type 필터)
- 집계 캐싱 티어 도입 (MATERIALIZED VIEW)
- P2 inbox count 멀티인스턴스 일관성 (capture_outcomes_summary Supabase sync)
- HEAD/COUNT(*) 기반 cheap count endpoint
- pg_stat_statements 기반 telemetry

**Non-Goals:**
- AI 챠트/자동매매 신규 기능 (W-0403+)
- copy_trading 데이터 모델 (별도 work item)
- W-0401-p4 verdict_velocity 자체 (PR 4 telemetry 인프라만 공유)
- frontend 컴포넌트 변경 (count 필드 contract 유지: `{count:N, has_more:bool}`)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| streak 배지 부정확 → 사용자 신뢰 손상 | 현재 발생 중 | HIGH | PR 1 hot fix 즉시 |
| Cloud Run autoscale 시 inbox dot 무작위값 | 중 (1인스턴스 현재) | HIGH | PR 3 (autoscale 전 필수) |
| MATERIALIZED VIEW REFRESH lock | 낮 (CONCURRENTLY 사용) | MED | unique index 추가 + off-peak 새벽 3시 |
| D-1 base table 결정 전 PR 1 착수 | 낮 (Q-1 선행 해결) | HIGH | PR 1 시작 전 Step 0 verification 의무 |

### Dependencies
- W-0401-p4 unblock 조건: PR 1 머지 후 base table 확정
- 베타 런칭 게이트: PR 1+PR 2 필수, PR 3는 max-instances>1 활성화 시점

## AI Researcher 관점

- streak이 capture/score 카운트로 부풀려진 상태 → 모델 학습용 라벨 분포 왜곡 가능. PR 1 머지 후 1회 라벨 재추출 필요 (별도 task)
- digest latency 30s+ → APScheduler tick 누락 가능 → outcome_ready 알림 누락 → reinforcement signal loss
- MATERIALIZED VIEW 24h staleness는 day-grain streak 지표에서 허용 범위

## DB Engineer 관점

- `REFRESH MATERIALIZED VIEW CONCURRENTLY` 사용 위해 unique index 필수
- counter table 트리거 방식 거절: same user 동시 verdict insert race condition + 백필 정합성 검증 비용
- capture_records SQLite→Supabase 전체 이전 거절: effort XL + 본 work 스코프 폭주
- PR 1 인덱스 `CREATE INDEX CONCURRENTLY` 사용 → 테이블 lock 없이 온라인 빌드

## Decisions

| ID | 질문 | 결정 (잠정) | 거절 옵션 + 이유 |
|---|---|---|---|
| **D-1** | base table | **C (revised)**: `capture_records WHERE verdicted_at IS NOT NULL` — migration 057에서 `verdicted_at` 컬럼 추가 + 트리거 | A 거절: `pattern_ledger_records`에 verdict 0행 (실측 확인) — write 경로 미연결. B 거절: `verdicts` 테이블 미존재 (실측 확인) |
| **D-2** | 집계 캐싱 | **A**: MATERIALIZED VIEW + nightly REFRESH CONCURRENTLY | B 거절: counter table 트리거 race condition. C 거절: view 그대로는 AC1 p95<5s 미달성 |
| **D-3** | P2 멀티인스턴스 | **B**: SQLite 유지 + outcomes_summary만 Supabase 동기 | A 거절: 전체 마이그 effort XL. C 거절: Realtime은 서버사이드 불일치 직접 해결 못함 |
| **D-4** | count endpoint | **A**: Supabase `count: 'exact', head: true` | row 페치 후 len() 거절: AC4 p95<50ms 미달성 |

> D-1, D-3은 Q-1~Q-4 답변 후 변경 가능. 변경 시 §Decisions 갱신 + PR scope 재커밋 의무.

## Open Questions

| ID | 질문 | 답을 얻는 방법 | Blocker for |
|---|---|---|---|
| **Q-1** | migration 033 4-table split 실가동? `verdicts` 테이블 존재? | ✅ **확인**: `verdicts` 테이블 없음. `pattern_ledger_records`에 `verdict` record_type 0행 | D-1 → C로 결정 |
| **Q-2** | `pattern_ledger_records` row 수 + record_type별 분포? | ✅ **확인**: entry 1590 / outcome 2306 / score 1590 / phase_attempt 515. 총 6001행, verdict 0행 | D-1 확정 |
| **Q-2b** | `capture_records WHERE verdict_json IS NOT NULL` row 수? | ✅ **확인**: 131행 — 진짜 verdict 소스 | D-1 확정 |
| **Q-3** | local SQLite captures.db row 수 + outcome_ready 비율? | Cloud Run ssh 또는 dump endpoint | D-3 sync 부하 추정 |
| **Q-4** | Cloud Run 인스턴스 수 (current + autoscale max)? | `gcloud run services describe ... --max-instances` | D-3 우선순위 |
| **Q-5** | Supabase plan connection pool 한계? | Supabase dashboard → Settings → Database | D-3B sync 빈도 |

> Q-1~Q-5는 PR 1 착수 전 **Step 0** verification으로 해결. 미해결 상태 PR 1 착수 금지.

## PR 분해

> 각 PR 독립 배포 가능. shell → data → GTM 순서 고정.

### PR 1 — Schema correctness (Effort: S)

**목적**: `verdicted_at` 컬럼 추가 + view를 `capture_records` 기반으로 재정의 → streak이 실제 verdict 제출일 기준으로 계산
**검증 포인트**: verdict_json 있는 user는 streak ≥1, capture_records만 있는 user는 streak = 0

**신규:**
- `app/supabase/migrations/057_capture_records_verdicted_at.sql`
  ```sql
  -- verdicted_at: verdict 제출 시각 (captured_at_ms와 다름)
  ALTER TABLE capture_records
    ADD COLUMN IF NOT EXISTS verdicted_at TIMESTAMPTZ;

  CREATE OR REPLACE FUNCTION set_verdicted_at()
  RETURNS TRIGGER AS $$
  BEGIN
    IF OLD.verdict_json IS NULL AND NEW.verdict_json IS NOT NULL THEN
      NEW.verdicted_at = now();
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_capture_records_verdicted_at
    BEFORE UPDATE ON capture_records
    FOR EACH ROW EXECUTE FUNCTION set_verdicted_at();

  -- 기존 131행 백필 (정확한 시각 불명 → NOW() 처리)
  UPDATE capture_records
    SET verdicted_at = NOW()
    WHERE verdict_json IS NOT NULL AND verdicted_at IS NULL;

  CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_capture_records_user_verdicted
    ON capture_records (user_id, verdicted_at DESC)
    WHERE verdicted_at IS NOT NULL;
  ```
- `app/supabase/migrations/058_verdict_streak_history_fix.sql`
  ```sql
  DROP VIEW IF EXISTS verdict_streak_history;
  CREATE VIEW verdict_streak_history AS
  SELECT
    user_id,
    DATE(verdicted_at AT TIME ZONE 'UTC') AS day,
    COUNT(*) AS verdict_count
  FROM capture_records
  WHERE user_id IS NOT NULL AND verdicted_at IS NOT NULL
  GROUP BY user_id, DATE(verdicted_at AT TIME ZONE 'UTC');
  GRANT SELECT ON verdict_streak_history TO service_role;
  ```
- `engine/tests/test_migration_058_streak_correctness.py` — capture만 있는 user → streak 0

**⚠️ 백필 주의**: 기존 131행은 정확한 verdict 제출 시각 불명. NOW() 백필 시 streak 1일 발생.
허용 여부 사용자 확인 필요 (대안: verdicted_at NULL 유지 → 신규 verdict부터만 추적).

**Exit Criteria:**
- [ ] AC1-1: verdict_json 있는 user → streak ≥1, capture만 있는 user → streak 0 (pytest)
- [ ] AC1-2: EXPLAIN ANALYZE `WHERE user_id=? AND verdicted_at IS NOT NULL` → Index Scan
- [ ] AC1-3: CI green

### PR 2 — Aggregation tier (Effort: M)

**목적**: digest latency p95 < 5s 달성 (MATERIALIZED VIEW 도입)
**검증 포인트**: digest 1회 실행 latency baseline vs after 비교

**신규:**
- `app/supabase/migrations/059_verdict_streak_matview.sql` — view → MATERIALIZED VIEW + unique index `(user_id, day)` (base: capture_records)
- `engine/jobs/refresh_streak_matview.py` — APScheduler nightly 03:00 UTC `REFRESH MATERIALIZED VIEW CONCURRENTLY verdict_streak_history`
- `engine/tests/test_refresh_streak_matview.py`

**Exit Criteria:**
- [ ] AC2-1: digest 1회 latency p95 < 5s @ 100 user fixture
- [ ] AC2-2: REFRESH job p95 < 30s
- [ ] AC2-3: CI green

### PR 3 — Multi-instance consistency (Effort: M)

**목적**: autoscale 시에도 inbox dot count 일관성 보장
**조건**: Q-4 Cloud Run max-instances 확인 후 착수 (1인스턴스 확정이면 deferred)
**검증 포인트**: 3 인스턴스 동시 호출 시 count 차이 0

**신규:**
- `app/supabase/migrations/060_capture_outcomes_summary.sql`
  ```sql
  CREATE TABLE capture_outcomes_summary (
    user_id    uuid PRIMARY KEY,
    unread_count int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ```
- `engine/capture/store.py` (수정) — outcome insert/update 시 Supabase upsert hook
- `app/src/routes/api/captures/outcomes/+server.ts` (수정) — count 조회 Supabase 전환 (`count: 'exact', head: true`)

**Exit Criteria:**
- [ ] AC3-1: 3 인스턴스 동시 같은 user count → 차이 0
- [ ] AC3-2: outcome insert → 1s 이내 다른 인스턴스 반영
- [ ] AC3-3: Supabase upsert 실패 시 SQLite write 성공 + retry queue
- [ ] CI green

### PR 4 — Telemetry + verification (Effort: S)

**목적**: 1주 실측으로 Wave-level AC 수치 확정
**검증 포인트**: pg_stat_statements 기준 full table scan 0회/일

**신규:**
- `app/supabase/migrations/061_pg_stat_statements_enable.sql` — `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`
- `engine/api/admin/db_stats.py` — `/api/admin/db-stats` 상위 N쿼리 latency
- `engine/jobs/db_health_check.py` — 1일 1회 full table scan count → log
- `docs/runbooks/verdict-data-model.md` — REFRESH 실패 대응 + 인덱스 재빌드 절차

**Exit Criteria:**
- [ ] AC4-1: pg_stat_statements 활성 + admin endpoint 200 OK
- [ ] AC4-2: 1주 실측 Seq Scan 0회/일
- [ ] AC4-3: REFRESH job 7일 실패율 < 1%
- [ ] AC4-4: inbox count p95 < 50ms (7일 평균)
- [ ] CI green

## 전체 Exit Criteria (Wave-level)

- [ ] AC1: digest run latency p95 < 5s @ 100 users (PR 2)
- [ ] AC2: `(user_id, record_type)` 인덱스 EXPLAIN ANALYZE Index Scan 확인 (PR 1)
- [ ] AC3: streak 정확도 100% — record_type='verdict'만 카운트 (PR 1)
- [ ] AC4: inbox count endpoint p95 < 50ms (PR 3+4)
- [ ] AC5: 멀티인스턴스 inbox dot count 일관성 차이 0 (PR 3)
- [ ] AC6: REFRESH job 실패율 < 1% over 7d (PR 4)
- [ ] AC7: `pattern_ledger_records` full table scan 0회/일 (PR 4)

## Canonical Files

- `app/supabase/migrations/057_pattern_ledger_user_idx.sql`
- `app/supabase/migrations/058_verdict_streak_history_fix.sql`
- `app/supabase/migrations/059_verdict_streak_matview.sql`
- `app/supabase/migrations/060_capture_outcomes_summary.sql`
- `app/supabase/migrations/061_pg_stat_statements_enable.sql`
- `engine/jobs/refresh_streak_matview.py`
- `engine/jobs/db_health_check.py`
- `engine/api/admin/db_stats.py`
- `engine/capture/store.py`
- `app/src/routes/api/captures/outcomes/+server.ts`
- `docs/runbooks/verdict-data-model.md`
