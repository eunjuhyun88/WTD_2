# 02 — Engine Runtime (State Machine · Scanner · Ledger)

**Owner:** Engine Core
**Depends on:** `01_PATTERN_OBJECT_MODEL.md`

## 0. 현재 가장 큰 결함

`engine/patterns/state_machine.py`는 process-memory singleton이다.

- 재시작 → phase path 소실
- 멀티 인스턴스 → state divergence
- 이미 `ACCUMULATION`인 심볼은 최초 관찰 시 invisible

이걸 고치지 않으면 production grade 불가능. 이 문서는 **durable state plane**을 정의한다.

---

## 1. Runtime Lane 구분

```
app-web          ← SvelteKit. 프록시와 렌더만.
engine-api       ← FastAPI. 패턴 판정 권위.
worker-control   ← 스케줄러, 배치 스캔, 학습 잡.
data-plane       ← Postgres (state, ledger), ClickHouse (feature history, optional)
```

- 긴 scan loop는 `worker-control`에서만 실행
- `engine-api`는 short request/response만
- `app-web`은 engine decision을 재해석하지 않음

---

## 2. State Machine: Durable Version

### 2.1 데이터 테이블

```sql
-- 현재 상태 (symbol × pattern 하나당 1행)
pattern_runtime_state (
  symbol                text      not null,
  pattern_id            text      not null,
  pattern_version       int       not null,
  current_phase_index   int       not null,  -- 0 = idle
  phase_entered_at      timestamptz,
  timeout_at            timestamptz,
  last_scan_at          timestamptz not null,
  last_feature_checksum text,
  state_version         int       not null default 1,  -- optimistic lock
  primary key (symbol, pattern_id)
)

-- 전이 이벤트 (append-only)
phase_transition_events (
  event_id          uuid primary key,
  symbol            text not null,
  pattern_id        text not null,
  pattern_version   int  not null,
  from_phase_index  int  not null,
  to_phase_index    int  not null,
  transition_type   text not null,  -- 'enter' | 'exit' | 'timeout' | 'reset'
  occurred_at       timestamptz not null,
  bar_timestamp     timestamptz not null,
  features_snapshot jsonb not null,
  triggering_signals text[],
  created_at        timestamptz default now()
)

create index on phase_transition_events (symbol, pattern_id, occurred_at desc);
create index on pattern_runtime_state (current_phase_index) where current_phase_index > 0;
```

### 2.2 State Transition Function

```python
def evaluate_phase_transition(
    current_state: PatternRuntimeState,
    pattern: PatternObject,
    features: FeatureSnapshot,
    now: datetime,
) -> TransitionDecision:
    """
    Pure function. DB I/O는 caller가 한다.
    """
    current_phase = current_state.current_phase_index
    
    # 1. Timeout check
    if now > current_state.timeout_at and current_phase > 0:
        return TransitionDecision(
            type="timeout",
            from_phase=current_phase,
            to_phase=0,  # reset
            reason="phase_timeout",
        )
    
    # 2. Forbidden signal in current phase → reset
    phase_def = pattern.phases[current_phase - 1] if current_phase > 0 else None
    if phase_def:
        for cond in phase_def.conditions:
            if cond.forbidden and evaluate_signal(cond.signal_id, features):
                return TransitionDecision(
                    type="reset",
                    from_phase=current_phase,
                    to_phase=0,
                    reason=f"forbidden_signal:{cond.signal_id}",
                )
    
    # 3. Next phase conditions met?
    next_phase_index = current_phase + 1
    if next_phase_index > len(pattern.phases):
        return TransitionDecision(type="no_change")
    
    next_phase = pattern.phases[next_phase_index - 1]
    required_met = all(
        evaluate_signal(c.signal_id, features)
        for c in next_phase.conditions
        if c.required and not c.forbidden
    )
    
    if not required_met:
        return TransitionDecision(type="no_change")
    
    return TransitionDecision(
        type="advance",
        from_phase=current_phase,
        to_phase=next_phase_index,
        triggering_signals=[c.signal_id for c in next_phase.conditions if c.required],
    )
```

### 2.3 Optimistic Concurrency

여러 worker가 동시에 같은 `(symbol, pattern_id)` 업데이트할 수 있음.

```sql
update pattern_runtime_state
set current_phase_index = :new_phase,
    phase_entered_at = :now,
    timeout_at = :timeout,
    state_version = state_version + 1
where symbol = :symbol
  and pattern_id = :pattern_id
  and state_version = :expected_version;  -- optimistic lock
```

Conflict 시: retry with fresh read. 3회 fail → skip this scan cycle.

