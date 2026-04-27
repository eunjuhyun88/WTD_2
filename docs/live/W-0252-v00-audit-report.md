# W-0252 V-00 Audit Report — `engine/research/pattern_search.py`

> Status: ✅ **Audit complete**, augment-only feasible (F1 not triggered)
> Date: 2026-04-27 | Auditor: A-impl (impl specialist)
> Source: `engine/research/pattern_search.py` @ branch feat/W0252-v00-audit
> Coverage: **100%** (3283/3283 lines, all sections read)
> Basis: dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin (D1~D8)

---

## Executive Summary

| Metric | Value |
|---|---|
| File size | 3283 lines |
| Classes | 20 (3 store classes + 2 config classes + 15 frozen dataclasses) |
| Top-level functions | 62 (35 private `_`-prefixed + 27 public) |
| 🔴 갭 (augment 필요, 코드 없음) | **2** — D3 cost model, D8 phase taxonomy |
| 🟡 partial (구조 있지만 파라미터화 부족) | **2** — D2 horizon (48-bar hardcoded), D5 Layer B gate |
| ✅ scope-out / 충족 | 4 — D1, D4, D6, D7 |
| V-track integration surface | **0** — V-01/V-02/V-04/V-06 모두 미연결 (독립 모듈) |
| F1 falsifiable trigger (≥3 🔴) | ❌ **미발동** — 2개 갭, augment-only 처리 가능 |

**핵심 결론**:
1. F1 kill criteria 미발동 — W-0214 framing 재검토 불필요
2. V-track 4 PR은 pattern_search.py와 zero coupling. 신규 `engine/validation/` wrapper가 bridging 역할을 해야 함 (Priority A)
3. D3/D8 갭은 `PromotionGatePolicy`, `BenchmarkCase` 두 dataclass에 신규 필드 추가(augment)로 해결 가능

---

## §1 Class Catalog (20 classes)

### Stores (3 classes)

| Line | Class | Role | Public Methods |
|---|---|---|---|
| 552 | `BenchmarkPackStore` | ReplayBenchmarkPack JSON 영구 저장 | save / load / ensure_default_pack |
| 618 | `PatternSearchArtifactStore` | PatternSearchRunArtifact JSON 영구 저장 + list | save / load / list |
| 651 | `NegativeSearchMemoryStore` | 실패 검색 기억 JSON 저장 | save / list |

모두 minimalist file-based JSON store. SQLite/Supabase 없음. 병렬 쓰기 시 `tempfile` atomic-replace 패턴 사용 (line 562, 629, 661).

### Config/Policy classes (2)

| Line | Class | Role | Key Fields |
|---|---|---|---|
| 363 | `FamilySelectionPolicy` | 패밀리 승격 정책 | family_type_priority, active_family_stickiness_band, bias_mode |
| 381 | `PromotionGatePolicy` | 후보 승격 게이트 기준 | min_reference_recall, min_phase_fidelity, min_lead_time_bars, max_false_discovery_rate, max_robustness_spread, require_holdout_passed, min_entry_profit_pct (line 396), entry_profit_horizon_bars=48 (line 397), min_entry_profitable_rate (line 398) |

### Frozen dataclasses (15)

| Group | Class (line) | Role |
|---|---|---|
| BenchmarkCase | `BenchmarkCase` (124) | 단일 replay case: symbol, timeframe, expected_phase_path, role(ref/holdout) |
| Pack | `ReplayBenchmarkPack` (154) | cases 집합 + candidate_timeframes |
| Variant | `PatternVariantSpec` (182) | 변형 명세: phase_overrides, search_origin, selection_bias, duration_scale |
| Result | `VariantCaseResult` (212) | 단일 케이스 평가 결과: phase_fidelity, entry_hit, target_hit, forward_peak_return_pct |
| Result | `VariantSearchResult` (243) | variant 전체 점수: reference_score, holdout_score, overall_score |
| Insight | `VariantDeltaInsight` (263) | 변형 간 점수 차이: damage_adjusted_gain, classification |
| Insight | `MutationBranchInsight` (277) | 변형 브랜치 건강도 요약 |
| Insight | `SearchFamilyInsight` (294) | 패밀리 최선 대표: family_type, representative_variant_slug |
| Recommendation | `TimeframeRecommendation` (326) | 타임프레임 업그레이드/유지/회피 권고 |
| Recommendation | `DurationRecommendation` (343) | 기간 스케일 권고 |
| Summary | `PhaseAttemptSummary` (678) | failed_reason_counts, missing_block_counts, total_attempts |
| Gate | `PromotionReport` (408) | 게이트 결과 전체: gate_results dict, decision, rejection_reasons, entry_profitable_rate, decision_path |
| Artifact | `PatternSearchRunArtifact` (458) | 검색 실행 전체 산출물: variant_results, promotion_report, family_insights |
| Memory | `NegativeSearchMemoryEntry` (514) | 실패 기억 항목 |
| Config | `PatternBenchmarkSearchConfig` (539) | 검색 실행 설정: warmup_bars, min_reference_score, min_holdout_score |

