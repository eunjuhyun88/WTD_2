# W-0385 — Decision Event Ledger (Kieran-style 차단 이유 + 포뮬라 증거)

> Wave: 5 | Priority: P1 | Effort: L (7-10d, 3 PR)
> Charter: In-Scope (ML 데이터 누적 + 의사결정 감사 루프)
> Status: 🟡 Design Draft
> Created: 2026-05-02
> Depends on: W-0377 (pipeline repair), W-0382 (blocked_candidates 테이블)

## Owner

eunjuhyun88 — PR1(engine), PR2(engine worker), PR3(app UI).

---

## Goal

`blocked_candidates` 테이블(migration 044)의 `forward_1h/4h/24h/72h` 컬럼을 실제 시장가격으로 채우고, `formula_evidence` 집계 테이블을 매일 갱신하여, "이 필터가 얼마나 많은 실제 수익 기회를 차단했는가"(drag_score)를 데이터로 측정한다. W-0378 AI Agent 명령 실행 시 `watch_only` 이벤트도 캡처한다.

---

## Scope

```
app/supabase/migrations/048_formula_evidence.sql   # ← 047은 agent_interactions (W-0378) 선점
engine/research/artifacts/blocked_candidate_store.py  # insert_blocked_candidate() 시그니처 확장
engine/scanner/jobs/blocked_candidate_resolver.py     # 72h forward P&L 채우기 (신규)
engine/scanner/jobs/formula_evidence_materializer.py  # 매일 drag_score 집계 (신규)
engine/scanner/scheduler.py                           # 두 job APScheduler 등록
engine/scanner/realtime.py                            # insert_blocked_candidate kwargs 확장
engine/tests/test_blocked_candidate_resolver.py
app/src/routes/lab/counterfactual/+page.svelte
app/src/routes/patterns/formula/+page.svelte
app/src/routes/patterns/filter-drag/+page.svelte
```

---

## Non-Goals

- `decision_events` 신규 테이블 생성 (기존 `blocked_candidates` 확장으로 충분)
- 실시간 WebSocket 스트리밍 (daily materializer + polling으로 충분)
- ML 재학습 트리거 (formula_evidence는 조회 전용 집계)
- W-0379 autoresearch와 연동 (독립 실행 가능)

---

## Canonical Files

```
app/supabase/migrations/048_formula_evidence.sql
engine/research/artifacts/blocked_candidate_store.py
engine/scanner/jobs/blocked_candidate_resolver.py
engine/scanner/jobs/formula_evidence_materializer.py
engine/scanner/scheduler.py                   # APScheduler 등록 지점
engine/scanner/realtime.py                    # insert_blocked_candidate kwargs 확장
app/src/routes/lab/counterfactual/+page.svelte
app/src/routes/patterns/formula/+page.svelte
```

---

## Facts (실측 기반)

1. `blocked_candidates` 테이블 — migration 044 (`app/supabase/migrations/044_blocked_candidates.sql`). `forward_*` 컬럼 존재, 모두 NULL.
2. `filter_reason` ENUM — 현재 9개 코드 (below_min_conviction, timing_conflict, regime_mismatch, heat_too_high, insufficient_liquidity, spread_too_wide, duplicate_signal, conflicting_signals, stale_context). 이번 5개 추가.
3. **migration 최신 번호: `047_agent_interactions.sql` (W-0378 선점).** 이번 migration = **`048`**.
4. migration 경로: `app/supabase/migrations/` (engine 측 없음).
5. `formula_evidence` 테이블 신규 생성. `drag_score = blocked_winner_rate × avg_missed_pnl`.
6. `insert_blocked_candidate` 이미 존재 — `engine/research/artifacts/blocked_candidate_store.py:37`. shim: `engine/research/blocked_candidate_store.py`. PR1은 `source`, `pattern_slug`, `outcome_id` kwargs 추가.
7. **현재 emit 지점**: `engine/scanner/realtime.py:206` — direction=NEUTRAL 시 reason="below_min_conviction"으로 insert. PR1에서 kwargs 확장만.
8. APScheduler 등록 위치: `engine/scanner/scheduler.py`. 기존 `outcome_resolver` job (line ~390) 바로 뒤에 추가 (동일 패턴: `_job_enabled()` 가드 + `add_job`).
9. `_entry_and_forward_closes()` — `engine/scanner/jobs/outcome_resolver.py:33` private 함수. blocked_candidate_resolver는 동일 로직을 독립 헬퍼로 재구현하거나 `outcome_resolver` 모듈 내 노출 함수(`resolve_outcomes`)를 직접 호출.
10. `evaluate_blocks` 반환값은 블록 이름 list (e.g. "bullish_engulfing", "funding_extreme"). 이 블록 목록이 아닌 `direction==NEUTRAL`이 차단 기준 — reason_code 다양화는 별도 explicit gate 추가 필요.

