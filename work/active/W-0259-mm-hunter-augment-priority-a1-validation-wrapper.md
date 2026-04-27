# W-0259 — MM Hunter Augment Priority A1: `engine/validation/` Wrapper Module

> Wave: MM Hunter Track 2 | Priority: **P0** (W-0256 후 즉시) | Effort: **M (2d)**
> Charter: ✅ In-Scope L5 Search + L7 Refinement
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-27 by Agent A045
> Depends on: W-0256 augment 머지 (BenchmarkCase + VariantCaseResult 확장 후)

---

## Goal (1줄)

W-0252 audit에서 식별된 V-track integration surface = 0 갭을 **augment-only**로 해소하기 위해 `engine/validation/` 신규 모듈을 생성하여 V-01 PurgedKFold (#436), V-02 phase_eval (#440), V-04 sequence (#435), V-06 stats (#438)를 pattern_search.py와 분리된 wrapper 형태로 통합한다.

## Scope

### 포함
- `engine/validation/__init__.py` — public API (`run_validation_pipeline`, `validate_pattern`)
- `engine/validation/pipeline.py` — V-01~V-06 호출 orchestrator
- `engine/validation/adapters.py` — PatternSearchRunArtifact ↔ V-track input 변환
- `pattern_search.py`는 **import 받지 않음** (one-way: validation → pattern_search)
- 신규 통합 테스트 `engine/tests/test_w0259_validation_pipeline.py`

### Non-Scope
- ❌ V-track 모듈 자체 수정 (이미 머지된 #435/#436/#438/#440)
- ❌ pattern_search.py 변경 (zero coupling 유지)
- ❌ V-13 decay monitoring (Q3 결정대로 별도 work item)
- ❌ V-08 pipeline 본격 실행 (run scheduler 별도)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Import cycle (validation → pattern_search → patterns 순환) | 중 | 상 | one-way only: validation imports pattern_search artifact dict, NEVER call back |
| V-track 4 모듈의 input 명세 불일치 | 중 | 중 | adapters.py에서 모든 변환 통합, 각 V-track별 spec 직접 참조 (#436, #440, #435, #438 PR body) |
| W-0256 머지 전 시작 → cost_adjusted 필드 부재로 adapter 깨짐 | 중 | 중 | dependency 명시, W-0256 머지 후 시작 |

### Dependencies
- **선행**: W-0256 머지 (BenchmarkCase.phase_taxonomy_id, VariantCaseResult.cost_adjusted_forward_peak_return_pct 필요)
- **차단 해제**: V-08 pipeline + V-12 threshold audit + V-13 decay 모두 본 모듈 호출

### Rollback Plan
- 신규 모듈만 추가, pattern_search.py 변경 0줄 → 단순 디렉토리 삭제로 100% 복구

### Files Touched (예상)
- 신규 모듈 (4개 파일):
  - `engine/validation/__init__.py` (~30줄)
  - `engine/validation/pipeline.py` (~150줄)
  - `engine/validation/adapters.py` (~100줄)
  - `engine/validation/contracts.py` (~50줄, dataclass 입력/출력 명세)
- 신규 테스트:
  - `engine/tests/test_w0259_validation_pipeline.py` (~100줄)
- pattern_search.py: **변경 0줄** (augment-only 검증)

## AI Researcher 관점

### Data Impact

| 항목 | 영향 |
|---|---|
| 138,915 feature_window | ❌ 영향 없음 |
| PatternSearchRunArtifact JSON | ✅ adapters에서 read-only 소비 |
| LightGBM Layer C 학습 | ✅ V-01 PurgedKFold가 본 wrapper로 통합 호출 가능 |

### Statistical Validation

본 wrapper는 통계 측정 자체를 수행하지 않음 (V-track 모듈에 위임). 측정은:
- V-01 PurgedKFold: cross-validation split 정확도
- V-02 phase_eval: forward return distribution
- V-04 sequence: M3 sequence completion ratio
- V-06 stats: Welch t / BH / DSR / Bootstrap

품질 게이트:
- coverage: V-track 4 모듈 모두 wrapper에서 호출 가능
- backward: pattern_search.py 기존 호출자 15+개 회귀 PASS

### Failure Modes

1. **Type-1 (잘못된 adapter)**: PatternSearchRunArtifact → V-track input 변환 시 cost_adjusted 누락 → V-02가 paper return 사용
   - 완화: adapters.py에 `assert "cost_adjusted_forward_peak_return_pct" in case_result_dict` (W-0256 머지 후)
2. **Type-2 (V-track 모듈 signature drift)**: V-01~V-06 PR 머지 후 signature 변경 시 wrapper 깨짐
   - 완화: Contract test (`test_w0259_validation_pipeline.py`)에서 V-track signature snapshot

## Decisions

| ID | 결정 |
|---|---|
| D-W0259-1 | One-way coupling: `validation → pattern_search` only | Bi-directional (✗ cycle 위험); Side-by-side (✗ 통합 의미 없음) |
| D-W0259-2 | 4-file 분할 (init/pipeline/adapters/contracts) | 단일 파일 (✗ 300+줄 단일 모듈 응집도↓); 더 작은 분할 (✗ V-track 추가 시 over-fragmentation) |
| D-W0259-3 | Wrapper 자체는 통계 측정 안 함 (위임만) | 측정 통합 (✗ V-track 모듈 책임 중복) |

## Open Questions

- [ ] Q1: V-01 PurgedKFold가 BenchmarkCase 단위로 split할지, VariantCaseResult 단위로 split할지? (PR #436에서 어느 단위 사용했는지 확인 필요)
- [ ] Q2: Wrapper 호출 결과를 PatternSearchRunArtifact에 다시 write back할지, 별도 ValidationReport로 분리할지?
- [ ] Q3: V-track 4 모듈 sequence (V-01 → V-02 → V-04 → V-06)인지 parallel인지?

## Exit Criteria

- [ ] AC1: `engine/validation/` 신규 모듈 4개 파일 (init/pipeline/adapters/contracts)
- [ ] AC2: 4 V-track 모듈 (V-01/V-02/V-04/V-06) 모두 wrapper에서 호출 가능
- [ ] AC3: `engine/research/pattern_search.py` 변경 0줄 (augment-only 검증, PR diff)
- [ ] AC4: 통합 테스트 `test_w0259_validation_pipeline.py` PASS (V-track signature snapshot)
- [ ] AC5: 기존 caller 15+개 회귀 PASS

## References

- 본 설계 선행: W-0252 audit `docs/live/W-0252-v00-audit-report.md` §4 V-track surface = 0
- W-0256 (선행 dependency): `work/active/W-0256-mm-hunter-augment-priority-a.md`
- 머지된 V-track PR (소비 대상): #435 V-04, #436 V-01, #438 V-06, #440 V-02
- W-0214 D6: V-track schedule