### 2.4 Cold Start / Backfill

새 pattern 등록 시 또는 worker 재시작 시:

```python
def backfill_state(pattern: PatternObject, lookback_bars: int = 100):
    """
    각 심볼의 과거 N bars feature를 순회하며 phase path 재구성.
    worker-control에서 async job으로 실행.
    """
    for symbol in universe:
        features_history = load_feature_history(symbol, pattern.timeframe, lookback_bars)
        simulated_state = PatternRuntimeState(symbol=symbol, pattern_id=pattern.pattern_id, current_phase_index=0)
        
        for feature_snapshot in features_history:
            decision = evaluate_phase_transition(simulated_state, pattern, feature_snapshot, feature_snapshot.timestamp)
            if decision.type in ("advance", "reset", "timeout"):
                simulated_state = apply_decision(simulated_state, decision)
                # Do NOT emit transition_events during backfill (mark backfill=true)
        
        persist_state(simulated_state, backfill=True)
```

Backfill events는 `transition_type='backfill_enter'`로 마킹. Ledger에는 포함하지 않음.

---

## 3. Scanner

### 3.1 Scan Cycle Contract

```python
@dataclass
class ScanCycle:
    cycle_id: str
    pattern_id: str
    pattern_version: int
    started_at: datetime
    completed_at: datetime | None
    symbols_scanned: int
    transitions_triggered: int
    errors: list[dict]
    dry_run: bool
```

모든 scan은 cycle_id로 감사 가능. Reproducibility:

```
(cycle_id, symbol, pattern_id) → deterministic decision
```

같은 feature snapshot으로 두 번 돌리면 같은 결과가 나와야 한다.

### 3.2 Scan Cadence (tier based)

```python
TIER_CADENCE = {
    "tier_1_large_cap": "1m",     # BTC, ETH
    "tier_2_mid_cap":   "5m",     # top 50 volume
    "tier_3_small_cap": "15m",    # rest
    "tier_4_long_tail": "1h",     # new listings, low volume
}
```

Universe는 `engine/universe/dynamic.py`에서 재계산. 24h마다 tier rebalance.

### 3.3 Idempotency

Scan cycle 재실행 safety:
- `bar_timestamp` 기준 latest-bar만 평가
- 이미 그 bar에서 transition이 발생했으면 skip
- `(symbol, pattern_id, bar_timestamp)` unique index on transition events

---

## 4. Result Ledger (Split Records)

### 4.1 현재 문제

현재 JSON-based ledger는 한 record에 entry / score / outcome / verdict가 뭉쳐 있음. Multi-family ML 훈련과 감사가 어려움.

### 4.2 분리된 테이블

```sql
-- 1. Entry: state machine이 actionable phase (보통 ACCUMULATION) 진입
ledger_entries (
  entry_id          uuid primary key,
  symbol            text,
  pattern_id        text,
  pattern_version   int,
  entry_phase_id    text,
  entry_at          timestamptz,
  entry_price       numeric,
  triggering_cycle_id text,
  features_snapshot jsonb,
  phase_path        jsonb,    -- [{phase_id, entered_at, duration_bars}]
  created_at        timestamptz default now()
)

-- 2. Score: ML/reranker가 entry에 대해 매긴 확률
ledger_scores (
  score_id          uuid primary key,
  entry_id          uuid references ledger_entries(entry_id),
  model_id          text,     -- 'baseline_rule' | 'lgb_v3' | 'claude_judge_v1'
  model_version     text,
  prob_win          numeric,
  calibration_band  text,     -- 'low' | 'mid' | 'high'
  scored_at         timestamptz,
  features_version  int
)

-- 3. Outcome: 자동 평가 결과
ledger_outcomes (
  outcome_id        uuid primary key,
  entry_id          uuid references ledger_entries(entry_id) unique,
  peak_price        numeric,
  peak_return_pct   numeric,
  exit_price        numeric,
  exit_return_pct   numeric,
  evaluated_at      timestamptz,
  evaluation_window_end timestamptz,
  auto_verdict      text,     -- 'HIT' | 'MISS' | 'EXPIRED'
  btc_trend         text,
  regime            text
)

-- 4. Verdict: 유저 judgment
ledger_verdicts (
  verdict_id        uuid primary key,
  entry_id          uuid references ledger_entries(entry_id),
  user_id           text,
  verdict           text,     -- 'VALID' | 'INVALID' | 'NEAR_MISS' | 'TOO_EARLY' | 'TOO_LATE'
  comment           text,
  judged_at         timestamptz,
  source            text      -- 'terminal' | 'dashboard_inbox' | 'batch_review'
)

-- 5. Training projection: ML 학습용 materialized view
create materialized view ledger_training_view as
select
  e.entry_id, e.symbol, e.pattern_id, e.pattern_version,
  e.features_snapshot, e.phase_path,
  o.auto_verdict, o.peak_return_pct, o.exit_return_pct,
  v.verdict as user_verdict, v.user_id,
  s.prob_win, s.model_id
from ledger_entries e
left join ledger_outcomes o using (entry_id)
left join ledger_verdicts v using (entry_id)
left join ledger_scores s using (entry_id);
```

