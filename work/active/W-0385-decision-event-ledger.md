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
engine/supabase/migrations/047_formula_evidence.sql
engine/research/blocked_candidate_store.py    # emit_blocked_candidate() + list_unresolved()
engine/scanner/jobs/blocked_candidate_resolver.py  # 72h forward P&L 채우기
engine/scanner/jobs/formula_evidence_materializer.py  # 매일 drag_score 집계
engine/scheduler.py                           # 두 job APScheduler 등록
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
engine/supabase/migrations/047_formula_evidence.sql
engine/research/blocked_candidate_store.py
engine/scanner/jobs/blocked_candidate_resolver.py
engine/scanner/jobs/formula_evidence_materializer.py
engine/scheduler.py                           # APScheduler 등록 지점
app/src/routes/lab/counterfactual/+page.svelte
app/src/routes/patterns/formula/+page.svelte
```

---

## Facts

1. `blocked_candidates` 테이블은 migration 044에서 생성됨 (W-0382). `forward_1h/4h/24h/72h` 컬럼 존재하나 모두 NULL.
2. `filter_reason` ENUM은 현재 9개 코드. 이번 work item에서 5개 추가 (migration 047).
3. 최신 migration 번호: `046_ensemble_rounds.sql` → 이번 migration = `047`.
4. `formula_evidence` 테이블은 신규 생성 (기존 없음). `drag_score = blocked_winner_rate × avg_missed_pnl`.
5. blocked_candidate_resolver는 APScheduler 1h 간격. formula_evidence_materializer는 daily 03:30 UTC.
6. `pattern_outcomes`의 실제 exit_return_pct와 `blocked_candidates.forward_24h` ≥ 50bps 비교로 `winner` 판정.

---

## Open Questions

1. `blocked_candidates`에 `source` 컬럼 추가 필요 여부 (`engine` vs `ai_agent`). 현재 미존재 — migration 047에 포함 예정.
2. `formula_evidence` compute 주기: daily 03:30 UTC vs. 매 resolve 후 incremental. 현재: daily batch.
3. W-0378 watch_only emit 시점: agent 명령 dispatch 직후 vs. LLM 응답 완료 후. 현재 설계: dispatch 직후.

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
| formula_evidence | 없음 | **NEW** — migration 047 |
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

### migration 047 — formula_evidence + filter_reason ENUM 확장 (현재 최신 migration: 046_ensemble_rounds)

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
- `entry_price` = `blocked_at` 시점의 OHLCV close (outcome_resolver와 동일 방식)
- `forward_Xh` = (close at blocked_at + Xh) / entry_price - 1.0
- **방향(direction)을 반영**: direction='long' → 상기 공식 그대로; 'short' → 부호 반전
- 데이터 없음(캔들 부족) → NULL 유지 (에러 아님)

#### 스케줄러 등록
`engine/scanner/scheduler.py` 에 추가:
```python
# W-0385: blocked candidate P&L resolver — hourly
_scheduler.add_job(
    _blocked_candidate_resolve_job,
    trigger="interval",
    hours=1,
    id="blocked_candidate_resolver",
    max_instances=1,
    coalesce=True,
    misfire_grace_time=600,
)
```

---

### `engine/research/formula_evidence_materializer.py`

#### 목적
매일 03:30 UTC, `blocked_candidates` + `pattern_outcomes` 를 join해 `formula_evidence` 를 계산한다.

```python
"""W-0385: Formula evidence materializer.

Runs daily at 03:30 UTC (after backtest_stats_refresh at 03:00).
For each filter_reason code and pattern_slug, computes:
  - blocked_winner_rate: proportion of blocked signals that would have been TP
  - good_block_rate: proportion that would have been SL/timeout
  - drag_score: blocked_winner_rate * avg_missed_pnl

"Winner" definition: forward_24h >= +50bps (configurable via DRAG_WIN_THRESHOLD_BPS env)
"""

DRAG_WIN_THRESHOLD_BPS = float(os.environ.get("DRAG_WIN_THRESHOLD_BPS", "50"))

def materialize_all(period_days: int = 30) -> int:
    """Compute formula_evidence for last N days. Returns rows written."""
    ...

def _compute_for_reason_code(reason: str, rows: list[dict]) -> dict:
    """
    rows: list of blocked_candidates with forward_* filled.
    Returns formula_evidence dict.

    blocked_winner_rate = len([r for r in rows if r['forward_24h'] >= DRAG_WIN_THRESHOLD_BPS/10000]) / len(rows)
    good_block_rate     = len([r for r in rows if r['forward_24h'] is not None and r['forward_24h'] < 0]) / len(rows)
    avg_missed_pnl      = mean(r['forward_24h'] for r in rows if r['forward_24h'] >= DRAG_WIN_THRESHOLD_BPS/10000)
    drag_score          = blocked_winner_rate * avg_missed_pnl * 10000  # bps로 변환
    """
    ...
