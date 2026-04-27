# W-0218 — V-02 Phase-Conditional Forward Return (M1)

**Owner:** research
**Status:** Ready (PRD only, depends on W-0215 V-00 audit ✅, W-0217 V-01 cv.py)
**Type:** New module (`engine/research/validation/phase_eval.py`)
**Depends on:** W-0214 v1.3 §3.2 M1, W-0215 §14.4, W-0217 V-01 (PurgedKFold)
**Estimated effort:** 2 day implementation + 1 day test = 3 day total
**Parallel-safe with V-01:** ⚠️ semi-independent (V-02는 V-01 split 사용 권장)

---

## 0. 한 줄 요약

W-0214 §3.2 **M1 Phase-conditional Forward Return** 측정 모듈. `pattern_search.py` `_measure_forward_peak_return` (peak only)을 **extension**으로 wrapping하여 (a) peak return 그대로 + (b) **mean return at horizon h** 추가. F1 measurement (W-0216) 의 핵심 input.

## 1. Goal

W-0214 §3.2 M1 spec 구현:
1. phase k 진입 시점에서 forward return 분포 측정 (h ∈ {1h, 4h, 24h})
2. cost 차감 (W-0214 D3 = 15bps round-trip)
3. random baseline (B0) 비교용 sample 수집
4. F1 measurement input (5 P0 patterns × 3 horizons = 15 tests)

## 2. Owner

research (CTO + AI Researcher 공동 sign-off, F1 trigger)

## 3. Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/research/validation/phase_eval.py` | new | M1 측정 모듈 |
| `engine/research/validation/test_phase_eval.py` | new | unit + integration test |
| `engine/research/pattern_search.py` | **read-only** | extension은 phase_eval.py 측에서 |
| `work/active/W-0214-mm-hunter-core-theory-and-validation.md` | edit (§3.2 impl 링크) | spec → impl |

## 4. Non-Goals

- ❌ `pattern_search.py` 수정 (V-00 augment-only)
- ❌ t-stat / BH / DSR / bootstrap CI (V-06 stats.py)
- ❌ M2/M3/M4 측정 (V-03/V-04/V-05)
- ❌ B0~B3 baseline 자체 정의 (V-08 pipeline.py)
- ❌ Sharpe / drawdown / VaR (W-0226+)

## 5. Exit Criteria

```
[ ] phase_eval.py — `measure_phase_conditional_return()` 함수 구현
[ ] horizons: list[int] = [1, 4, 24] 지원 (1h/4h/24h)
[ ] cost_bps: float = 15.0 default (W-0214 D3)
[ ] return type: PhaseConditionalReturn dataclass (mean / median / std / n / horizon / cost)
[ ] _measure_forward_peak_return composition 호출 (re-implementation X)
[ ] unit test ≥15 case (edge: cost=0, n<10, horizon mismatch, no future bars)
[ ] integration test: 1개 P0 pattern × 1년 holdout × 3 horizons = 1개 PhaseConditionalReturn × 3
[ ] performance: <2s per (pattern, horizon) on 1년 1h bar (8760 bars)
[ ] CV integration: PurgedKFold (V-01) split 위에서 fold별 측정 가능
```

## 6. CTO 설계

### 6.1 API spec