### 4.3 Verdict Logic (자동)

```python
def compute_auto_verdict(entry: LedgerEntry, window_hours: int = 72) -> str:
    bars = load_bars(entry.symbol, entry.entry_at, window_hours)
    peak_return = max((b.high - entry.entry_price) / entry.entry_price for b in bars)
    exit_return = (bars[-1].close - entry.entry_price) / entry.entry_price
    
    if peak_return >= 0.15:
        return "HIT"
    elif exit_return <= -0.10:
        return "MISS"
    else:
        return "EXPIRED"
```

User override는 `ledger_verdicts`에 별도 기록. Auto와 user가 다르면 user 우선, 단 ML training set에는 양쪽 signal로 반영 (disagreement가 학습 신호).

### 4.4 Aggregate Stats

`engine/ledger/stats.py`:

```python
def pattern_stats(pattern_id: str, regime_filter: str | None = None) -> dict:
    """
    - hit_rate
    - avg_return (HIT only)
    - avg_loss (MISS only)
    - expected_value
    - sample_size
    - decay_vs_baseline (최근 30d vs 180d)
    """
```

---

## 5. Worker Control

### 5.1 Job Types

```
scan_job           → periodic phase evaluation
outcome_job        → evaluation window closed → compute verdict
training_job       → dataset generate → LightGBM fit
refinement_job     → threshold sweep → propose new variant
backfill_job       → new pattern → replay history
cleanup_job        → expired phase states → reset
```

### 5.2 Scheduler

APScheduler or equivalent. 모든 job은 `job_run_log`에 기록:

```sql
job_run_log (
  job_id        uuid,
  job_type      text,
  started_at    timestamptz,
  completed_at  timestamptz,
  status        text,     -- 'success' | 'failed' | 'partial'
  payload       jsonb,
  error         text
)
```

---

## 6. Event Bus (선택적)

현재는 DB polling으로 충분. 확장 시 NATS/Redis Streams 고려.

Event types:
- `phase.advanced`
- `phase.reset`
- `entry.created`
- `outcome.computed`
- `verdict.submitted`

---

## 7. Performance Budget

| Operation | Target | Limit |
|---|---|---|
| Single symbol scan (1 pattern) | < 10ms | 50ms |
| Full universe scan (300 sym × 1 pattern) | < 3s | 10s |
| Feature snapshot load | < 20ms | 100ms |
| State table read (hot path) | < 5ms | 20ms |
| Ledger entry insert | < 10ms | 50ms |

위반 시: 쿼리 최적화 또는 ClickHouse로 feature history 이전.

---

## 8. Observability

### 8.1 필수 메트릭

- `scan_cycles_completed_total` (by pattern_id)
- `phase_transitions_total` (by from, to)
- `scan_duration_seconds` (histogram)
- `state_conflicts_total` (optimistic lock 실패)
- `ledger_entries_created_total`
- `ledger_outcomes_pending` (evaluation window 닫힐 대기 중)

### 8.2 경고

- Scan latency p99 > 30s → alert
- State conflict rate > 5% → alert (worker sharding 필요)
- Outcome pending > 1h past window → alert (outcome_job 실패)

---

## 9. Migration Checklist

```
[ ] pattern_runtime_state 테이블 생성
[ ] phase_transition_events 테이블 생성
[ ] 현재 in-memory state를 DB로 dump (1회성)
[ ] Scanner를 DB-backed state로 리팩토링
[ ] Ledger 4테이블 분리, 기존 JSON → migration
[ ] Outcome job 분리 (현재 동기 실행)
[ ] Backfill job 구현
[ ] Cycle_id 추적 추가
```

각 단계는 feature flag 뒤에서 병행 실행. Shadow mode로 N일 검증 후 전환.

---

## 10. Non-Goals

- Distributed consensus (Raft 등): 단일 worker + DB lock으로 충분
- Event sourcing: 현재 스케일에서는 과투자
- Real-time streaming verdict: 배치로 충분 (window = 72h)
- Sub-second scan latency: tier 1만 1min, 나머지는 5-15min
