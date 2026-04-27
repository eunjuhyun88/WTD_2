# W-0223 — V-05 Regime-conditional Return (M4)

**Owner:** research
**Status:** Ready (PRD only)
**Type:** New module (`engine/research/validation/regime.py`)
**Depends on:** V-02 (W-0218), V-06 (W-0220)
**Effort:** 2 day implementation + 1 day test
**Parallel-safe:** ⚠️ V-02 머지 후

---

## 0. 한 줄 요약

W-0214 §3.2 **M4 Regime-conditional Return** — BTC 30d return regime (bull/bear/range)별 M1 측정. **regime gate (G7) 트리거**: 한 regime에서 t<0 + 다른 regime t>2이면 패턴은 그 regime에서만 활성.

## 1. Goal

W-0214 §3.2 M4 + §3.7 G7:
1. BTC 30d return regime 라벨링 (bull >+10%, bear <-10%, range otherwise)
2. regime별 V-02 M1 재측정
3. dashboard 노출
4. regime-conditional gate 강제 (한 regime에만 활성)

## 2. Owner

research

## 3. Scope

| 파일 | 변경 |
|---|---|
| `engine/research/validation/regime.py` | new |
| `engine/research/validation/test_regime.py` | new |
| `engine/research/pattern_search.py` | **read-only** (`build_*_recommendations` 부분 활용) |

## 4. Non-Goals

- ❌ pattern_search.py 수정
- ❌ Regime forecasting (예측) — current label only
- ❌ Volatility regime / Funding regime (W-0226+ Quant Realism extension)

## 5. Exit Criteria

```
[ ] RegimeLabel enum (BULL / BEAR / RANGE)
[ ] label_regime(btc_return_30d_pct) → RegimeLabel
[ ] RegimeConditionalReturn dataclass (per regime: M1 result + n)
[ ] measure_regime_conditional_return(pattern, phase, btc_klines) → list[RegimeConditionalReturn]
[ ] regime_gate(results, t_threshold=2, t_neg_threshold=0) → dict[regime, bool]
[ ] V-02 phase_eval composition
[ ] unit test ≥10 case
[ ] integration: 1 P0 pattern × 3 regimes → 3 RegimeConditionalReturn
[ ] performance: <60s per (pattern, horizon)
```

## 6. CTO 설계

```python
# engine/research/validation/regime.py
from dataclasses import dataclass
from enum import Enum
import numpy as np
import pandas as pd

from .phase_eval import measure_phase_conditional_return

class RegimeLabel(Enum):
    BULL = "bull"
    BEAR = "bear"
    RANGE = "range"

def label_regime(btc_return_30d_pct: float, *,
                 bull_threshold: float = 10.0,
                 bear_threshold: float = -10.0) -> RegimeLabel:
    if btc_return_30d_pct >= bull_threshold:
        return RegimeLabel.BULL
    if btc_return_30d_pct <= bear_threshold:
        return RegimeLabel.BEAR
    return RegimeLabel.RANGE

@dataclass(frozen=True)
class RegimeConditionalReturn:
    regime: RegimeLabel
    pattern_slug: str
    horizon_hours: int
    n_samples: int
    mean_return_pct: float
    std_return_pct: float
    samples: tuple[float, ...]

def measure_regime_conditional_return(
    pattern, phase, entry_timestamps,
    btc_klines: pd.DataFrame,  # 'close' column
    *, horizon_hours: int = 4, cost_bps: float = 15.0,
) -> list[RegimeConditionalReturn]:
    """W-0214 §3.2 M4. BTC 30d return regime split → V-02 호출."""
    btc_30d_returns = btc_klines["close"].pct_change(periods=30 * 24) * 100  # 1h bar
    grouped = {RegimeLabel.BULL: [], RegimeLabel.BEAR: [], RegimeLabel.RANGE: []}
    for ts in entry_timestamps:
        # find btc 30d return at ts
        idx = btc_30d_returns.index.searchsorted(ts) - 1
        if idx < 0:
            continue
        regime = label_regime(float(btc_30d_returns.iloc[idx]))
        grouped[regime].append(ts)
    results = []
    for regime, ts_list in grouped.items():
        if not ts_list:
            continue
        m1 = measure_phase_conditional_return(
            pattern_slug=pattern.slug, phase_name=phase.name,
            entry_timestamps=ts_list,
            symbol=..., timeframe=..., horizon_hours=horizon_hours,
            cost_bps=cost_bps,
        )
        results.append(RegimeConditionalReturn(
            regime=regime, pattern_slug=pattern.slug,
            horizon_hours=horizon_hours,
            n_samples=m1.n_samples,
            mean_return_pct=m1.mean_return_pct,
            std_return_pct=m1.std_return_pct,
            samples=m1.samples,
        ))
    return results

def regime_gate(
    results: list[RegimeConditionalReturn],
    *, t_pos_threshold: float = 2.0, t_neg_threshold: float = 0.0,
) -> dict[RegimeLabel, bool]:
    """G7 acceptance. 한 regime에서 t<0 + 다른 regime t>2이면 그 regime만 활성."""
    from .stats import welch_t_test  # V-06
    # baseline = all regime returns
    all_samples = np.concatenate([r.samples for r in results]) if results else []
    pass_per_regime = {}
    for r in results:
        if not all_samples.size:
            pass_per_regime[r.regime] = False
            continue
        t = welch_t_test(r.samples, all_samples, alternative="greater")
        pass_per_regime[r.regime] = (t.t_statistic >= t_pos_threshold)
    return pass_per_regime
```

