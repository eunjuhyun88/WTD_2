# W-0280 — V-track Pipeline → Production 연결 (Core Loop Closure)

> Wave: MM Hunter Track 2 | Priority: **P0** | Effort: **M (2일)**
> Charter: ✅ In-Scope L7 AutoResearch (refinement loop)
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-28 by Agent A073
> Depends: W-0279 (V-05 regime 연결, 1일 선행)

---

## Goal (1줄)

`run_validation_pipeline()` + `evaluate_gate_v2()`를 production 코드에 연결해
V-track G1~G7 검증이 실제 패턴에 대해 실행되고 promotion 결정에 반영되게 한다.

---

## 진단 — 왜 루프가 끊겨 있나

### 현재 production call chain

```
pattern_refinement_job
  └→ run_pattern_refinement_once(slug)          [research_jobs.py]
      └→ run_pattern_bounded_eval(config)        [pattern_refinement.py]
          └→ (Hill Climbing / bounded eval)

run_pattern_search_refinement_once(slug)        [research_jobs.py]
  └→ run_pattern_benchmark_search(config)        [pattern_search.py]
      └→ BenchmarkPackStore.load(pack_id)        ← pack 생성됨
      └→ build_promotion_report(slug, winner)    ← OLD gate (PromotionGatePolicy)
      └→ PatternSearchArtifactStore.save(artifact)  ← benchmark_pack_id 저장됨
  └→ run_pattern_bounded_eval(config)

```

### 끊긴 지점

| 함수 | 파일 | production 호출 여부 |
|---|---|---|
| `build_promotion_report()` | pattern_search.py:3156 | ✅ (OLD gate) |
| `run_validation_pipeline()` | validation/pipeline.py | ❌ **없음** |
| `evaluate_gate_v2()` | validation/gates.py | ❌ **없음** |

### 확인된 사실 (Open Question 해소)

`run_pattern_refinement_once()` — **BenchmarkPack 미반환** (bounded eval only, dict 반환)

`run_pattern_search_refinement_once()` — **간접 접근 가능**:
```python
search_run = run_pattern_benchmark_search(...)
artifact = PatternSearchArtifactStore().load(search_run.research_run_id)
# artifact dict에 "benchmark_pack_id" 존재 (pattern_search.py:3165)
pack = BenchmarkPackStore().load(artifact["benchmark_pack_id"])  # ✅ 로드 가능
```

**Wire point 확정**: `research_jobs.py`의 `run_pattern_search_refinement_once()` — pattern_search.py 수정 없음.

---

## Scope

### 포함 (이번 W-0280)

**[1] `engine/research/validation/runner.py` (신규, ~70줄)**

```python
def run_full_validation(
    research_run_id: str,
    *,
    btc_returns: pd.Series | None = None,
) -> GateV2Result | None:
    """Load pack + promotion_report from artifact → pipeline → gate_v2."""
    artifact = PatternSearchArtifactStore().load(research_run_id)
    if artifact is None:
        return None
    pack_id = artifact.get("benchmark_pack_id")
    if not pack_id:
        return None
    pack = BenchmarkPackStore().load(pack_id)
    if pack is None:
        return None
    existing_pass = (
        artifact.get("promotion_report", {}) or {}
    ).get("decision") == "promote_candidate"
    report = run_validation_pipeline(pack, ValidationPipelineConfig())
    return evaluate_gate_v2(report, existing_pass=existing_pass)
```

**[2] `engine/worker/research_jobs.py` — `run_pattern_search_refinement_once()` 수정**

search_run 완료 후 호출 추가 (~10줄):
```python
# V-track G1~G7 검증 (W-0280)
from research.validation.runner import run_full_validation
gate_result = run_full_validation(search_run.research_run_id)
payload["gate_v2_result"] = gate_result.to_dict() if gate_result else None
if gate_result:
    log.info(
        "GateV2Result: slug=%s overall_pass=%s new_gates_pass=%s",
        pattern_slug,
        gate_result.overall_pass,
        gate_result.new_g1_to_g7_pass,
    )
```

**[3] `engine/research/validation/__init__.py` — runner export 추가**

```python
from .runner import run_full_validation
```

**[4] `engine/research/validation/runner.py` 단위 테스트**

`engine/research/validation/test_runner.py` (신규, ~40줄):
- 합성 `ReplayBenchmarkPack` → `PatternSearchArtifactStore` mock → `run_full_validation()` 호출
- `GateV2Result` 반환 확인
- `artifact is None` → `None` 반환 확인

### Non-Goals

- ❌ `pattern_search.py` 수정 (augment-only 영구 정책)
- ❌ `run_pattern_refinement_once()` (bounded eval path) wiring — W-0281 후속
- ❌ GateV2Result → Supabase 저장 — W-0281 후속
- ❌ gate_v2 결과로 promotion 결정 오버라이드 — Phase 2 (지금은 log-only)
- ❌ btc_returns 실데이터 주입 — W-0279 완료 후 별도 작업

---

## 전체 V-track Core Loop (완료 후 상태)

