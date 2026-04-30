---
id: W-0368
title: "Pattern Alpha Hardening — Phase 2: DLQ + 배치 + 회로차단 + 품질 보장"
status: design
wave: 5
priority: P1
effort: M
owner: engine
issue: "#816"
created: 2026-05-01
---

# W-0368 — Pattern Alpha Hardening (Phase 2)

> Wave: 5 | Priority: P1 | Effort: M
> Charter: In-Scope — Research Engine, Pattern Quality
> Status: 🟡 Design Draft
> Created: 2026-05-01
> Depends on: W-0367 (Phase 1) PR merged

## Goal

W-0367에서 구축한 시그널 저장·추적 파이프라인을 프로덕션 내구성 수준으로 강화한다 — 실패 시 유실 없이 재시도하고, Supabase 과부하 없이 배치 처리하며, 통계 품질 저하를 자동 감지한다.

## Scope

### 포함

**Phase 2-A — 내구성 (DLQ + Retry FSM)**
- **Migration 038**: `scan_signal_events_dlq` 테이블 + `scan_signal_events.retry_count` / `error_msg` 컬럼 추가
- **`signal_event_store.py` 확장**: `insert_signal_event_dlq()`, `replay_dlq_batch()`, `get_retry_backoff(attempt)` → 1m/5m/15m 지수 백오프
- **Retry FSM**: attempt 0→1→2→DLQ (3회 실패 시 DLQ 이관, circuit breaker 차단 중에는 즉시 DLQ)
- **`dlq_replay.py`**: CLI 툴 — `uv run python -m research.dlq_replay --limit 200`

**Phase 2-B — 성능 (Batch UPSERT + p95 SLO)**
- `signal_event_store.py` 배치 모드: 큐 버퍼 100개 → 단일 `INSERT … VALUES (…), (…)` 트랜잭션
- APScheduler flush job: 1분 주기 (스캐너 2분 주기보다 짧게)
- `GET /research/alpha-quality` p95 < 500ms (30d 데이터 기준)
- Circuit breaker: 5분 내 10회 Supabase 실패 → 1h 차단 → 이후 자동 복구

**Phase 2-C — 품질 감시 (Decay Alert)**
- `alpha_quality.detect_decay(pattern_slug, window_days=7)` → 7일 rolling vs 30일 baseline, 2σ 이탈 시 Sentry alert
- 기준 문서화: 7일/30일 baseline profit_take 비율 측정 후 `docs/data/alpha_baselines.md` 저장 (데이터 축적 후 실행)

**테스트**
- `engine/tests/research/test_signal_events_hardening.py` (9 tests): retry FSM 3-step, DLQ 이관, batch flush, circuit breaker on/off
- `engine/tests/research/test_lookahead_safety.py` (3 tests): property-based 1,000 samples, `outcome_at > fired_at` 항상 참
- `engine/tests/research/test_flag_parity.py` (2 tests): `ENABLE_SIGNAL_EVENTS=false` 시 DB write 0, `=true` 시 ≥1

### 파일
| 파일 | 변경 |
|---|---|
| `engine/research/signal_event_store.py` | DLQ, batch, circuit breaker 추가 |
| `engine/research/alpha_quality.py` | `detect_decay()` 추가 |
| `engine/research/dlq_replay.py` | 신규 CLI |
| `engine/tests/research/test_signal_events_hardening.py` | 신규 (9 tests) |
| `engine/tests/research/test_lookahead_safety.py` | 신규 (3 tests) |
| `engine/tests/research/test_flag_parity.py` | 신규 (2 tests) |
| `app/supabase/migrations/038_signal_events_dlq.sql` | 신규 |
| `docs/data/alpha_baselines.md` | Phase 2-C 데이터 축적 후 |

### API
- 기존 W-0367 엔드포인트에 decay 필드 추가: `GET /research/alpha-quality` 응답에 `decay_alert: bool` 포함

## Non-Goals

- UI 시각화 — W-0369 (Alpha Terminal)
- W-0282 paper executor 실행 — read-only 관측 범위 유지
- GCS 백업 — W-0361 별도
- 신규 통계 방법론 — 기존 Welch/BH-FDR/Spearman 재사용

## Migration 038 구조

