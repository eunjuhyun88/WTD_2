# W-0256 — MM Hunter Augment Priority A: D3 cost + D8 phase taxonomy

> Wave: MM Hunter Track 2 | Priority: **P0** (W-0252 audit 직후) | Effort: **M-L (3d total: 1.5d D3 + 1.5d D8)**
> Charter: ✅ In-Scope L5 Search (`spec/CHARTER.md`)
> Status: 🟡 **Design Draft** (사용자 검토 대기)
> Created: 2026-04-27 by Agent A045
> Branch: `feat/W0256-mm-hunter-augment-design` (설계 PR), 코드 augment는 별도 PR
> Depends on: W-0252 audit (PR #467 머지 후 시작)

---

## Goal (1줄)

W-0252 audit에서 식별된 🔴 갭 2개 (D3 cost model, D8 phase taxonomy)를 **augment-only** 정책으로 `engine/research/pattern_search.py`에 비파괴적으로 추가하여 MM Hunter validation framework가 실제 cost-aware + multi-taxonomy 측정을 수행할 수 있게 한다.

## Scope

### 포함
- **D3 cost augment**: 15bps round-trip cost를 PromotionGatePolicy + VariantCaseResult에 추가 + evaluation 로직에서 차감
- **D8 phase taxonomy augment**: BenchmarkCase에 `phase_taxonomy_id` 필드 + taxonomy registry (`oi_reversal_5`, `wyckoff_4` 둘 다 등록)
- 기존 dataclass 필드 모두 보존 (backward-compatible)
- 기존 외부 caller 15+개 영향도 검증 (default 값으로 무영향)
- 테스트: D3 cost-adjusted return / D8 multi-taxonomy switching

### Non-Scope
- ❌ Priority A1 `engine/research/validation/` V-track 통합 작업 (별도 work item)
- ❌ Priority B1 D2 horizon parametrization (M3 출시 전, 별도 work item)
- ❌ Priority B2 D5 F-60 Layer B subjective gate (별도 work item)
- ❌ pattern_search.py의 기존 함수 **rename / signature 변경 / 함수 삭제** 일체 금지

## Charter Check

| 항목 | 결과 |
|---|---|
| L5 Search In-Scope | ✅ |
| augment-only 정책 (W-0214 D6) | ✅ — 새 필드 default 값으로 backward-compatible |
| Frozen 진입 | ❌ |
| 외부 caller 영향 | ✅ default 값으로 호출 시그니처 변경 없음 |

---

## CTO 관점 (Engineering)

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Dataclass 필드 추가가 외부 caller에서 dict serialize 시 깨짐 (`to_dict`/`from_dict`) | 중 | 중 | `from_dict`에 `payload.get(field, default)` 패턴 사용, 기존 JSON 파일 backward-compatible |
| Cost augment가 기존 PromotionReport의 strict_gate_results 통과율을 떨어뜨림 (regression) | 중 | 상 | default cost = 0.0으로 두고, 명시적 cost 인자 시에만 적용 (기존 production 무영향) |
| Taxonomy registry 추가 시 import cycle (patterns/ ↔ research/) | 낮 | 중 | `engine/patterns/phase_taxonomies/__init__.py`에 dict 등록만, function call 없음 |
| 외부 caller 15+개 회귀 | 중 | 상 | default 값 채택, 기존 호출 모두 영향 없음 검증 (테스트로) |

### Dependencies
- **선행**: W-0252 audit PR #467 머지 (gap matrix evidence 확정)
- **차단 해제**: 본 work item 완료 시 V-02 phase_eval (#440)이 cost-adjusted forward return 사용 가능 + Wyckoff taxonomy 등록 가능

### Rollback Plan
- 신규 필드만 추가하므로 PR revert 단일 커밋으로 100% 복구
- DB migration / data backfill **불필요** (dataclass field default = 기존 데이터 자동 호환)

### Files Touched (예상)

#### 코드 변경 (augment-only, ~150줄 추가 / 0줄 삭제)
- `engine/research/pattern_search.py` (3283줄 → ~3400줄)
  - `BenchmarkCase` (L125): `+ phase_taxonomy_id: str = "oi_reversal_5"` (1 field)
  - `PromotionGatePolicy` (L382): `+ roundtrip_cost_bps: float = 0.0` + `apply_cost: bool = True` (2 fields)
  - `VariantCaseResult` (L214): `+ cost_adjusted_forward_peak_return_pct: float \| None = None` (1 field)
  - `_measure_forward_peak_return` (L2696): cost 차감 로직 (~10줄)
  - `evaluate_variant_on_case` (L2773): cost params 전파 (~5줄)
  - `_promotion_metrics_from_cases` (L1500): cost-adjusted 메트릭 계산 옵션 (~10줄)

#### 신규 모듈
- `engine/patterns/phase_taxonomies/__init__.py` (신규, ~50줄): `TAXONOMY_REGISTRY = {"oi_reversal_5": [...], "wyckoff_4": [...]}` + lookup 함수

#### 테스트 (신규)
- `engine/tests/test_w0256_d3_cost.py` (신규, 5+ assertions)
- `engine/tests/test_w0256_d8_taxonomy.py` (신규, 5+ assertions)

---

## AI Researcher 관점 (Data/Model)

### Data Impact

| 항목 | 영향 |
|---|---|
| 기존 138,915 feature_window rows | ❌ 영향 없음 (코드 augment만) |
| 기존 PromotionReport JSON 파일 | ⚠️ from_dict에 `.get(field, default)` 처리 시 backward-compatible |
| 기존 BenchmarkPack JSON 파일 | ⚠️ 동일하게 backward-compatible |
| Layer C LightGBM 학습 | ✅ cost-adjusted forward return을 신규 feature로 사용 가능 (선택사항) |

### Statistical Validation

| 메트릭 | 측정 방법 | Threshold |
|---|---|---|
| D3 cost 적용 시 strict_gate_pass_rate 변화 | A/B: cost=0 vs cost=15bps, 같은 52 PatternObject 대상 | drop ≤ 30% (catastrophic failure 차단) |
| D8 taxonomy 분기 시 phase_fidelity 측정 | wyckoff_4 vs oi_reversal_5 같은 case에서 score 차이 | 둘 다 0.0 ≤ score ≤ 1.0 (정상 범위) |

### Failure Modes

1. **Type-1 (cost 과다 적용)**: cost 차감 시 모든 패턴이 promotion gate 탈락 → 측정 무용지물
   - 완화: A/B 테스트로 cost=0 baseline 통과율 확보 후 적용
2. **Type-2 (taxonomy 잘못 라우팅)**: Wyckoff case에 oi_reversal expected_phase_path 사용 → score=0
   - 완화: taxonomy registry에서 expected_phase_path와 taxonomy_id 일관성 검증 함수 추가

### Falsifiable Kill Criteria
- F2: D3 cost 적용 후 strict_gate_pass_rate가 30%+ 하락 → 15bps default가 너무 보수적, 8-10bps로 재조정 검토 (별도 incident)
- F3: D8 taxonomy 분기 시 둘 중 한 taxonomy의 phase_fidelity가 항상 0 → registry 매핑 오류, immediate fix

---

## Decisions (이 설계에서 확정)

| ID | 결정 | 거절된 옵션 |
|---|---|---|
| D-W0256-1 | D3+D8을 **단일 work item / 단일 PR**로 묶음 | (A) D3+D8 분리 PR (✗ atomic single-axis 위반 회피하지만 검토 회수↑); (C) Priority A 전체 (D3+D8+wrapper) 통합 (✗ scope creep, 3d → 5d+) |
| D-W0256-2 | Cost default = **0.0** (production 무영향), 명시적 인자 시 차감 | (A) default = 15bps (✗ regression risk); (C) cost를 별도 dict로 (✗ dataclass 일관성 위반) |
| D-W0256-3 | Taxonomy registry는 `engine/patterns/phase_taxonomies/`에 **dict-only 등록** | (A) class-based registry (✗ over-engineering); (C) 코드 inline (✗ taxonomy 추가 시 pattern_search.py 수정 강제) |
| D-W0256-4 | BenchmarkCase default taxonomy = `"oi_reversal_5"` (기존 case와 일치) | (A) default = `"wyckoff_4"` (✗ 기존 cases 회귀); (C) default = None (✗ explicit 강제 시 from_dict 깨짐) |

## Open Questions (사용자 결정 필요)

- [ ] **Q-W0256-1**: D3 cost = **15bps** (W-0214 D3 lock-in) 그대로 적용할지, 아니면 audit 결과 본 후 8-10bps 재논의할지? (default=0.0이므로 즉시 영향 없으나, V-02 evaluation에서 명시할 값 필요)
- [ ] **Q-W0256-2**: D8 wyckoff_4의 phase 이름은 `["accumulation", "markup", "distribution", "markdown"]`가 표준인지 확인 (기존 코드에 wyckoff hint 없어 추론 필요)
- [ ] **Q-W0256-3**: 본 augment를 D3+D8 단일 PR로 진행할지, D3와 D8 별도 PR 2개로 분리할지? (CTO 권고: 단일 PR — 검토 회수 최소화, atomic axis = "PromotionGatePolicy/BenchmarkCase 신규 필드 추가")

---

## Implementation Plan

### Phase 1 — D3 cost augment (1.5d)

1. `_measure_forward_peak_return`에 `roundtrip_cost_bps: float = 0.0` 인자 추가
2. forward_peak_return_pct 계산 직후 cost 차감: `cost_adjusted = forward_peak_return_pct - roundtrip_cost_bps / 100`
3. `VariantCaseResult`에 `cost_adjusted_forward_peak_return_pct: float | None = None` 필드 추가 + `to_dict` 업데이트
4. `evaluate_variant_on_case`에 `roundtrip_cost_bps` 인자 + cost-adjusted 결과 채움
5. `PromotionGatePolicy`에 `roundtrip_cost_bps: float = 0.0` + `apply_cost: bool = True` 추가
6. `_promotion_metrics_from_cases`에서 apply_cost=True 시 cost_adjusted_forward_peak_return_pct 사용
7. 테스트 `test_w0256_d3_cost.py`: cost=0 vs cost=15bps에서 metric 차이 검증

### Phase 2 — D8 phase taxonomy augment (1.5d)

1. `engine/patterns/phase_taxonomies/__init__.py` 신설:
   ```python
   TAXONOMY_REGISTRY = {
       "oi_reversal_5": ["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
       "wyckoff_4": ["accumulation", "markup", "distribution", "markdown"],
   }
   def get_taxonomy(taxonomy_id: str) -> list[str]: ...
   def is_valid_phase(taxonomy_id: str, phase: str) -> bool: ...
   ```
2. `BenchmarkCase`에 `phase_taxonomy_id: str = "oi_reversal_5"` 필드 + `to_dict`/`from_dict`
3. `evaluate_variant_on_case`에서 case.phase_taxonomy_id로 registry lookup, expected_phase_path 검증
4. 테스트 `test_w0256_d8_taxonomy.py`: 두 taxonomy 모두 round-trip + invalid taxonomy_id 시 raise

### Phase 3 — Backward compatibility 검증 (0.5d)

5. 외부 caller 15+개 (research/*.py, api/routes/*.py, tests/*) 회귀 테스트
6. 기존 JSON 파일 round-trip (BenchmarkPack, ArtifactStore, NegativeMemory) 검증
7. PR open → CI green 확인 → 사용자 검토

---

## Exit Criteria

- [ ] AC1: pattern_search.py 신규 필드 4개 추가 (BenchmarkCase.phase_taxonomy_id, PromotionGatePolicy.roundtrip_cost_bps + apply_cost, VariantCaseResult.cost_adjusted_forward_peak_return_pct)
- [ ] AC2: `engine/patterns/phase_taxonomies/__init__.py` 신설 + 2개 taxonomy 등록
- [ ] AC3: 신규 테스트 2개 파일, 각 5+ assertions, 모두 PASS
- [ ] AC4: 외부 caller 15+개 회귀 PASS (기존 테스트 모두 PASS)
- [ ] AC5: pattern_search.py **삭제 0줄 / signature 변경 0건** (augment-only 검증, PR diff 확인)
- [ ] AC6: A/B 테스트 결과 — cost=0 baseline 대비 cost=15bps 적용 시 strict_gate_pass_rate drop ≤ 30%
- [ ] AC7: PR merged + CURRENT.md SHA 업데이트

---

## References

- 본 work item 선행 audit: `docs/live/W-0252-v00-audit-report.md`
- W-0214 D1~D8 framing: `memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md`
- W-0252 audit decision: `memory/decisions/dec-2026-04-27-w-0252-audit-result.md`
- 코드 위치 (audit evidence):
  - BenchmarkCase L125, default taxonomy L599-611
  - PromotionGatePolicy L382, gate logic L1607-1649
  - VariantCaseResult L214
  - _measure_forward_peak_return L2696
  - evaluate_variant_on_case L2773
- 머지된 V-track PR (downstream consumers): #435 #436 #438 #440
- 후속 work item:
  - Priority A1: `engine/research/validation/` V-track 통합 (별도 발번 예정)
  - Priority B1: D2 horizon parametrization (M3 출시 전)
  - Priority B2: D5 F-60 Layer B subjective gate (M3 출시 전)