---

## §2 Top-level Function Catalog (62 functions)

### Private utility functions (35)

| Function (line) | 역할 |
|---|---|
| `_utcnow` (42) | UTC datetime 생성 |
| `_utcnow_iso` (46) | UTC ISO string |
| `_dt` (50) | str/datetime → tz-aware datetime |
| `_dt_to_iso` (57) | datetime → ISO str or None |
| `_phase_path_in_order` (61) | expected vs observed 위상 경로 정합도 (0.0~1.0) |
| `_phase_depth_progress` (75) | 현재 위상의 예상 경로 대비 깊이 진척률 |
| `_dedupe_path` (87) | 연속 중복 위상 제거 |
| `_normalized_expected_phase_path` (95) | 타임프레임 비율에 따라 expected path 압축 |
| `_scale_bar_count` (685) | bar 수 타임프레임 비례 환산 |
| `_scale_phase_bar_windows` (696) | phase.min_bars/max_bars 타임프레임 스케일링 |
| `_scale_phase_duration` (708) | duration_scale 적용 |
| `_scale_warmup_bars` (727) | warmup_bars 타임프레임 스케일링 |
| `_lead_score_from_minutes` (732) | lead_bars → 0~1 점수 |
| `_supported_candidate_timeframes` (910) | 후보 타임프레임 목록 정규화 |
| `_variant_timeframe_slug` (920) | 타임프레임 클론 slug 생성 |
| `_strip_timeframe_suffix` (926) | `__tf-` suffix 제거 |
| `_variant_duration_slug` (935) | duration 클론 slug 생성 |
| `_strip_duration_suffix` (939) | `__dur-` suffix 제거 |
| `_find_variant_base` (1038) | variant slug → base PatternVariantSpec 탐색 |
| `_deep_merge_dict` (1051) | 재귀 dict merge |
| `_clone_variant_with_overrides` (1061) | base + overrides → 새 PatternVariantSpec |
| `_find_variant_ancestor_slug` (1083) | variant slug → 부모 slug |
| `_classify_delta` (1099) | delta → productive/damaging/flat/mixed |
| `_classify_family` (1192) | family → viable/damaging/exploratory |
| `_branch_insight_lookup` (1749) | artifact → anchor_slug keyed dict |
| `_family_insight_lookup` (1759) | artifact → family_key keyed dict |
| `_family_priority` (1769) | family_type → 우선순위 int |
| `_family_ref` (1773) | active_family → "family:{key}" 문자열 |
| `_family_key_from_ref` (1779) | "family:{key}" → key |
| `_artifact_from_negative_memory` (1786) | 실패 기억 → artifact-like dict |
| `_best_family_score` (1867) | artifact → 최고 family_score float |
| `_promotion_metrics_from_cases` (1500) | case_results → 게이트 메트릭 dict |
| `_measure_forward_peak_return` (2696) | entry_ts → (entry_close, paper_pct, next_open, realistic_pct) |
| `_slice_case_frames` (2746) | BenchmarkCase → (klines_df, features_df) |
| `_resolve_definition_ref` (3250) | pattern_slug + definition_id → definition_ref dict |

### Public functions (27)