---

## Open Questions

1. ✅ **해결**: migration 번호 = 048 (047은 W-0378 agent_interactions 선점).
2. ✅ **해결**: `source` 컬럼 — migration 048 `ALTER TABLE blocked_candidates ADD COLUMN source text DEFAULT 'engine'` 포함.
3. `formula_evidence` compute 주기: **결정 = daily batch 03:30 UTC** (incremental은 불필요한 복잡성).
4. W-0378 watch_only emit 시점: agent 명령 dispatch 직후 vs. LLM 응답 완료 후. **결정 = dispatch 직후** (LLM 실패해도 watch_only 기록).
5. [ ] **미결**: backfill (migration 044 이후 누적 NULL rows) — PR2에 포함할지 별도 후속 PR로 뺄지. 권장: PR2 이후 dev 환경에서 먼저 실행, prod은 별도 확인.
6. [ ] **미결**: `engine/api/routes/research.py` 기존 파일 존재 여부 확인 필요 — PR2 시작 전 `grep -n "formula\|blocked_candidate" engine/api/routes/research.py` 실행.

---

## 목적 (Why this exists)

### 핵심 질문
"왜 이 신호를 통과시켰는가? 왜 차단했는가? 차단한 게 옳았는가?"

현재 시스템은 **통과된** 신호(`pattern_outcomes`, `scan_signal_outcomes`)는 추적하지만, **차단된** 신호가 실제로 어디로 갔는지는 모른다. `blocked_candidates` 테이블(migration 044, W-0382)이 차단 기록을 시작했지만:

1. `forward_1h/4h/24h/72h` 컬럼이 모두 NULL — resolver 없음
2. AI Agent 명령 실행 시 `watch_only` 이벤트 미캡처
3. `formula_evidence` — "이 필터가 몇 %의 실제 수익 기회를 차단했는가" 집계 없음
4. UI 3페이지 (filter-drag, formula, counterfactual)가 stub만 존재

이 work item은 차단 이벤트의 **forward P&L**을 채우고, **formula_evidence 집계**를 매일 계산하며, 사용자가 "필터를 어떻게 개선할지"를 데이터로 판단할 수 있는 UI를 완성한다.

### Kieran 방법론 매핑

| Kieran 객체 | 우리 구현 | 이번 상태 |
|---|---|---|
| decision_event(executed) | PatternOutcome (accumulation_at 기준) | ✅ 이미 존재 |
| decision_event(blocked) | blocked_candidates 테이블 (migration 044) | ⚡ 존재하나 forward P&L이 NULL |
| decision_event(watch_only) | 없음 | **NEW** — W-0378 AI Agent 명령 시 emit |
| counterfactual_row(executed) | scan_signal_outcomes (triple barrier 1h/4h/24h/72h) | ✅ 이미 존재 |
| counterfactual_row(blocked) | blocked_candidates.forward_1h/4h/24h/72h | ⚡ 컬럼 존재, resolver 없음 |
| formula_evidence | 없음 | **NEW** — migration 048 |
| reason_codes taxonomy | filter_reason ENUM (9코드, migration 044) | ⚡ 5코드 추가 필요 |