```sql
-- scan_signal_events_dlq: 3회 실패한 시그널 보관
CREATE TABLE IF NOT EXISTS scan_signal_events_dlq (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_data  JSONB NOT NULL,
  error_msg      TEXT,
  attempt_count  INTEGER NOT NULL DEFAULT 3,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  replayed_at    TIMESTAMPTZ
);

-- scan_signal_events에 retry 추적 컬럼 추가
ALTER TABLE scan_signal_events
  ADD COLUMN IF NOT EXISTS retry_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error   TEXT;
```

## Retry FSM

```
insert_signal_event() 실패
  → attempt 1: wait 1m, retry
  → attempt 2: wait 5m, retry
  → attempt 3: wait 15m, retry
  → DLQ 이관 (insert_signal_event_dlq)

Circuit Breaker:
  - 5분 내 10회 Supabase 실패 → OPEN (1h)
  - OPEN 중 insert 요청 → 즉시 DLQ (wait 없음)
  - 1h 후 HALF-OPEN → 1회 probe → 성공 시 CLOSED
```

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| DLQ 무한 성장 | 저 | 중 | `replayed_at IS NOT NULL` 레코드 30일 후 purge |
| Batch flush 타이밍 누락 | 저 | 중 | APScheduler flush job 1분 주기 + crash-safe |
| Circuit breaker false positive | 저 | 중 | threshold 10/5min (트래픽 최대치보다 여유 있음) |
| decay_alert 기준 불안정 | 중 | 저 | 30d 데이터 이전엔 detect_decay 비활성 |
| property test slowness | 저 | 저 | 1,000 samples, hypothesis max_examples 설정 |

### Dependencies
- W-0367 PR #813 merged (scan_signal_events 테이블 존재)
- `hypothesis` (property-based testing) — 기존 engine 의존성 확인 필요
- Sentry DSN — 기존 W-0249 통합 재사용

### Rollback
- Migration 038 DROP: `DROP TABLE scan_signal_events_dlq; ALTER TABLE scan_signal_events DROP COLUMN retry_count, DROP COLUMN last_error;`
- Circuit breaker: `SIGNAL_EVENTS_CIRCUIT_BREAKER=false` env flag로 비활성화
- DLQ replay 실패 시: manual SQL로 `SELECT * FROM scan_signal_events_dlq WHERE replayed_at IS NULL`

### Files Touched (예상)
```
engine/research/signal_event_store.py      — DLQ/batch/circuit breaker (약 +120 LOC)
engine/research/alpha_quality.py           — detect_decay() (약 +40 LOC)
engine/research/dlq_replay.py              — 신규 CLI (약 +80 LOC)
engine/tests/research/test_signal_events_hardening.py — 신규 9 tests
engine/tests/research/test_lookahead_safety.py        — 신규 3 tests
engine/tests/research/test_flag_parity.py             — 신규 2 tests
app/supabase/migrations/038_signal_events_dlq.sql     — 신규
```

## AI Researcher 관점

### Lookahead-Free 보장

`outcome_at = fired_at + horizon_h * 3600s` — 항상 미래 시점만 참조.
Property-based test: hypothesis로 `fired_at` 랜덤 생성 → `outcome_at > fired_at` 1,000회 검증.

### Flag Parity

두 env flag(`ENABLE_SIGNAL_EVENTS`, `ENGINE_ENABLE_SCHEDULER`) 조합이 코드와 테스트에서 일치하는지 자동 검증. 실제 DB write count로 검증 (mock 금지).

### Decay Detection 설계

```python
def detect_decay(pattern_slug: str, window_days: int = 7) -> dict:
    baseline = fetch_resolved_outcomes(pattern_slug, lookback_days=30)
    recent   = fetch_resolved_outcomes(pattern_slug, lookback_days=window_days)
    baseline_rate = profit_take_rate(baseline)
    recent_rate   = profit_take_rate(recent)
    z = (recent_rate - baseline_rate) / bootstrap_std(baseline)
    return {"z_score": z, "alert": abs(z) > 2.0, "baseline_rate": baseline_rate, "recent_rate": recent_rate}
```

**Phase 2-C 실행 조건**: pattern당 signal ≥ 20개 이상 (W-0367 AC8 달성 후)

### Failure Modes

| 시나리오 | 지표 | 대응 |
|---|---|---|
| DLQ 누적 > 100/h | Supabase 장애 또는 schema drift | circuit breaker + Sentry alert |
| lookahead test 실패 | `outcome_at ≤ fired_at` 발생 | 즉시 PR block — 데이터 오염 |
| flag parity 실패 | `ENABLE_SIGNAL_EVENTS=false` 에도 write 발생 | 즉시 PR block |