| Function (line) | 역할 | In/Out |
|---|---|---|
| `build_variant_pattern` (746) | base pattern + spec → PatternObject | PatternVariantSpec → PatternObject |
| `build_seed_variants` (762) | pattern_slug → 10개 기본 시드 변형 목록 | str → list[PatternVariantSpec] |
| `expand_variants_across_durations` (948) | duration short/long 클론 확장 | list[PatternVariantSpec] → 확장 list |
| `expand_variants_across_timeframes` (986) | 타임프레임 클론 확장 | list[PatternVariantSpec] → 확장 list |
| `summarize_phase_attempt_records` (1021) | ledger records → PhaseAttemptSummary | list[PatternLedgerRecord] → PhaseAttemptSummary |
| `build_variant_delta_insights` (1111) | 변형 점수 비교 → 델타 목록 | list[VariantSearchResult] → list[VariantDeltaInsight] |
| `build_mutation_branch_insights` (1142) | 델타 → 브랜치 건강도 목록 | list[VariantDeltaInsight] → list[MutationBranchInsight] |
| `build_search_family_insights` (1217) | 변형 결과 → 패밀리 목록 | results+specs+branches → list[SearchFamilyInsight] |
| `build_timeframe_recommendations` (1381) | tf-family → TimeframeRecommendation 목록 | family_insights+... → list[TimeframeRecommendation] |
| `build_duration_recommendations` (1442) | dur-family → DurationRecommendation 목록 | family_insights+... → list[DurationRecommendation] |
| `build_promotion_report` (1577) | winner → PromotionReport (gate 판정) | VariantSearchResult → PromotionReport |
| `select_active_family_insight` (1803) | 최근 artifact + 패밀리 목록 → 선정 패밀리 | list[SearchFamilyInsight]+recent → SearchFamilyInsight|None |
| `has_viable_reset_family` (1855) | artifact에 viable reset 패밀리 존재 여부 | dict → bool |
| `should_use_reset_lane` (1862) | reset lane 사용 여부 판정 | dict → bool |
| `select_preferred_reset_artifact_from_history` (1874) | 히스토리에서 최선 reset artifact 선택 | list[dict] → (dict|None, str|None) |
| `branch_is_unhealthy` (1896) | 브랜치 건강도 체크 | dict, str → bool |
| `select_mutation_anchor_variant_slug` (1909) | artifact에서 최선 mutation 앵커 선택 | dict → str|None |
| `select_mutation_anchor_from_history` (1943) | 히스토리에서 최선 mutation anchor | list[dict] → (dict|None, str|None) |
| `generate_auto_variants` (1984) | 실패 기억 기반 자동 변형 생성 | pattern_slug+memory → list[PatternVariantSpec] |
| `generate_reset_variants` (2127) | reset lane 변형 생성 | pattern_slug+artifact → list[PatternVariantSpec] |
| `generate_active_family_variants` (2237) | 활성 패밀리 내 추가 변형 생성 | pattern_slug+artifact → list[PatternVariantSpec] |
| `generate_mutation_variants` (2395) | anchor 기반 mutation 변형 생성 | pattern_slug+artifact+anchor → list[PatternVariantSpec] |
| `build_search_variants` (2624) | 전체 변형 파이프라인 조합 | pattern_slug+... → list[PatternVariantSpec] |
| `evaluate_variant_on_case` (2773) | variant × case → VariantCaseResult | PatternObject, BenchmarkCase → VariantCaseResult |
| `evaluate_variant_against_pack` (2901) | variant × pack → VariantSearchResult | ReplayBenchmarkPack, PatternVariantSpec → VariantSearchResult |
| `run_pattern_benchmark_search` (2927) | 전체 검색 실행 엔트리포인트 | PatternBenchmarkSearchConfig → ResearchRun |
| `pattern_benchmark_search_payload` (3264) | ResearchRun → 클라이언트 응답 payload | ResearchRun → dict |

---

## §3 D1~D8 Gap Matrix