---

## 기존 테이블 구조 (변경하지 않는 것)

### `blocked_candidates` (migration 044, W-0382)
```sql
id, symbol, timeframe, direction, reason(filter_reason), score, p_win,
blocked_at, forward_1h, forward_4h, forward_24h, forward_72h
```
**이번 work item에서 수정:** `reason` ENUM에 5개 코드 추가 + forward P&L resolver 연결.

### `pattern_outcomes` (기존)
executed 케이스의 기준. `blocked_candidates.forward_*`와 비교해 drag_score 계산.

---

## 신규 DB 변경

### migration 048 — formula_evidence + filter_reason ENUM 확장 (047_agent_interactions 선점 확인됨)

```sql
-- Part 1: filter_reason ENUM에 Kieran 14코드 추가 (기존 9개에서 14개로)
-- 기존: below_min_conviction, timing_conflict, regime_mismatch, heat_too_high,
--       insufficient_liquidity, spread_too_wide, duplicate_signal, conflicting_signals, stale_context
-- 추가:
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'anti_chase';       -- 늦은 진입 감지
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'too_late';         -- user_verdict="too_late" 매핑
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'not_executable';   -- propfirm skip
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'diagnostic_only';  -- rollout_state="candidate"
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'manual_skip';      -- user_verdict="invalid"

-- Part 2: formula_evidence — 패턴/필터 룰별 집계 증거 (매일 materialized)
CREATE TABLE IF NOT EXISTS formula_evidence (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind            text          NOT NULL,   -- 'pattern' | 'filter_rule' | 'reason_code'
  scope_value           text          NOT NULL,   -- slug / reason code / bucket name
  period_start          timestamptz   NOT NULL,   -- 집계 시작 (default: 전일 00:00 UTC)
  period_end            timestamptz   NOT NULL,   -- 집계 종료
  sample_n              int,                      -- 샘플 수
  win_rate              real,                     -- executed 케이스 승률
  avg_pnl               real,                     -- executed 케이스 평균 P&L (bps)
  blocked_winner_rate   real,                     -- 차단했는데 실제로 TP 갔을 비율 (핵심 지표)
  good_block_rate       real,                     -- 차단했는데 실제로 SL/timeout이었을 비율
  drag_score            real,                     -- blocked_winner_rate × avg_missed_pnl (값이 클수록 이 필터가 수익 기회를 많이 날림)
  avg_missed_pnl        real,                     -- 차단된 winner의 평균 forward P&L
  computed_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_formula_evidence_scope ON formula_evidence (scope_kind, scope_value, computed_at DESC);
CREATE INDEX idx_formula_evidence_drag  ON formula_evidence (drag_score DESC NULLS LAST, computed_at DESC);

-- Idempotency: materializer는 매일 실행 — 같은 (scope, period) 중복 방지
CREATE UNIQUE INDEX idx_formula_evidence_unique
  ON formula_evidence (scope_kind, scope_value, period_start);

-- RLS
ALTER TABLE formula_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON formula_evidence
  FOR ALL USING (auth.role() = 'service_role');

-- Part 3: blocked_candidates에 watch_only 케이스 수용 컬럼 추가
ALTER TABLE blocked_candidates ADD COLUMN IF NOT EXISTS source text DEFAULT 'engine';
-- source: 'engine' | 'ai_agent' | 'user'
-- ai_agent: AI Agent 명령 실행 시 "/similar ETH" 같은 watch_only 이벤트
ALTER TABLE blocked_candidates ADD COLUMN IF NOT EXISTS pattern_slug text;
-- executed 케이스의 경우 pattern_outcomes.pattern_slug 연결용
ALTER TABLE blocked_candidates ADD COLUMN IF NOT EXISTS outcome_id uuid;
-- executed 케이스: pattern_outcomes.id FK
```

