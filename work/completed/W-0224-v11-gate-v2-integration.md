# W-0224 — V-11 Gate v2 (G1~G7 + 기존 7 threshold 통합)

**Owner:** research
**Status:** Ready (PRD only)
**Type:** Extension of `engine/research/pattern_search.py:PromotionGatePolicy` (composition)
**Depends on:** V-01~V-08 (W-0217~W-0223)
**Effort:** 2 day implementation + 1 day test
**Parallel-safe:** ⚠️ V-08 머지 후 (전체 통합 layer)

---

## 0. 한 줄 요약

W-0214 §3.7 **G1~G7 acceptance gate**를 `pattern_search.py`의 기존 **`PromotionGatePolicy` 7 threshold**와 통합한 **gate v2**. F-60 marketplace 진입 게이트의 단일 진실. **augment-only**: 기존 PromotionGatePolicy/Report extension만.

## 1. Goal

W-0214 §3.7 + §4 F-60 Gate:
1. G1~G7 신규 acceptance (V-01~V-06 결과 활용)
2. 기존 PromotionGatePolicy 7 threshold 보존
3. 통합 GateV2Result: `(existing_7_pass) AND (new_G1_to_G7_pass)`
4. F-60 marketplace 진입 단일 진실

## 2. Owner

research (CTO + AI Researcher 공동)

## 3. Scope

| 파일 | 변경 |
|---|---|
| `engine/research/validation/gates.py` | new |
| `engine/research/validation/test_gates.py` | new |
| `engine/research/pattern_search.py` | **read-only** (PromotionGatePolicy/Report import) |

## 4. Non-Goals

- ❌ pattern_search.py 수정 (V-00 augment-only)
- ❌ F-60 marketplace API (별도 W-0229 또는 H-07 후속)
- ❌ Layer B (verdict accuracy) 측정 (H-08 별도)
- ❌ User-facing UI (V-10)

## 5. Exit Criteria

```
[ ] GateV2Config dataclass (existing_policy: PromotionGatePolicy, new_thresholds: dict)
[ ] GateV2Result dataclass (existing_pass: bool, new_passes: dict[Gate, bool], overall_pass: bool)
[ ] evaluate_gate_v2(validation_report: ValidationReport, existing_promotion: PromotionReport) → GateV2Result
[ ] Layer A boolean: G1~G7 모두 pass
[ ] F-60 = Layer A AND Layer B (Layer B는 외부 H-08에서 주입)
[ ] unit test ≥15 case (모든 조합: 1pass/2pass/all_pass/all_fail)
[ ] integration: 1 P0 pattern × ValidationReport (V-08) → GateV2Result
[ ] performance: <100ms (composition only)
```

## 6. CTO 설계

```python
# engine/research/validation/gates.py
from dataclasses import dataclass, field
from enum import Enum

from engine.research.pattern_search import (
    PromotionGatePolicy, PromotionReport,  # composition
    DEFAULT_PROMOTION_GATE_POLICY,
)
from .pipeline import ValidationReport, HorizonReport  # V-08

class GateID(Enum):
    G1 = "t-stat ≥ 2 (BH)"
    G2 = "DSR > 0"
    G3 = "PurgedKFold pass"
    G4 = "Bootstrap CI excludes 0"
    G5 = "Ablation drop ≥ 0.3%"
    G6 = "Sequence monotonic"
    G7 = "Regime gate ok"

@dataclass(frozen=True)
class GateV2Config:
    """기존 7 threshold + 신규 G1~G7 통합."""
    existing_policy: PromotionGatePolicy = field(default_factory=lambda: DEFAULT_PROMOTION_GATE_POLICY)
    # 신규 G1~G7 threshold
    g1_t_threshold: float = 2.0
    g2_dsr_threshold: float = 0.0
    g3_purged_kfold_min_folds_pass: int = 3       # 5 fold 중 3 통과
    g4_ci_exclude_zero: bool = True
    g5_ablation_critical_threshold_pct: float = 0.3
    g6_max_monotonic_violation: int = 0
    g7_regime_pass_count: int = 1                 # 최소 1 regime 통과

@dataclass(frozen=True)
class GateV2Result:
    pattern_slug: str
    existing_pass: bool                            # PromotionReport.decision == "promote_candidate"
    g1_pass: bool
    g2_pass: bool
    g3_pass: bool
    g4_pass: bool
    g5_pass: bool
    g6_pass: bool
    g7_pass: bool
    new_passes: dict                                # {G1~G7: bool}
    layer_a_pass: bool                              # ALL of G1~G7 + existing
    layer_b_pass: bool | None = None                # H-08 주입
    f60_pass: bool | None = None                    # Layer A AND Layer B
    rejection_reasons: tuple[str, ...] = ()

def evaluate_gate_v2(
    validation_report: ValidationReport,
    existing_promotion: PromotionReport,
    *, config: GateV2Config = GateV2Config(),
    layer_b_pass: bool | None = None,
) -> GateV2Result:
    """W-0214 §3.7 G1~G7 + 기존 PromotionGatePolicy 통합."""
    # G1: t-stat 통과 (validation_report에서 평균)
    g1_pass = any(h.t_vs_b0 >= config.g1_t_threshold and h.p_bh_vs_b0 < 0.05
                  for h in validation_report.horizon_reports)
    # G2: DSR > 0
    g2_pass = any(h.dsr > config.g2_dsr_threshold for h in validation_report.horizon_reports)
    # G3: PurgedKFold pass — V-01 결과는 ValidationReport에 fold count 필요
    g3_pass = True  # placeholder, V-08 ValidationReport에 fold_pass_count 추가 필요
    # G4: Bootstrap CI excludes 0
    g4_pass = any(h.bootstrap_ci[0] > 0 for h in validation_report.horizon_reports)
    # G5: Ablation — V-03 결과 필요 (외부 주입)
    g5_pass = True  # placeholder, V-03 결과 ValidationReport.ablation_results 추가
    # G6: Sequence monotonic — V-04 결과 필요
    g6_pass = True  # placeholder
    # G7: Regime — V-05 결과 필요
    g7_pass = True  # placeholder

    new_passes = {
        GateID.G1: g1_pass, GateID.G2: g2_pass, GateID.G3: g3_pass,
        GateID.G4: g4_pass, GateID.G5: g5_pass, GateID.G6: g6_pass, GateID.G7: g7_pass,
    }
    existing_pass = existing_promotion.decision == "promote_candidate"
    layer_a_pass = existing_pass and all(new_passes.values())
    f60_pass = (layer_a_pass and layer_b_pass) if layer_b_pass is not None else None

    rejection_reasons = []
    if not existing_pass:
        rejection_reasons.append(f"existing PromotionReport: {existing_promotion.rejection_reasons}")
    for gate_id, passed in new_passes.items():
        if not passed:
            rejection_reasons.append(f"{gate_id.name} fail")
    if layer_b_pass is False:
        rejection_reasons.append("Layer B (verdict accuracy) fail")

    return GateV2Result(
        pattern_slug=validation_report.pattern_slug,
        existing_pass=existing_pass,
        g1_pass=g1_pass, g2_pass=g2_pass, g3_pass=g3_pass,
        g4_pass=g4_pass, g5_pass=g5_pass, g6_pass=g6_pass, g7_pass=g7_pass,
        new_passes=new_passes,
        layer_a_pass=layer_a_pass,
        layer_b_pass=layer_b_pass,
        f60_pass=f60_pass,
        rejection_reasons=tuple(rejection_reasons),
    )
```

