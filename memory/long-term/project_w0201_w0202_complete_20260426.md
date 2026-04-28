# W-0201 / W-0202 완료 (2026-04-26)

## main SHA
`4c02cd0f` — PR #291 (`fix/loader-primary-cache-dir`) 머지 완료

## 커밋 이력 (main 반영)
| SHA | 내용 |
|---|---|
| `3d6d2e86` | fix(W-0201): query_transformer higher_lows_sequence 키 + PatternSeedScoutPanel state vars |
| `a135955f` | feat(W-0202): canonical feature diagnostics + active registry sync + intraday-dump-cluster seed |
| `e9096b7f` | chore(CURRENT.md): W-0201/W-0202 완료 상태 업데이트 |
| `4c02cd0f` | Merge PR #291 |

## W-0201 — Core Loop Contract Hardening (완료)

### 수정 파일
- `engine/research/query_transformer.py` — `higher_lows_sequence_flag` → `higher_lows_sequence` (signal rule key 오타 수정)
- `engine/tests/test_query_transformer.py` — line 76 assertion 동기화
- `app/src/components/terminal/workspace/PatternSeedScoutPanel.svelte` — `currentRunId`, `judgedCandidates` `$state` 선언 누락 추가

### 수정한 테스트
- `test_transform_pattern_draft_builds_deterministic_search_query_spec` ✅

## W-0202 — PromotionReport Canonical Features + Active Variant Sync (완료)

### 수정 파일
- `engine/research/pattern_search.py`

### 구현 내용

#### 1. `PromotionReport` 5개 필드 추가
```python
canonical_feature_scored_case_count: int = 0
canonical_feature_score: float | None = None
reference_canonical_feature_score: float | None = None
holdout_canonical_feature_score: float | None = None
canonical_feature_summary: dict = field(default_factory=dict)
```

#### 2. `build_promotion_report()` — canonical feature 집계
- `score_canonical_feature_snapshot()` 호출 (ref/holdout 별도 → 평균)
- `canonical_feature_summary` 명명 규칙:
  - float/int 키 → `{key}_mean`
  - bool 키 → `_flag` 제거 후 `_rate` 추가 (예: `funding_flip_flag` → `funding_flip_rate`)

#### 3. `run_pattern_benchmark_search()` — W-0151 active variant sync
- `active_variant_store: Any | None = None` 파라미터 추가
- `promote_candidate` 결정 시 `derive_watch_phases_from_pattern(pattern)` 사용 (NOT hidden 필터 → 올바른 `["ACCUMULATION", "REAL_DUMP"]`)
- `timeframe`: `winner.case_results[0].timeframe` (없는 필드) → variants spec lookup으로 수정
- `handoff_payload`에 canonical feature 5키 + `active_registry_variant_slug` 추가

#### 4. `build_seed_variants()` — `intraday-dump-cluster` 추가
```python
PatternVariantSpec(
    pattern_slug=pattern_slug,
    variant_slug=f"{pattern_slug}__intraday-dump-cluster",
    timeframe=base.timeframe,
    phase_overrides={
        "REAL_DUMP": {"required_blocks": ["oi_spike_with_dump"], "max_bars": 6},
        "ACCUMULATION": {"phase_score_threshold": 0.60, "transition_window_bars": 12},
    },
    hypotheses=["fast intraday dump cluster structure", "tighter real dump window"],
)
```

### 수정한 테스트 (4개 모두 통과)
- `test_seed_variants_cover_early_and_late_phase_hypotheses` ✅
- `test_run_pattern_benchmark_search_syncs_gate_cleared_winner_to_active_registry` ✅
- `test_build_promotion_report_includes_canonical_feature_diagnostics` ✅
- `test_transform_pattern_draft_builds_deterministic_search_query_spec` ✅

## 전체 엔진 테스트
**1448 passed, 0 failed, 5 skipped** (176s)

## 다음 작업 후보
- PR #291 머지 이후 추가 브랜치 없음
- 인프라 미완 (사람이 직접): GCP Cloud Build trigger, Vercel `EXCHANGE_ENCRYPTION_KEY`, Cloud Scheduler
- 가능한 다음 feature 개발: 미정