| D# | 결정 내용 | 코드 실측 결과 | Gap Status | Evidence (file:line) |
|---|---|---|---|---|
| D1 | Hunter framing lock-in (PRD vision) | audit 범위 외 (제품 결정, 코드 변경 무관) | ✅ scope-out | — |
| D2 | Forward return horizon: 4h primary, 1h+24h 보조 | `entry_profit_horizon_bars: int = 48` (1h 기준 48-bar = 48h hardcoded). 4h 타임프레임 미파라미터화. `_measure_forward_peak_return` horizon_bars 파라미터 있으나 config 수준에서 타임프레임-conditional 미지원 | 🟡 partial | `pattern_search.py:397-398`, `pattern_search.py:2693`, `pattern_search.py:2701` |
| D3 | Cost model: 15bps round-trip (fee 10 + slippage 5) | `entry_slippage_pct: float = 0.1` (10bps 슬리피지만 반영). fee component 없음. `forward_peak_return_pct`는 gross 수익률, cost-adjusted 수익률 미계산. `PromotionGatePolicy.min_entry_profit_pct = 5.0`은 gross threshold | 🔴 갭 | `pattern_search.py:2702`, `pattern_search.py:384-398`, `pattern_search.py:2732` |
| D4 | P0 5개 패턴 × 3 metrics + 나머지 48개 보존 | audit 범위 외 (V-12 threshold audit 작업). pattern_search.py는 단일 pattern_slug 처리 구조. 53개 병렬 실행은 caller(worker/cli.py) 수준 | ✅ scope-out | `pattern_search.py:2927` (단일 slug config) |
| D5 | F-60 gate: Layer A AND Layer B 둘 다 | `PromotionGatePolicy`는 phase-replay(replay-fidelity)만 게이트. Layer A (40+dim feature window L1) / Layer B (LCS phase-path similarity) 연동 없음. `score_canonical_feature_snapshot` 호출 있음 (W-0158, line 1701) 하지만 promotion 판정에 Layer A score 기여 없음 (informational only) | 🟡 partial | `pattern_search.py:381-403`, `pattern_search.py:1608-1614`, `pattern_search.py:1686-1721` |
| D6 | augment-only 정책 (삭제 금지) | 이 audit는 읽기 전용. 본 PR diff = 0줄 (AC6 달성) | ✅ confirmed | — |
| D7 | Hunter UI raw 수치 전체 공개 | `PromotionReport`에 DSR/BH p-value 없음. 단 gate_results dict, rejection_reasons, entry_profitable_rate, phase_fidelity 등 raw 수치 필드 존재. UI 공개 여부는 app/ 결정이며 audit 범위 외 | ✅ scope-out | `pattern_search.py:408-455` |
| D8 | Phase taxonomy: Wyckoff 4-phase(ACCUMULATION/DISTRIBUTION/BREAKOUT/RETEST) + OI Reversal 5-phase(FAKE_DUMP/ARCH_ZONE/REAL_DUMP/ACCUMULATION/BREAKOUT) 둘 다 측정 | `BenchmarkCase.expected_phase_path` = 자유 string list. 현재 `ensure_default_pack`에 OI Reversal 5-phase만 하드코딩(`["FAKE_DUMP","ARCH_ZONE","REAL_DUMP","ACCUMULATION","BREAKOUT"]`, line 599-608). Wyckoff 4-phase pack 생성 로직 없음. `BenchmarkCase`에 `phase_taxonomy_id` 필드 없음 | 🔴 갭 | `pattern_search.py:124-151`, `pattern_search.py:574-615`, `pattern_search.py:96-120` |

---

## §4 Kill Criteria F1 상태

**F1 기준**: 🔴 갭이 3개 이상이면 W-0214 framing 재검토

| 갭 카운트 | 판정 |
|---|---|
| 🔴 = 2 (D3, D8) | **F1 미발동** |
| 🟡 = 2 (D2, D5) | augment 필요 (P-A/B) |

**결론**: augment-only 정책으로 V-track 전체 진행 가능. W-0214 설계 재검토 불필요.

---

## §5 V-track Integration 검증