```
[run_pattern_search_refinement_once]
  ①  run_pattern_benchmark_search()
      └→ BenchmarkPackStore.load/ensure_default_pack()
      └→ evaluate_variant_against_pack() × N variants
      └→ build_promotion_report() → PromotionReport  [OLD gate]
      └→ PatternSearchArtifactStore.save(artifact)   [benchmark_pack_id 저장]

  ②  run_pattern_bounded_eval()
      └→ Hill Climbing + LightGBM bounded eval

  ③  run_full_validation(search_run.research_run_id)  ← W-0280 신규
      └→ PatternSearchArtifactStore.load() → artifact dict
      └→ BenchmarkPackStore.load(pack_id) → ReplayBenchmarkPack
      └→ run_validation_pipeline(pack)                ← V-01/V-02/V-06 + V-05(W-0279)
          → ValidationReport { regime_results, fold_pass_count, horizon_reports }
      └→ evaluate_gate_v2(report, existing_pass)      ← G1~G7 종합
          → GateV2Result { overall_pass, new_g1_to_g7_pass }

  payload["gate_v2_result"] = gate_result.to_dict()  ← log-only (Phase 1)
```

---

## 실행 순서 (2일)

### Day 1 — W-0279 먼저 (선행 조건)

W-0279 설계문서 기준 (~4h):
1. `pipeline.py` `ValidationPipelineConfig`에 `btc_returns: pd.Series | None = None`
2. `run_validation_pipeline()` 끝 — V-05 `measure_regime_conditional_return()` 호출로 `regime_results` 채움
3. `__init__.py` — V-05 (`RegimeLabel`, `label_regime`) + V-11 (`GateV2Config`, `evaluate_gate_v2`) export
4. `uv run pytest engine/research/validation/ -v --tb=short` → AC1-AC4 통과

### Day 2 — W-0280 구현

1. `engine/research/validation/runner.py` 작성
2. `engine/research/validation/test_runner.py` 작성
3. `engine/research/validation/__init__.py` — `run_full_validation` export
4. `engine/worker/research_jobs.py` — `run_pattern_search_refinement_once()` 수정
5. `uv run pytest engine/research/validation/ -v --tb=short` → 전체 green

---

## Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `PatternSearchArtifactStore.load()` dict schema 변경 | 저 | 중 | `.get()` 방어적 접근, None 체크 |
| pack 파일 없음 (새 패턴, 검색 전) | 중 | 저 | `run_full_validation()` → `None` 반환, payload 비움 |
| V-05 btc_returns 없어 regime_results 빔 | 중 | 저 | `btc_returns=None` 기본값 → 기존 동작 보존 |
| gate_v2 결과가 기존 promote 결정과 충돌 | 중 | 고 | Phase 1 log-only, 오버라이드 없음 |

## Dependencies

- 선행: PR #507 (V-05 regime.py) ✅ 머지됨
- 선행: PR #508 (V-11 gates.py) ✅ 머지됨
- 선행: **W-0279 구현 완료** (regime_results 실충전, Day 1)

## Rollback Plan

- `runner.py` 신규 파일 → 삭제로 즉시 rollback
- `research_jobs.py` 수정은 try/except 감싸서 gate_result 실패해도 기존 payload 영향 없음

---

## Exit Criteria

- [ ] **AC1**: `uv run pytest engine/research/validation/test_pipeline.py -v` → btc_returns=None 시 기존 전체 통과
- [ ] **AC2**: `uv run pytest engine/research/validation/test_pipeline.py -v` → btc_returns=Series 주입 시 `report.regime_results` 비어있지 않음
- [ ] **AC3**: `from engine.research.validation import run_full_validation, evaluate_gate_v2, label_regime` import 성공
- [ ] **AC4**: `run_full_validation(research_run_id)` → 합성 artifact mock으로 `GateV2Result` 반환
- [ ] **AC5**: `run_pattern_search_refinement_once(slug)` payload에 `"gate_v2_result"` key 존재
- [ ] **AC6**: log에 `GateV2Result: slug=... overall_pass=...` 출력 확인
- [ ] **AC7**: `uv run pytest engine/research/validation/ -v` 전체 green
- [ ] **AC8**: PR merged + CURRENT.md SHA 업데이트

---

## References

- `engine/research/validation/pipeline.py:221-237` — regime_results 플레이스홀더 (W-0279 대상)
- `engine/research/validation/gates.py:121` — `evaluate_gate_v2()` 구현
- `engine/worker/research_jobs.py:54` — `run_pattern_search_refinement_once()` wire point
- `engine/research/pattern_search.py:3165` — `benchmark_pack_id` artifact 저장
- `engine/research/pattern_search.py:618` — `BenchmarkPackStore.load()`
- `engine/research/pattern_search.py:684` — `PatternSearchArtifactStore.load(research_run_id)`
- `work/active/W-0279-v05-v11-pipeline-integration.md` — 선행 작업
- PR #507 (V-05), PR #508 (V-11)
- `spec/CHARTER.md §In-Scope L7` — AutoResearch refinement loop