```

#### 스케줄러 등록
```python
_scheduler.add_job(
    _formula_evidence_materialize_job,
    trigger="cron",
    hour=3,
    minute=30,
    id="formula_evidence_materializer",
    max_instances=1,
    coalesce=True,
    misfire_grace_time=1800,
)
```

---

### `engine/scanner/scheduler.py` 수정 — blocked emit

#### 목적 (Break B+ 수정 = W-0377 Break B의 확장)
`scheduler.py`의 MIN_BLOCKS gate 통과 실패 지점에서 `blocked_candidates` insert.

현재 코드 (차단 후 `continue`로 넘어감):
```python
if len(triggered_blocks) < min_blocks:
    continue   # <-- HERE: 차단 기록 없음
```

W-0385 수정:
```python
if len(triggered_blocks) < min_blocks:
    try:
        from research.blocked_candidate_store import emit_blocked_candidate
        emit_blocked_candidate(
            symbol=symbol,
            direction=direction,
            reason=_map_reason_code(triggered_blocks),  # filter_reason ENUM으로 매핑
            score=ensemble_score,
            p_win=ml_p_win,
        )
    except Exception:
        pass  # emit 실패는 scan 흐름 차단 안 함
    continue
```

`_map_reason_code(triggered_blocks: list[str]) -> str`:
```
"oi_hold_after_spike" → "below_min_conviction"
"btc_trend_bearish"   → "regime_mismatch"
"volume_thin"         → "insufficient_liquidity"
"duplicate_entry"     → "duplicate_signal"
"late_entry"          → "anti_chase"
default               → "below_min_conviction"
```

---

### `engine/research/blocked_candidate_store.py` (신규, 30줄 미만)

```python
"""W-0385: thin write layer for blocked_candidates.
Keeps scheduler.py clean — no direct Supabase calls there.
"""
from __future__ import annotations
from datetime import datetime, timezone

def emit_blocked_candidate(
    *,
    symbol: str,
    direction: str,
    reason: str,
    score: float | None = None,
    p_win: float | None = None,
    source: str = "engine",
    pattern_slug: str | None = None,
) -> None:
    """Insert one row into blocked_candidates. Fire-and-forget (no return value)."""
    from ledger.supabase_record_store import _sb
    _sb().table("blocked_candidates").insert({
        "symbol": symbol,
        "direction": direction,
        "reason": reason,
        "score": score,
        "p_win": p_win,
        "blocked_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "pattern_slug": pattern_slug,
    }).execute()
```

---

### W-0378 AI Agent hook (watch_only emit)

W-0378에서 `/scan`, `/similar`, `/explain` 명령 실행 시 아래 1줄 추가:
```python
# W-0385: watch_only event
emit_blocked_candidate(
    symbol=symbol,
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

**PR1 — migration + emit (1d)**
1. `app/supabase/migrations/047_formula_evidence.sql` (위 SQL)
2. `engine/research/blocked_candidate_store.py` (emit_blocked_candidate)
3. `engine/scanner/scheduler.py` — MIN_BLOCKS gate에 emit 추가
4. `engine/scanner/jobs/outcome_resolver.py` — executed 케이스 emit (source='engine', pattern_slug=..., outcome_id=...)
5. `engine/tests/test_blocked_candidate_store.py` — emit + reason mapping 2 tests

**PR2 — resolvers + materializer (2-3d)**
1. `engine/research/blocked_candidate_resolver.py` (forward P&L fill)
2. `engine/research/formula_evidence_materializer.py` (daily cron)
3. `engine/scanner/scheduler.py` — 두 job 등록
4. API: `engine/api/routes/research.py` 에 `/research/formula-evidence` + `/research/blocked-candidates` 추가
5. `engine/tests/test_formula_evidence.py` — materializer unit test (mock Supabase)

**PR3 — UI (2-3d)**
1. `app/src/routes/patterns/filter-drag/+page.svelte` 완성
2. `app/src/routes/patterns/formula/+page.svelte` 완성
3. `app/src/routes/lab/counterfactual/+page.svelte` scatter + timeline 확장
4. `app/src/routes/api/research/formula-evidence/+server.ts`
5. `app/src/routes/api/research/blocked-candidates/+server.ts`

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

- D1: `decision_events`를 별도 테이블로 만들지 않고 `blocked_candidates` 테이블을 확장한다. 이유: 이미 migration 044가 배포됐고, executed/watch_only 케이스도 `source` 컬럼으로 구분 가능.
- D2: `formula_evidence`는 read-only materialized view 대신 실제 테이블(매일 INSERT)로 구현. UI가 시계열 히스토리를 볼 수 있어야 하기 때문.
- D3: "winner" 판정 기준 = forward_24h >= 50bps (env로 오버라이드 가능). 24h를 주 기준으로 사용하는 이유: 1h는 노이즈가 많고, 72h는 채워지는 데 너무 오래 걸림.

## Next Steps

- drag_score가 높은 필터 룰을 W-0379 autoresearch proposer의 입력으로 사용 (별도 설계)
- AI Agent `/judge` 명령에서 formula_evidence를 컨텍스트로 주입 (W-0378 Phase 3)

## Handoff Checklist

- [ ] AC1~AC7 전부 체크
- [ ] migration 047 Supabase 적용 확인
- [ ] CURRENT.md W-0385 row 추가
- [ ] blocked_candidates resolver 1h 이후 smoke: NULL rows 감소 확인