---

## 신규 엔진 파일

### `engine/research/blocked_candidate_resolver.py`

#### 목적
`blocked_candidates` 테이블에서 `forward_1h/4h/24h/72h` 가 NULL인 rows를 주기적으로 채운다. `outcome_resolver.py` 와 동일한 triple-barrier + OHLCV 로직 재사용.

#### 실행 주기
APScheduler에 등록: 1시간마다 (outcome_resolver와 동일 cadence).

```python
"""W-0385: Blocked candidate outcome resolver.

For each blocked_candidates row where forward_1h IS NULL AND
blocked_at < NOW() - INTERVAL '2h' (1h resolution 필요):
1. Fetch OHLCV from data_cache
2. Compute forward returns at +1h/+4h/+24h/+72h from blocked_at
3. UPDATE blocked_candidates SET forward_1h=..., ... WHERE id=...
"""

HORIZONS_H = [1, 4, 24, 72]
BATCH_SIZE = 50   # 한 번에 처리할 최대 rows

def resolve_batch() -> int:
    """Returns number of rows filled."""
    ...
```

#### forward P&L 계산 방식

`engine/scanner/jobs/outcome_resolver.py:33`의 `_entry_and_forward_closes()`는 private 함수. **직접 import 금지** — 대신 아래 독립 헬퍼를 `blocked_candidate_resolver.py` 내부에 구현:

```python
def _forward_return_at_horizon(
    klines,        # pd.DataFrame with DatetimeIndex, 'close' col
    ref_ts: datetime,
    horizon_h: int,
) -> float | None:
    """Return (close at ref_ts + horizon_h) / (close at ref_ts) - 1.0.
    Returns None if insufficient bars."""
    import pandas as pd
    tz = getattr(klines.index, "tz", None)
    if tz and ref_ts.tzinfo is None:
        ref_ts = ref_ts.replace(tzinfo=timezone.utc)
    entry_mask = klines.index >= ref_ts
    if not entry_mask.any():
        return None
    entry_close = float(klines.loc[entry_mask, "close"].iloc[0])
    target_ts = ref_ts + timedelta(hours=horizon_h)
    future_mask = klines.index >= target_ts
    if not future_mask.any():
        return None
    future_close = float(klines.loc[future_mask, "close"].iloc[0])
    return (future_close / entry_close) - 1.0
```

- **방향 반영**: direction='long' → 그대로; 'short' → 부호 반전; 'neutral' → 그대로 (진단용)
- 데이터 부족 → None 유지 (에러 아님, next resolve cycle에서 재시도)

#### 스케줄러 등록 (`engine/scanner/scheduler.py`)

기존 `outcome_resolver` 등록 블록 (line ~390) 바로 뒤에 추가. `_job_enabled()` 패턴 동일하게 사용:

```python
# W-0385: blocked candidate P&L resolver — hourly (Job 3d)
async def _blocked_candidate_resolve_job() -> None:
    from scanner.jobs.blocked_candidate_resolver import resolve_batch
    import asyncio
    filled = await asyncio.to_thread(resolve_batch)
    log.info("blocked_candidate_resolver: %d rows filled", filled)

async def _formula_evidence_materialize_job() -> None:
    from scanner.jobs.formula_evidence_materializer import materialize_all
    import asyncio
    rows = await asyncio.to_thread(materialize_all)
    log.info("formula_evidence_materializer: %d rows written", rows)

# In start_scheduler():
if _job_enabled("blocked_candidate_resolver"):
    _scheduler.add_job(
        _blocked_candidate_resolve_job,
        trigger="interval",
        seconds=3600,
        id="blocked_candidate_resolver",
        name="Blocked candidate P&L resolver",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )

if _job_enabled("formula_evidence_materializer"):
    _scheduler.add_job(
        _formula_evidence_materialize_job,
        trigger="cron",
        hour=3,
        minute=30,
        id="formula_evidence_materializer",
        name="Formula evidence daily materializer",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=1800,
    )
```