```python
# engine/research/validation/phase_eval.py

from dataclasses import dataclass
from typing import Iterable
import numpy as np
import pandas as pd
from datetime import datetime

from engine.research.pattern_search import (
    _measure_forward_peak_return,  # composition 사용
    BenchmarkCase, ReplayBenchmarkPack
)

@dataclass(frozen=True)
class PhaseConditionalReturn:
    """W-0214 §3.2 M1 측정 결과."""
    pattern_slug: str
    phase_name: str             # 진입 phase 이름
    horizon_hours: int          # 1, 4, 24
    cost_bps: float             # 15.0 default (D3)

    n_samples: int              # phase 진입 시점 수
    mean_return_pct: float      # mean forward return at h, cost 차감 후
    median_return_pct: float
    std_return_pct: float       # 표준편차
    min_return_pct: float
    max_return_pct: float

    # peak (W-0086 호환 — pattern_search.py에서 가져옴)
    mean_peak_return_pct: float | None   # peak return at h (legacy)
    realistic_mean_pct: float | None     # next_open + slippage 적용

    # raw samples (B0 비교용)
    samples: tuple[float, ...]  # frozen tuple


def measure_phase_conditional_return(
    *,
    pattern_slug: str,
    phase_name: str,
    entry_timestamps: Iterable[datetime],
    symbol: str,
    timeframe: str,
    horizon_hours: int,
    cost_bps: float = 15.0,
    bars_per_hour: int = 1,
) -> PhaseConditionalReturn:
    """W-0214 §3.2 M1: phase k 진입 시점에서 forward return 측정.

    Returns at h: (price[t+h] - price[t+1]) / price[t+1] - cost
    where price[t+1] = next bar's open (realistic entry)

    Augment-only: pattern_search.py._measure_forward_peak_return 호출 후 mean 추가.
    """
    horizon_bars = horizon_hours * bars_per_hour
    samples = []
    samples_peak = []
    samples_realistic = []
    for entry_ts in entry_timestamps:
        # composition: 기존 함수 호출
        entry_close, peak_pct, entry_next_open, realistic_peak_pct = \
            _measure_forward_peak_return(
                symbol=symbol,
                timeframe=timeframe,
                entry_ts=entry_ts,
                horizon_bars=horizon_bars,
                entry_slippage_pct=0.05,  # 5bps slip (W-0214 D3 fee 10 + slip 5 = 15bps)
            )
        if entry_close is None:
            continue
        # NEW (V-02 extension): mean at horizon h, not peak
        # Use forward window's last close, not peak.
        klines = _load_klines_via_cache(symbol, timeframe)  # helper
        return_at_h = _compute_return_at_horizon(klines, entry_ts, horizon_bars, entry_next_open or entry_close)
        if return_at_h is not None:
            # cost 차감
            return_net = return_at_h - cost_bps / 100.0  # bps → pct
            samples.append(return_net)
        if peak_pct is not None:
            samples_peak.append(peak_pct - cost_bps / 100.0)
        if realistic_peak_pct is not None:
            samples_realistic.append(realistic_peak_pct - cost_bps / 100.0)
    if not samples:
        return PhaseConditionalReturn(
            pattern_slug=pattern_slug, phase_name=phase_name,
            horizon_hours=horizon_hours, cost_bps=cost_bps,
            n_samples=0, mean_return_pct=0, median_return_pct=0, std_return_pct=0,
            min_return_pct=0, max_return_pct=0,
            mean_peak_return_pct=None, realistic_mean_pct=None,
            samples=()
        )
    arr = np.array(samples)
    return PhaseConditionalReturn(
        pattern_slug=pattern_slug, phase_name=phase_name,
        horizon_hours=horizon_hours, cost_bps=cost_bps,
        n_samples=len(samples),
        mean_return_pct=float(arr.mean()),
        median_return_pct=float(np.median(arr)),
        std_return_pct=float(arr.std()),
        min_return_pct=float(arr.min()),
        max_return_pct=float(arr.max()),
        mean_peak_return_pct=float(np.mean(samples_peak)) if samples_peak else None,
        realistic_mean_pct=float(np.mean(samples_realistic)) if samples_realistic else None,
        samples=tuple(samples),
    )
```

### 6.2 Helper 함수

```python
def _compute_return_at_horizon(
    klines: pd.DataFrame,
    entry_ts: datetime,
    horizon_bars: int,
    entry_price: float,
) -> float | None:
    """forward return at exact horizon h (mean, not peak)."""
    entry_mask = klines.index >= entry_ts
    if not entry_mask.any():
        return None
    entry_pos = int(entry_mask.nonzero()[0][0])
    target_pos = entry_pos + horizon_bars
    if target_pos >= len(klines):
        return None
    target_close = float(klines.iloc[target_pos]["close"])
    return (target_close - entry_price) / entry_price * 100.0
```

→ `_compute_return_at_horizon`은 phase_eval 내부 helper. `_measure_forward_peak_return`은 외부 함수 (composition).

### 6.3 PurgedKFold 통합

```python
def measure_phase_conditional_return_with_cv(
    *, pattern, phase, entry_timestamps, symbol, timeframe,
    horizon_hours, cost_bps=15.0, cv_config=PurgedKFoldConfig()
) -> list[PhaseConditionalReturn]:
    """V-01 PurgedKFold split 위에서 fold별 M1 측정."""
    splitter = PurgedKFold(cv_config)
    timestamps_idx = pd.DatetimeIndex(entry_timestamps)
    results = []
    for train_idx, test_idx in splitter.split(timestamps_idx):
        test_timestamps = [entry_timestamps[i] for i in test_idx]
        result = measure_phase_conditional_return(
            pattern_slug=pattern.slug, phase_name=phase.name,
            entry_timestamps=test_timestamps,
            symbol=symbol, timeframe=timeframe,
            horizon_hours=horizon_hours, cost_bps=cost_bps,
        )
        results.append(result)
    return results
```