## Decisions

- **[D-0368-A]** Retry 횟수: 3회 (1m/5m/15m) → DLQ — 이유: 네트워크 일시장애 대응에 충분, 4회 이상은 과잉
  - 거절 옵션: 즉시 포기 — 시그널 유실 위험
- **[D-0368-B]** Circuit breaker threshold: 10회/5분 — 이유: 스캐너 2분 주기 × 5 = 정상 최대 2.5회/분, 4배 여유
  - 거절 옵션: 5회/1분 — false positive 높음
- **[D-0368-C]** DLQ replay: CLI 전용 (API 미노출) — 이유: 운영자 수동 확인 후 replay가 안전, 자동 API replay는 데이터 오염 위험
  - 거절 옵션: APScheduler 자동 replay — circuit breaker 복구 후 폭주 위험
- **[D-0368-D]** Batch flush 주기: 1분 — 이유: 스캐너 2분 주기 대비 충분히 짧음, 과도한 flush 없음
  - 거절 옵션: 30초 — APScheduler job 과부하

## Open Questions

- [ ] [Q-0368-A] `hypothesis` 패키지 기존 `engine/` 의존성에 있는가? (`uv pip list | grep hypothesis`)
- [ ] [Q-0368-B] scan_signal_events DLQ 30일 purge — APScheduler job 추가 or Supabase pg_cron?
- [ ] [Q-0368-C] decay_alert 기준 (2σ) — 30d 실데이터 확보 후 calibration 필요

## Implementation Plan

1. **Migration 038** — `scan_signal_events_dlq` + `scan_signal_events` ALTER (retry_count, last_error)
2. **`signal_event_store.py` Phase 2** — DLQ insert, batch buffer, circuit breaker state machine
3. **`dlq_replay.py`** — CLI: `--limit`, `--dry-run`, `--pattern-slug` 옵션
4. **`alpha_quality.py`** — `detect_decay()` + `GET /research/alpha-quality` 응답에 `decay_alert` 필드
5. **Tests Phase 2** — `test_signal_events_hardening.py` (9) + `test_lookahead_safety.py` (3) + `test_flag_parity.py` (2)
6. **p95 벤치마크** — `GET /research/alpha-quality` 30d mock 데이터로 측정 → < 500ms 달성
7. **Phase 2-C** — `docs/data/alpha_baselines.md` (데이터 축적 후 실행)

## Exit Criteria

- [ ] AC1: Retry FSM: insert 실패 3회 후 `scan_signal_events_dlq`에 1행 기록됨 (unit test, mock Supabase)
- [ ] AC2: `get_retry_backoff(attempt)` 반환값 — attempt 0→60s, 1→300s, 2→900s (unit test)
- [ ] AC3: Circuit breaker: 5분 내 10회 실패 → OPEN 상태 → 이후 insert 즉시 DLQ (unit test)
- [ ] AC4: Circuit breaker HALF-OPEN: 1h 후 probe 성공 → CLOSED 복구 (unit test)
- [ ] AC5: Batch UPSERT: 100개 이벤트 → 단일 SQL 트랜잭션 1회 (unit test, SQL call count 검증)
- [ ] AC6: `GET /research/alpha-quality` p95 < 500ms (30d mock 데이터 기준 pytest-benchmark)
- [ ] AC7: Lookahead-free: hypothesis 1,000 samples, `outcome_at > fired_at` 항상 참 (property test)
- [ ] AC8: Flag parity: `ENABLE_SIGNAL_EVENTS=false` → DB write 0, `=true` → write ≥ 1 (integration test, real DB)
- [ ] AC9: DLQ replay: `dlq_replay.py --dry-run` 출력에 replay 대상 ID 포함, `--limit 1` 실제 replay 후 `replayed_at IS NOT NULL` (integration test)
- [ ] AC10: `detect_decay()` 반환 dict에 `z_score`, `alert`, `baseline_rate`, `recent_rate` 4개 키 포함 (unit test)
- [ ] AC11: W-0367 16 + W-0368 14 = 총 ≥ 30 tests CI green
- [ ] AC12: PR merged + CURRENT.md SHA 업데이트