---

### `engine/research/formula_evidence_materializer.py`

#### 목적
매일 03:30 UTC, `blocked_candidates` + `pattern_outcomes` 를 join해 `formula_evidence` 를 계산한다.

```python
"""W-0385: Formula evidence materializer.

Runs daily at 03:30 UTC (after backtest_stats_refresh at 03:00).
"Winner" definition: forward_24h >= +50bps (DRAG_WIN_THRESHOLD env, bps).
Idempotent: UPSERT ON CONFLICT (scope_kind, scope_value, period_start).
"""
import os
from statistics import mean

DRAG_WIN_THRESHOLD_BPS = float(os.environ.get("DRAG_WIN_THRESHOLD_BPS", "50"))

def materialize_all(period_days: int = 30) -> int:
    """Fetch blocked_candidates with forward_24h filled, group by reason, UPSERT formula_evidence.
    Returns number of rows upserted."""
    sb = _sb()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    period_start = (datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ) - timedelta(days=1)).isoformat()  # 전일 00:00 UTC

    rows = (
        sb.table("blocked_candidates")
        .select("reason, source, forward_24h, score, p_win, blocked_at")
        .gte("blocked_at", cutoff)
        .not_.is_("forward_24h", "null")
        .execute()
        .data
    )

    by_reason: dict[str, list[dict]] = {}
    for r in rows:
        by_reason.setdefault(r["reason"], []).append(r)

    upserted = 0
    for reason, group in by_reason.items():
        evidence = _compute(group, reason, period_start)
        sb.table("formula_evidence").upsert(
            evidence, on_conflict="scope_kind,scope_value,period_start"
        ).execute()
        upserted += 1
    return upserted

def _compute(rows: list[dict], reason: str, period_start: str) -> dict:
    threshold = DRAG_WIN_THRESHOLD_BPS / 10000  # 0.005 for 50bps
    winners = [r for r in rows if (r["forward_24h"] or 0) >= threshold]
    losers  = [r for r in rows if r["forward_24h"] is not None and r["forward_24h"] < 0]
    n = len(rows)
    win_rate = len(winners) / n if n else 0.0
    good_block_rate = len(losers) / n if n else 0.0
    avg_missed = mean(r["forward_24h"] for r in winners) if winners else 0.0
    drag_score = win_rate * avg_missed * 10000  # bps

    return {
        "scope_kind": "filter_rule",
        "scope_value": reason,
        "period_start": period_start,
        "period_end": datetime.now(timezone.utc).isoformat(),
        "sample_n": n,
        "blocked_winner_rate": win_rate,
        "good_block_rate": good_block_rate,
        "drag_score": drag_score,
        "avg_missed_pnl": avg_missed * 10000,  # bps
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
```

---

### `engine/scanner/realtime.py` 수정 — 기존 emit에 kwargs 추가

기존 emit 지점은 **이미 존재** (`realtime.py:206`). PR1 범위는 새 kwargs 전달만:

```python
# 현재 (line 206):
if ensemble.direction == SignalDirection.NEUTRAL:
    insert_blocked_candidate(
        symbol=symbol,
        timeframe="1h",
        direction="neutral",
        reason="below_min_conviction",
        score=ensemble.ensemble_score,
        p_win=p_win,
    )
    return None

# W-0385 수정 — source + 향후 확장 가능 구조:
if ensemble.direction == SignalDirection.NEUTRAL:
    insert_blocked_candidate(
        symbol=symbol,
        timeframe="1h",
        direction="neutral",
        reason="below_min_conviction",  # 현재는 단일 코드; reason_code 다양화는 PR2+
        score=ensemble.ensemble_score,
        p_win=p_win,
        source="engine",               # NEW
    )
    return None
```