→ V-01 (W-0217)과 통합. F1 measurement에서 fold별 t-stat 계산 가능.

## 7. AI Researcher 설계

### 7.1 W-0214 §3.2 spec 정합성

**spec**:
```
for each (pattern, phase k, timestamp t in holdout):
    R(t, h) = (price[t+h] - price[t]) / price[t] - cost(t)
    where h ∈ {1h, 4h, 24h}, cost = fee + slippage estimate
collect: R_phase_k = {R(t, h) : phase k entered at t}
```

**구현 매핑**:
- `R(t, h)` → `_compute_return_at_horizon` (target_close vs entry_price, percent)
- `price[t]` → entry_next_open (realistic) 또는 entry_close (paper)
- `cost(t)` → `cost_bps` 차감 (round-trip 15bps default)

→ spec과 일치 ✅.

### 7.2 baseline (B0) hook

phase 미진입 시점에서도 동일 horizon return 측정 가능:
```python
def measure_random_baseline(
    *, n_samples: int, klines: pd.DataFrame,
    horizon_hours: int, cost_bps: float = 15.0
) -> PhaseConditionalReturn:
    """B0 random time baseline."""
    np.random.seed(42)  # reproducible
    indices = np.random.choice(len(klines) - horizon_hours, n_samples, replace=False)
    timestamps = klines.index[indices].tolist()
    return measure_phase_conditional_return(
        pattern_slug="__random__", phase_name="random",
        entry_timestamps=timestamps,
        symbol=..., timeframe=..., horizon_hours=horizon_hours,
        cost_bps=cost_bps,
    )
```

→ V-08 pipeline.py에서 `B0 = measure_random_baseline(n=len(R_phase_k))` 호출.

### 7.3 W-0214 acceptance criteria 매핑

W-0214 §3.2 M1 acceptance:
- `directional_belief == "long_entry"` phase: t ≥ 2.0 (BH 보정 후), p < 0.05
- `directional_belief == "avoid_entry"` phase: t ≤ −1.5 또는 mean ≤ 0

→ V-02 출력 (mean / std / n) → V-06 stats.py에서 t-stat 계산 → V-11 gates.py에서 임계 검증.

## 8. Quant Trader 설계

### 8.1 Cost model 명시 (W-0214 D3 위반 차단)

**현재 `pattern_search.py`**: `entry_slippage_pct=0.1` (10bps one-way), fee 부재.

**W-0214 D3**: round-trip 15bps = 10bps fee + 5bps slip.

**V-02 구현**:
- `cost_bps: float = 15.0` default (round-trip)
- `entry_slippage_pct=0.05` (5bps one-way → call to `_measure_forward_peak_return`)
- 추가로 `cost_bps - 5*2 = 5bps`는 fee 분 — phase_eval에서 직접 차감

→ Quant 표준 cost 명시. **D3 정합성 ✅**.

### 8.2 Slippage source

V-02는 `entry_next_open` 사용 (realistic entry). Slippage는 5bps fixed.
V-08 pipeline에서 향후 orderbook depth 기반으로 확장 (W-0226 Capacity).

### 8.3 Performance

```
n_phase_entries = 200 (1년 1h bar에서 phase 진입)
horizon = 4 bars (4h)
1 entry: load_klines (cache hit, ~10ms) + slice + compute = ~50ms
200 entries × 50ms = 10s

Target: <2s per (pattern, horizon) → 200 entries 동시 batch
→ klines 1번 load 후 vectorized slice
```

**최적화 plan**:
- klines 1회 load → 메모리 보관
- entry_timestamps로 `np.searchsorted` → vectorized slice
- 200 entries × vectorized = ~500ms ✅

### 8.4 Sharpe-ready metric

V-02는 mean / std 반환. V-06 stats.py에서:
```python
sharpe = result.mean_return_pct / result.std_return_pct * np.sqrt(252 * 24 / horizon_hours)
```

