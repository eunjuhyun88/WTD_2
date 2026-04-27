# W-0258 — MM Hunter Augment Priority B2: D5 F-60 Gate Layer B (Subjective)

> Wave: MM Hunter Track 2 | Priority: **P1** (M3 출시 전) | Effort: **M (2d)**
> Charter: ✅ In-Scope L5 Search + L7 Refinement
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-27 by Agent A045
> Depends on: W-0256 augment 머지 (PromotionGatePolicy 확장 후)

---

## Goal (1줄)

W-0252 audit에서 식별된 🟡 갭 D5 (F-60 gate가 Layer A objective만 지원, Layer B subjective override 없음)를 **augment-only**로 해소하여 W-0214 D5 lock-in (Layer A AND B 둘 다 통과 필수)을 충족한다.

## Scope

### 포함
- `PromotionGatePolicy`에 `require_subjective_gate: bool = False` 추가
- `PromotionGatePolicy`에 `subjective_gate_signature: str | None = None` 추가 (subjective 결재자 ID 저장)
- `PromotionReport`에 `subjective_gate_passed: bool | None = None` 추가
- `build_promotion_report`에 layer_b 분기 추가 — Layer A AND B 결합 결정
- 기존 strict / trading_edge 분기는 Layer A로 유지 (backward-compatible)

### Non-Scope
- ❌ Subjective gate UI (별도 work item, F-11 Dashboard와 통합)
- ❌ Subjective gate 결재 워크플로우 (signature 데이터 모델만 augment, 워크플로우는 별도)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `require_subjective_gate=False` default가 production 무영향 보장 | 낮 | 상 | 기존 53 PatternObject 회귀 테스트 (default=False 시 통과율 동일) |
| Layer B 분기 추가가 decision_path 4-way로 확장 시 downstream 호환 | 중 | 중 | decision_path enum 확장: `"strict_layer_a" / "trading_edge_layer_a" / "layer_b_override" / "rejected"` |

### Dependencies
- 선행: W-0256 머지 (PromotionGatePolicy 확장 누적 회피)
- 차단 해제: F-11 Dashboard UI + F-60 gate 출시 가능

### Files Touched (예상)
- `engine/research/pattern_search.py`: PromotionGatePolicy + 2 fields, PromotionReport + 1 field, build_promotion_report logic ~30줄
- `engine/tests/test_w0258_d5_layer_b.py` (신규)

## AI Researcher 관점

### Statistical Validation
- Layer B만 통과 (Layer A 실패) 시 promotion 결정 — 53 PatternObject 시뮬레이션
- threshold: Layer B-only promotion 비율이 30%+이면 Layer A criteria가 너무 strict 의심

### Failure Modes
1. **Type-1**: `require_subjective_gate=True`인데 signature 누락 → silently fail
   - 완화: `subjective_gate_signature is None and require_subjective_gate` 시 raise
2. **Type-2**: Layer B override가 Layer A 객관 실패를 무시 → 통계 노이즈
   - 완화: PromotionReport에 `decision_path = "layer_b_override"` 명시 + 별도 통계 컬럼 필수

## Decisions

| ID | 결정 |
|---|---|
| D-W0258-1 | Layer B = explicit subjective signature, default disabled | "automatic LLM judge" (✗ Phase 2+ F-50 별도); "cron-based regression test" (✗ subjective 본질 위배) |
| D-W0258-2 | `decision_path` 4-way 확장 | 별도 enum class (✗ 현재 string-based 일관성) |

## Open Questions

- [ ] Q1: subjective_gate_signature 형식? `"user:eunjuhyun88@2026-04-27"` 같은 string vs JWT/payload?
- [ ] Q2: Layer B-only override 시 별도 audit log 기록 위치? (memory/incidents/ vs memory/decisions/)

## Exit Criteria

- [ ] AC1: PromotionGatePolicy + 2 fields, PromotionReport + 1 field
- [ ] AC2: build_promotion_report layer_b 분기 동작 (require_subjective_gate=True 시 signature 검증)
- [ ] AC3: backward-compatible — default 동작 시 기존 통과율 동일
- [ ] AC4: 4-way decision_path enum 명시 (strict_layer_a / trading_edge_layer_a / layer_b_override / rejected)

## References

- 본 설계 선행: W-0252 audit `docs/live/W-0252-v00-audit-report.md` §3 D5
- W-0256 augment (선행 머지 필수)
- W-0214 D5 lock-in