> **Note**: `_map_reason_code()` 는 현재 불필요 — `evaluate_blocks` 반환 블록 이름(e.g. "funding_extreme")은 filter_reason ENUM과 다른 축. reason_code 다양화는 explicit gate 추가 시 별도 설계(W-0304 이후).

---

### `engine/research/artifacts/blocked_candidate_store.py` — 시그니처 확장 (신규 작성 아님)

기존 `insert_blocked_candidate` 함수에 kwargs 3개 추가. shim (`engine/research/blocked_candidate_store.py`)은 `from artifacts import *` 구조라 자동 반영됨.

```python
# 변경 전 시그니처 (현재 line 37):
def insert_blocked_candidate(
    *, symbol, timeframe="1h", direction, reason, score=None, p_win=None
) -> None: ...

# 변경 후 — source / pattern_slug / outcome_id 추가:
def insert_blocked_candidate(
    *,
    symbol: str,
    timeframe: str = "1h",
    direction: str,
    reason: FilterReason,
    score: float | None = None,
    p_win: float | None = None,
    source: str = "engine",          # NEW: 'engine' | 'ai_agent' | 'user'
    pattern_slug: str | None = None, # NEW: executed 케이스의 pattern_outcomes.pattern_slug
    outcome_id: str | None = None,   # NEW: pattern_outcomes.id FK (uuid str)
) -> None: ...
```

`FilterReason` Literal도 5개 코드 추가:
```python
FilterReason = Literal[
    "below_min_conviction", "timing_conflict", "regime_mismatch",
    "heat_too_high", "insufficient_liquidity", "spread_too_wide",
    "duplicate_signal", "conflicting_signals", "stale_context",
    "anti_chase", "too_late", "not_executable",  # NEW
    "diagnostic_only", "manual_skip",             # NEW
]
```

---

### W-0378 AI Agent hook (watch_only emit)

W-0378에서 `/scan`, `/similar`, `/explain` 명령 실행 시 아래 1줄 추가:
```python
# W-0385: watch_only event
insert_blocked_candidate(
    symbol=symbol,
    timeframe="1h",
    direction="neutral",
    reason="diagnostic_only",
    source="ai_agent",
)
```
이렇게 하면 "AI Agent가 어떤 심볼을 얼마나 자주 들여다봤는지"가 `blocked_candidates`에 쌓여, 향후 `watch_only` 케이스의 forward P&L도 추적 가능.

---

## 앱 UI (PR3)

### 1. `/patterns/filter-drag` (기존 stub 완성)

**목적**: filter_reason 코드별로 drag_score를 내림차순 정렬해 "이 필터가 수익 기회를 얼마나 날리고 있는가"를 한 화면에 보여준다.

**데이터소스**: `GET /api/research/formula-evidence?scope=filter_rule`

**화면 구성**:
```
[filter_reason]  [sample_n]  [blocked_winner_rate]  [good_block_rate]  [drag_score ↓]
below_min_conviction  142     31%                   54%                 2,840 bps
regime_mismatch        87     24%                   61%                 1,920 bps
anti_chase             33     18%                   71%                   890 bps
...
```
drag_score >= 2000bps → 빨간색 강조 ("이 필터 재검토 필요")
drag_score 300~2000bps → 노란색
drag_score < 300bps → 회색 ("필터 효과적")

클릭 → 해당 reason_code로 필터링된 blocked_candidates 목록 (타임라인 + forward P&L 분포)

### 2. `/patterns/formula` (기존 stub 완성)

**목적**: 패턴 슬러그별로 formula_evidence를 보여준다. "alpha-presurge-v1 패턴이 지난 30일간 얼마나 정확했는가".

**데이터소스**: `GET /api/research/formula-evidence?scope=pattern`