→ annualized Sharpe (1h bar 기준 252 trading days × 24 hours).

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `pattern_search.py` 수정 (V-00 위반) | 중 | 높음 | composition only |
| Cost double-counting (slip 5 + 5) | 중 | 중 | 명시 docstring + test |
| klines cache miss (data_cache.loader.CacheMiss) | 중 | 중 | try/except + skip + log |
| Horizon이 forward window 초과 (entry_pos + h ≥ len) | 고 | 저 | None 반환 + skip |
| Phase 진입 timestamp가 정렬 안 됨 | 저 | 저 | sort + dedup |

## 10. Open Questions

- **Q1**: Peak vs mean — F1 measurement는 mean 사용 (Welch t-test). Peak은 legacy 호환만 (PromotionGatePolicy.min_entry_profit_pct). → Q1 Accept.
- **Q2**: Cost 5bps slip + 10bps fee separately or 15bps single? → 단일 `cost_bps` (Quant 일반).
- **Q3**: phase 진입 정의 — `entry_hit=True` 케이스만? Or PatternStateMachine phase transition? → V-08에서 명시.

## 11. Acceptance Test (Bash)

```bash
# 1. 모듈 존재
test -f engine/research/validation/phase_eval.py
test -f engine/research/validation/test_phase_eval.py

# 2. Unit test
cd engine && pytest research/validation/test_phase_eval.py -v
# → ≥15 test, all pass

# 3. pattern_search.py augment-only
git diff origin/main -- engine/research/pattern_search.py
# → 0 lines

# 4. CV integration smoke
cd engine && python -c "
from research.validation.phase_eval import measure_phase_conditional_return_with_cv
from research.validation.cv import PurgedKFoldConfig
result = measure_phase_conditional_return_with_cv(
    pattern=..., phase=..., entry_timestamps=[...],
    symbol='BTCUSDT', timeframe='1h', horizon_hours=4,
    cv_config=PurgedKFoldConfig(n_splits=5)
)
assert len(result) == 5
"
```

## 12. Cross-references

- W-0214 v1.3 §3.2 M1 (spec)
- W-0215 §14.4 Table 3 (M1 매핑)
- W-0217 V-01 PurgedKFold (CV integration)
- W-0216 §15 F1 strengthened (Sharpe + DSR)
- López de Prado (2018) Ch 7 (CV)

## 13. Next (V-02 머지 후)

- W-0220 V-06 stats.py (t-stat / DSR / BH / bootstrap) — F1 임계 검증
- W-0219 V-03 ablation (M2 leave-one-out)
- W-0221 V-08 pipeline (V-01 + V-02 + V-06 통합 + B0~B3 baseline)
- F1 measurement 시작 (W-0216 Week 1)

---

*W-0218 v1.0 created 2026-04-27 by Agent A033 — V-02 phase_eval PRD with 3-perspective sign-off.*

---

## Goal

§1 참조. W-0214 §3.2 M1 — phase k 진입 시점 forward return 측정. composition wrap of `_measure_forward_peak_return` + 신규 mean at horizon h.

## Owner

§2 — research (F1 trigger)

## Scope

§3 — `engine/research/validation/phase_eval.py` 신규 + test.

## Non-Goals

§4 — pattern_search.py 수정 X / t-stat 직접 계산 X (V-06) / B0~B3 정의 X (V-08).

## Canonical Files

§3 — `phase_eval.py`, `test_phase_eval.py`.

## Facts

§7.1 W-0214 §3.2 spec 정합. `R(t,h) = (price[t+h] - price[t]) / price[t] - cost`.

## Assumptions

§9 Risk register. cost double-counting, klines cache miss, horizon overflow.

## Open Questions

§10 Q1~Q3 (peak vs mean, cost 5+10 vs 15, phase entry 정의).

## Decisions

cost_bps=15.0 default (W-0214 D3 round-trip). composition only (V-00 augment-only).

## Next Steps

§13 — V-06 (W-0220) stats.py + V-08 (W-0221) pipeline 통합 → F1 measurement.

## Exit Criteria

§5 — measure_phase_conditional_return 구현 / horizons [1,4,24] / cost_bps=15 / unit test 15+ / perf <2s.

## Handoff Checklist

- [x] PRD v1.0 published
- [ ] Issue #421 implementation 시작
- [ ] phase_eval.py 구현 + 15+ unit test
- [ ] V-01 cv.py와 통합 검증