## 7. AI Researcher 설계

### 7.1 Regime threshold 근거

W-0214 §3.2 M4 spec: "BTC 30d return 기반 regime 라벨링". ±10% threshold는 임의 default (학술 표준 X).

→ Crypto perp 일반 ±10% 30d return은 합리적 split. Sensitivity test 권장 (±5% / ±15%).

### 7.2 G7 acceptance 정합

W-0214 §3.7 G7: "regime-conditional gate ok — 한 regime에서 t<0 + 다른 regime에서 t>2이면 regime-conditional gate 강제 (해당 패턴은 그 regime에서만 활성)".

→ regime_gate() 함수가 dict[regime, bool] 반환. V-11 gate v2에서 활성 regime list로 변환.

## 8. Quant Trader 설계

### 8.1 Volatility regime 추가 (W-0226+)

현재 V-05는 BTC return regime. Quant 표준은 추가:
- volatility regime (rolling_std / ATR z-score)
- funding regime (positive/negative)
- liquidity regime (volume z-score)

→ V-05 v1.0에는 BTC return only. W-0226+에서 multi-dimensional regime으로 확장.

### 8.2 Regime sensitivity

regime threshold ±10% sensitivity test (V-08 pipeline에서 ±5%, ±10%, ±15% 비교).

## 9. Risk

| Risk | Impact | Mitigation |
|---|---|---|
| BTC kline 부재 (cache miss) | 높음 | early return + log |
| 30d window edge (n<30d) | 중 | skip + warn |
| Regime change rapid → 라벨 noise | 중 | rolling 7d 평균 (옵션) |
| Single regime n<30 | 중 | regime별 min_n 강제 |

## 10. Open Questions

- Q1: BTC 30d threshold ±10% vs ±5% sensitivity? → V-08에서 검증.
- Q2: Vol regime 우선순위? → V-05 v1.0 BTC only, vol은 W-0226.
- Q3: Regime 변경 시점에서 pattern 진입은 어느 regime? → entry_ts 기준 fixed.

## 11. Acceptance Test

```bash
test -f engine/research/validation/regime.py
cd engine && pytest research/validation/test_regime.py -v
git diff origin/main -- engine/research/pattern_search.py
# → 0 lines
```

## 12. Cross-references

- W-0214 §3.2 M4 + §3.7 G7
- W-0215 §14.4 M4 매핑 (build_*_recommendations 부분)
- W-0218 V-02 composition

## 13. Next

- V-08 pipeline 통합 (regime split + 임계 검증)
- V-11 gate v2 (G7)
- W-0226 vol/funding/liquidity regime 확장

---

*W-0223 v1.0 created 2026-04-27 by Agent A033 — V-05 regime test PRD with 3-perspective sign-off.*

---

## Goal
§1 — M4 regime-conditional return. BTC 30d return label.

## Owner
§2 — research

## Scope
§3 — `validation/regime.py` 신규.

## Non-Goals
§4 — vol/funding regime W-0226+ / forecasting X / pattern_search.py X.

## Canonical Files
§3 — `regime.py`, `test_regime.py`.

## Facts
§7.1 — BTC 30d ±10% default (sensitivity 검증 후속). W-0214 §3.2 M4.

## Assumptions
§9 — BTC kline 가용, n>=30d window.

## Open Questions
§10 Q1~Q3.

## Decisions
v1.0 BTC return only. Multi-dim W-0226+ ADR.

## Next Steps
§13 — V-08 + V-11 + W-0226.

## Exit Criteria
§5 — enum + dataclass + 2 함수 + unit test 10+ + perf <60s.

## Handoff Checklist
- [x] PRD v1.0
- [ ] Issue 등록
- [ ] V-02 머지 후 시작