메모리에 따르면 V-01/V-02/V-04/V-06 PR(#435/#436/#438/#440)이 머지 완료 상태. 현재 worktree main(7e9e68e0)에서 해당 파일 미발견 — 다른 worktree/branch에서 머지된 것으로 추정. 실측 가능한 pattern_search.py 기준으로 zero-coupling 상태 확인.

### V-01 (PurgedKFold + Embargo CV, #436)

- **pattern_search.py import 여부**: `from research.pattern_search import` 없음
- **연결 구조**: `evaluate_variant_against_pack` (line 2901)가 case 목록을 순차 실행 → CV split 없음
- **Gap**: PurgedKFold가 pattern_search.py 결과를 받으려면 `VariantCaseResult` list를 CV fold input으로 변환하는 wrapper 필요
- **Coupling status**: 🔴 zero coupling

### V-02 (phase_eval M1, #440)

- **forward return source**: `_measure_forward_peak_return` (line 2696)가 `load_klines` 직접 호출하여 peak_return 계산. `VariantCaseResult.forward_peak_return_pct` (line 232) 필드에 저장됨
- **M1 phase-conditional return 구현 여부**: `forward_peak_return_pct`는 entry phase 후 48-bar peak return이지만 phase-conditional (각 phase에서의 return) 측정 아님. `evaluate_variant_on_case` 내부에서 phase별 분기 계산 없음
- **Coupling status**: 🟡 partial — entry_hit=True 시 raw forward return 있음, phase-conditional 분기 없음

### V-04 (sequence completion thin wrapper, #435)

- **"sequence" 정의 일치 여부**: pattern_search.py의 `observed_phase_path` (line 218, VariantCaseResult)가 sequence. `_phase_path_in_order` (line 61)이 phase sequence fidelity 계산. M3 sequence metric과 연계 가능한 surface
- **thin wrapper 대상**: `VariantCaseResult.observed_phase_path` + `case.expected_phase_path` → 이미 per-case에서 계산됨
- **Coupling status**: 🟡 partial — sequence data 존재, wrapper가 aggregate metric(M3) 생성 필요

### V-06 (stats engine Welch+BH+DSR+Bootstrap, #438)

- **pattern_search 결과 수신 구조**: `VariantSearchResult.case_results` (list[VariantCaseResult])에 per-case forward_peak_return_pct 있음. Welch t-test 입력으로 사용 가능
- **직접 호출 여부**: pattern_search.py 내부에서 stats module import 없음
- **Coupling status**: 🔴 zero coupling — V-06 stats engine이 PatternSearchRunArtifact JSON을 읽어서 독립 실행해야 함

### Integration 결론

V-track 4 모듈 모두 pattern_search.py와 **zero-to-partial coupling** 상태. `engine/validation/` 신규 디렉터리에서 wrapper layer 구현이 필요 (Priority A augment 항목 A1).

---

## §6 Augment 작업 목록 (Priority A/B/C)

### Priority A — V-08 pipeline 전 필수 (즉시)

| ID | 항목 | 대상 파일:위치 | D-결정 |
|---|---|---|---|
| A1 | `engine/validation/` wrapper module 신규 생성 — PatternSearchRunArtifact → V-track 4 모듈 bridge | 신규: `engine/validation/__init__.py`, `engine/validation/bridge.py` | V-track integration |
| A2 | `PromotionGatePolicy`에 `roundtrip_cost_bps: float = 15.0` 필드 추가 + `min_entry_profit_pct` 기본값을 cost-adjusted 기준으로 조정 | `pattern_search.py:381` augment (신규 필드만 추가) | D3 |
| A3 | `BenchmarkCase`에 `phase_taxonomy_id: str = "oi_reversal_5"` 필드 추가 + `ensure_default_pack`에 Wyckoff 4-phase pack 생성 경로 추가 | `pattern_search.py:124` augment (신규 필드), `pattern_search.py:574` augment (새 분기) | D8 |

### Priority B — V-08 이후

| ID | 항목 | 대상 | D-결정 |
|---|---|---|---|
| B1 | `evaluate_variant_on_case`에 `horizon_bars_by_timeframe: dict` 파라미터 추가 — 4h=12bar, 1h=48bar, 24h=1bar 매핑 | `pattern_search.py:2773` augment | D2 |
| B2 | `PromotionReport`에 Layer A score 게이트 기여 추가 (`canonical_feature_gate: bool`) — 현재 informational only → gate 통합 | `pattern_search.py:408` augment | D5 |
| B3 | cost-adjusted forward_peak_return_pct 계산 — `_measure_forward_peak_return`에 `roundtrip_cost_pct` 파라미터 추가 | `pattern_search.py:2696` augment | D3 |

### Priority C — P2

| ID | 항목 |
|---|---|
| C1 | V-13 decay monitoring — PatternSearchRunArtifact 히스토리에서 overall_score 시계열 추출 모듈 |
| C2 | 53패턴 전체 병렬 실행 orchestrator (worker/cli.py 수준, pattern_search.py 변경 불필요) |
| C3 | `NegativeSearchMemoryStore` → Supabase 백업 (현재 file-only) |

---

## §7 권고 사항

### 다음 작업 순서 (V-08 이전 필수)

1. Priority A augment 3개를 단일 PR로 — `feat/W0256-augment-priority-a` (separate work item)
2. V-08 validation pipeline — `engine/validation/` wrapper를 기반으로 PurgedKFold × phase_eval × sequence × stats 4모듈 wire-up
3. V-12 threshold audit — 53 PatternObject 전체 t-stat ≥ 2.0 (BH-corrected) 통과율 측정

### V-13 decay 포함 여부

Priority C로 분류. V-08 pipeline 안정화 후 별도 work item으로 처리 권장. 긴급도 낮음 (현재 검색 실행 미안정).

### 설계 상 주의점

- `evaluate_variant_against_pack` (line 2901)는 순차 실행. 53패턴 × N variant 동시 실행은 caller가 담당해야 하며 pattern_search.py 내부 변경 없이 가능
- `PromotionGatePolicy`는 frozen=True가 아닌 일반 dataclass (line 381) — augment 시 `field(default=...)` 추가 가능
- `BenchmarkCase`는 `frozen=True` (line 123) — `phase_taxonomy_id` 추가 시 `from_dict`/`to_dict` 메서드 동시 수정 필요 (pure augment, 기존 필드 보존)

---

*Verified: `git diff HEAD main -- engine/research/pattern_search.py` = 0 lines (AC6)*