## 7. AI Researcher 설계

### 7.1 W-0214 §4 F-60 Gate 정합

W-0214 §4: "F-60 = Layer A (객관 통계) AND Layer B (유저 verdict)".

→ Layer A = `existing_promotion AND G1~G7`. Layer B = H-08 verdict accuracy ≥ 0.55 + n ≥ 200.

### 7.2 G3 fold_pass_count 임계

5 fold 중 3 통과 (config.g3_purged_kfold_min_folds_pass=3) — majority. F1 측정과 일관.

## 8. Quant Trader 설계

### 8.1 기존 7 threshold + 신규 7 = 14 gate

복잡도 우려. 하지만 augment-only로 보존 필수 (기존 promotion 데이터 backward compatible).

### 8.2 Performance

V-11은 composition only — V-08 결과 + PromotionReport input. <100ms.

## 9. Risk

| Risk | Impact | Mitigation |
|---|---|---|
| G3/G5/G6/G7 placeholder (V-08 ValidationReport에 fold/ablation/sequence/regime 부재) | 높음 | V-08 spec 확장 (ValidationReport에 sub-results 추가) |
| existing PromotionGatePolicy 변경 (V-00 위반) | 중 | composition only enforce |
| Layer B 부재 시 f60_pass=None — F-60 unable to decide | 중 | config로 명시 (None=block / True=skip Layer B) |

## 10. Open Questions

- Q1: G3~G7 placeholder을 V-11에서 직접 측정 vs V-08 ValidationReport에 통합? → V-08 확장 (ValidationReport.sub_results) 권장.
- Q2: Layer B None 처리 default? → block (보수적).
- Q3: 기존 PromotionGatePolicy 7 threshold + 신규 7 = 14 게이트 too many? → ADR로 일부 deprecate 후속.

## 11. Acceptance Test

```bash
test -f engine/research/validation/gates.py
cd engine && pytest research/validation/test_gates.py -v
git diff origin/main -- engine/research/pattern_search.py
# → 0 lines
```

## 12. Cross-references

- W-0214 §3.7 G1~G7 + §4 F-60 Gate
- W-0215 §14.6 (Gates × functions, 기존 7 threshold)
- W-0221 V-08 ValidationReport (input)
- W-0220 V-06 stats (G1/G2/G4)
- H-08 verdict accuracy (Layer B 외부)

## 13. Next

- V-08 ValidationReport 확장 (sub_results: fold/ablation/sequence/regime)
- F-60 marketplace API (W-0229)
- Hunter UI gate display (V-10)

---

*W-0224 v1.0 created 2026-04-27 by Agent A033 — V-11 gate v2 PRD with 3-perspective sign-off.*

---

## Goal
§1 — G1~G7 + 기존 PromotionGatePolicy 7 통합 gate v2.

## Owner
§2 — research

## Scope
§3 — `validation/gates.py` 신규.

## Non-Goals
§4 — pattern_search.py X / F-60 API X / Layer B X / UI X.

## Canonical Files
§3 — `gates.py`, `test_gates.py`.

## Facts
§7.1 — W-0214 §4 F-60 Layer A AND B. §3.7 G1~G7. W-0215 §14.6 기존 7.

## Assumptions
§9 — V-08 ValidationReport에 sub_results 확장 가능.

## Open Questions
§10 Q1~Q3 (G3~G7 위치, Layer B None default, 14 gate 복잡도).

## Decisions
augment-only PromotionGatePolicy 보존 + 신규 G1~G7 추가. F-60 = Layer A AND Layer B.

## Next Steps
§13 — V-08 확장 + F-60 API + V-10 UI.

## Exit Criteria
§5 — Config + Result + evaluate 함수 + unit test 15+ + perf <100ms.

## Handoff Checklist
- [x] PRD v1.0
- [ ] Issue 등록
- [ ] V-08 머지 후 시작
- [ ] H-08 Layer B 통합