**화면 구성**:
```
[pattern_slug]           [n_executed]  [win_rate]  [avg_pnl]  [blocked_winner_rate]
alpha-presurge-v1        240           58%         +180bps     22%
momentum-breakout-v2     89            51%         +95bps      34%   ← 이 패턴은 차단이 많이 틀림
```
상단에 "공식 증거 업데이트: 2026-05-02 03:30 UTC" 타임스탬프.

### 3. `/lab/counterfactual` (기존 확장)

**현재**: 기본 페이지만 있음
**확장**: blocked_candidates.forward_* 가 filled된 rows를 타임라인 + 산포도로 시각화.

**필터**:
- reason_code 선택
- 기간 선택 (7d / 30d / 90d)
- symbol 검색

**주요 차트**:
1. **scatter**: x=score(차단 시점), y=forward_24h(실제 수익). 오른쪽 위 = "차단해서 놓친 기회"
2. **histogram**: forward_24h 분포 → winner/loser 비율 시각화
3. **timeline**: 차단된 신호 타임라인, TP갔으면 초록 점, SL갔으면 빨간 점

---

## API 엔드포인트 (engine)

### `GET /research/formula-evidence`
```
Query: scope=filter_rule|pattern (default: filter_rule)
       period_days=30 (default)
       min_sample=10 (sample_n 하한, default)

Response:
  [
    {
      "scope_value": "below_min_conviction",
      "sample_n": 142,
      "blocked_winner_rate": 0.31,
      "good_block_rate": 0.54,
      "drag_score": 2840.0,
      "computed_at": "2026-05-02T03:30:00Z"
    },
    ...
  ]
```

### `GET /research/blocked-candidates`
```
Query: reason=below_min_conviction (optional)
       symbol=ETH (optional)
       from_ts=... to_ts=... (optional)
       filled_only=true (forward_* IS NOT NULL 필터, default false)

Response: blocked_candidates rows, forward_* 포함, 최신순 정렬
```

---

## Implementation Plan

**PR1 — migration + store 확장 (1d)**
1. `app/supabase/migrations/048_formula_evidence.sql` (위 SQL — 번호 확인 필수)
2. `engine/research/artifacts/blocked_candidate_store.py` — `insert_blocked_candidate` kwargs 3개 추가 (`source`, `pattern_slug`, `outcome_id`) + FilterReason Literal 5개 추가
3. `engine/scanner/realtime.py:206` — `source="engine"` kwarg 추가 (1줄)
4. `engine/tests/test_blocked_candidate_store.py` — new kwargs 포함 2 tests (Supabase mock)

**PR2 — resolvers + materializer + API (2-3d)**
1. `engine/scanner/jobs/blocked_candidate_resolver.py` — `_forward_return_at_horizon()` + `resolve_batch()` 신규 (위 pseudo code)
2. `engine/scanner/jobs/formula_evidence_materializer.py` — `materialize_all()` + `_compute()` 신규 (위 pseudo code)
3. `engine/scanner/scheduler.py` — `_blocked_candidate_resolve_job` + `_formula_evidence_materialize_job` 2개 등록 (위 패턴)
4. `engine/api/routes/research.py` — `/research/formula-evidence` + `/research/blocked-candidates` 2개 엔드포인트 추가
5. `engine/tests/test_formula_evidence.py` — materializer unit test (mock Supabase, `_compute()` 직접 호출)
6. **Backfill 스크립트** (optional, 별도 PR 또는 PR2에 포함):
   ```bash
   # 기존 NULL rows 일괄 채우기 (migration 044 이후 누적분)
   # engine/scripts/backfill_blocked_candidates.py
   python -c "
   from scanner.jobs.blocked_candidate_resolver import resolve_batch
   import time
   total = 0
   while True:
       n = resolve_batch(batch_size=200)
       total += n
       if n == 0: break
       print(f'filled {n}, total={total}')
       time.sleep(1)
   print('backfill complete', total)
   "
   ```

**PR3 — UI (2-3d)**
1. `app/src/routes/patterns/filter-drag/+page.svelte` 완성
2. `app/src/routes/patterns/formula/+page.svelte` 완성
3. `app/src/routes/lab/counterfactual/+page.svelte` scatter + histogram 확장
4. `app/src/routes/api/research/formula-evidence/+server.ts` — engine proxy (`/research/formula-evidence` 호출)
5. `app/src/routes/api/research/blocked-candidates/+server.ts` — engine proxy

> **SvelteKit proxy 패턴** (기존 `app/src/routes/api/research/` 하위 동일 패턴):
> ```ts
> import { ENGINE_BASE_URL, ENGINE_KEY } from '$env/static/private';
> export async function GET({ url }) {
>   const res = await fetch(`${ENGINE_BASE_URL}/research/formula-evidence?${url.searchParams}`, {
>     headers: { Authorization: `Bearer ${ENGINE_KEY}` },
>   });
>   return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } });
> }
> ```

---

## Exit Criteria

- [ ] AC1: `blocked_candidates` 신규 insert — source, pattern_slug, outcome_id 컬럼 포함
- [ ] AC2: `blocked_candidate_resolver` — 1h 후 forward_1h NULL rows 중 ≥90%가 filled
- [ ] AC3: `formula_evidence_materializer` — 수동 실행 후 `formula_evidence` rows 생성 확인 (reason_code별 1개 이상)
- [ ] AC4: `/research/formula-evidence` API — drag_score 내림차순 정렬된 JSON 반환
- [ ] AC5: `/patterns/filter-drag` — drag_score 테이블 렌더링, 데이터 1개 이상
- [ ] AC6: `/lab/counterfactual` — scatter + histogram 렌더링
- [ ] AC7: `engine/tests/` PASS (regression 없음)
- [ ] CI green

## Assumptions

- `blocked_candidates` 테이블은 이미 Supabase에 exist (migration 044, W-0382 merged)
- `outcome_resolver`가 W-0377 Break B로 이미 수정되어 있음 (이 work item의 PR1 전제)
- DRAG_WIN_THRESHOLD_BPS 기본값 50bps는 현재 alpha 전략의 TP 기준과 정합 (변경 가능)

## Decisions

- D1: `decision_events`를 별도 테이블로 만들지 않고 `blocked_candidates` 확장. 이유: migration 044 이미 배포, `source` 컬럼으로 engine/ai_agent/user 구분 가능.
- D2: `formula_evidence`는 materialized view 대신 실제 테이블(매일 UPSERT). UI가 시계열 히스토리 필요. Idempotency: `UNIQUE(scope_kind, scope_value, period_start)`.
- D3: "winner" 판정 = forward_24h >= 50bps (`DRAG_WIN_THRESHOLD_BPS` env). 24h 기준 이유: 1h는 노이즈, 72h는 fill 지연.
- **D4**: migration = 048 (047 선점 확인). `engine/supabase/migrations/` 경로 없음 — `app/supabase/migrations/`만 사용.
- **D5**: `emit_blocked_candidate()` 신규 작성 대신 기존 `insert_blocked_candidate()` 확장. 이유: 이미 `realtime.py`에서 import 중. shim 구조 덕분에 `engine/research/blocked_candidate_store.py`도 자동 반영.
- **D6**: `_entry_and_forward_closes()` import 금지 (private). `blocked_candidate_resolver.py` 내부에 `_forward_return_at_horizon()` 독립 구현.

## Next Steps

- drag_score가 높은 필터 룰을 W-0379 autoresearch proposer의 입력으로 사용 (별도 설계)
- AI Agent `/judge` 명령에서 formula_evidence를 컨텍스트로 주입 (W-0378 Phase 3)

## Handoff Checklist

- [ ] AC1~AC7 전부 체크
- [ ] migration 048 Supabase 적용 확인
- [ ] CURRENT.md W-0385 row 추가
- [ ] blocked_candidates resolver 1h 이후 smoke: NULL rows 감소 확인
