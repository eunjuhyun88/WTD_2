from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import pytest

from patterns.active_variant_registry import ActivePatternVariantStore
from research.pattern_search import (
    DEFAULT_FAMILY_SELECTION_POLICY,
    BenchmarkCase,
    BenchmarkPackStore,
    DurationRecommendation,
    DEFAULT_PROMOTION_GATE_POLICY,
    FamilySelectionPolicy,
    NegativeSearchMemoryEntry,
    NegativeSearchMemoryStore,
    PhaseAttemptSummary,
    PatternBenchmarkSearchConfig,
    PatternSearchRunArtifact,
    PatternSearchArtifactStore,
    PatternVariantSpec,
    PromotionGatePolicy,
    PromotionReport,
    ReplayBenchmarkPack,
    SearchFamilyInsight,
    TimeframeRecommendation,
    VariantCaseResult,
    VariantDeltaInsight,
    VariantSearchResult,
    build_duration_recommendations,
    build_promotion_report,
    build_search_family_insights,
    build_mutation_branch_insights,
    build_timeframe_recommendations,
    build_variant_delta_insights,
    build_variant_pattern,
    evaluate_variant_against_pack,
    expand_variants_across_durations,
    expand_variants_across_timeframes,
    build_search_variants,
    branch_is_unhealthy,
    generate_active_family_variants,
    generate_reset_variants,
    generate_auto_variants,
    generate_mutation_variants,
    has_viable_reset_family,
    run_pattern_benchmark_search,
    select_active_family_insight,
    select_preferred_reset_artifact_from_history,
    select_mutation_anchor_from_history,
    select_mutation_anchor_variant_slug,
    should_use_reset_lane,
    _filter_candidate_timeframes_for_pack,
)
from ledger.types import PatternLedgerRecord
from research.state_store import ResearchStateStore
from research.worker_control import ResearchWorkerController


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(timezone.utc)


def test_benchmark_pack_store_roundtrip(tmp_path) -> None:
    store = BenchmarkPackStore(tmp_path / "packs")
    pack = ReplayBenchmarkPack(
        benchmark_pack_id="pack-1",
        pattern_slug="tradoor-oi-reversal-v1",
        candidate_timeframes=["1h"],
        cases=[
            BenchmarkCase(
                symbol="PTBUSDT",
                timeframe="1h",
                start_at=_dt("2026-04-13T00:00:00+00:00"),
                end_at=_dt("2026-04-15T12:00:00+00:00"),
                expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP"],
            )
        ],
    )
    store.save(pack)

    loaded = store.load("pack-1")
    assert loaded is not None
    assert loaded.pattern_slug == "tradoor-oi-reversal-v1"
    assert loaded.cases[0].symbol == "PTBUSDT"


def test_build_variant_pattern_applies_accumulation_overrides() -> None:
    variant = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__wide-window",
        timeframe="1h",
        phase_overrides={
            "ACCUMULATION": {
                "phase_score_threshold": 0.61,
                "transition_window_bars": 18,
            }
        },
    )

    pattern = build_variant_pattern("tradoor-oi-reversal-v1", variant)
    accumulation = next(phase for phase in pattern.phases if phase.phase_id == "ACCUMULATION")

    assert pattern.slug == "tradoor-oi-reversal-v1__wide-window"
    assert accumulation.phase_score_threshold == 0.61
    assert accumulation.transition_window_bars == 18


def test_build_variant_pattern_scales_bar_windows_for_higher_timeframe_family() -> None:
    variant = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical__tf-4h",
        timeframe="4h",
    )

    pattern = build_variant_pattern("tradoor-oi-reversal-v1", variant)
    arch_zone = next(phase for phase in pattern.phases if phase.phase_id == "ARCH_ZONE")
    real_dump = next(phase for phase in pattern.phases if phase.phase_id == "REAL_DUMP")
    accumulation = next(phase for phase in pattern.phases if phase.phase_id == "ACCUMULATION")

    assert arch_zone.min_bars == 1
    assert arch_zone.max_bars == 12
    # REAL_DUMP max_bars widened 4 -> 12 -> 18 at 1h (Park-Hahn-Lee 2023 +
    # W-0086 FARTCOIN empirical calibration). 18 * (60/240) = 4.5 → 4 at 4h
    # under Python banker's rounding. transition_window_bars tracks max_bars.
    assert real_dump.max_bars == 4
    assert accumulation.transition_window_bars == 4
    assert accumulation.min_bars == 2


def test_build_variant_pattern_scales_overrides_for_higher_timeframe_family() -> None:
    variant = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__wide-window__tf-4h",
        timeframe="4h",
        phase_overrides={
            "ACCUMULATION": {
                "phase_score_threshold": 0.61,
                "transition_window_bars": 16,
            }
        },
    )

    pattern = build_variant_pattern("tradoor-oi-reversal-v1", variant)
    accumulation = next(phase for phase in pattern.phases if phase.phase_id == "ACCUMULATION")

    assert accumulation.phase_score_threshold == 0.61
    assert accumulation.transition_window_bars == 4


def test_seed_variants_cover_early_and_late_phase_hypotheses() -> None:
    from research.pattern_search import build_seed_variants

    variants = build_seed_variants("tradoor-oi-reversal-v1")
    slugs = {variant.variant_slug for variant in variants}

    assert len(variants) >= 7
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose" in slugs
    assert "tradoor-oi-reversal-v1__real-patience-accum-early" in slugs
    assert "tradoor-oi-reversal-v1__holdout-recovery-bias" in slugs
    assert "tradoor-oi-reversal-v1__intraday-dump-cluster" in slugs


def test_expand_variants_across_timeframes_adds_higher_timeframe_family() -> None:
    variants = expand_variants_across_timeframes(
        [
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__canonical",
                timeframe="1h",
            )
        ],
        ["1h", "4h"],
    )
    by_slug = {variant.variant_slug: variant for variant in variants}

    assert "tradoor-oi-reversal-v1__canonical" in by_slug
    assert "tradoor-oi-reversal-v1__canonical__tf-4h" in by_slug
    assert by_slug["tradoor-oi-reversal-v1__canonical__tf-4h"].timeframe == "4h"


def test_expand_variants_across_timeframes_keeps_subhour_targets_from_1h_base() -> None:
    variants = expand_variants_across_timeframes(
        [
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__canonical",
                timeframe="1h",
            )
        ],
        ["15m", "1h", "4h"],
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__canonical" in slugs
    assert "tradoor-oi-reversal-v1__canonical__tf-15m" in slugs
    assert "tradoor-oi-reversal-v1__canonical__tf-4h" in slugs


def test_filter_candidate_timeframes_for_pack_drops_unsupported_subhour_data(monkeypatch) -> None:
    pack = ReplayBenchmarkPack(
        benchmark_pack_id="pack-1",
        pattern_slug="tradoor-oi-reversal-v1",
        candidate_timeframes=["15m", "1h", "4h"],
        cases=[
            BenchmarkCase(
                symbol="PTBUSDT",
                timeframe="1h",
                start_at=_dt("2026-04-13T00:00:00+00:00"),
                end_at=_dt("2026-04-14T00:00:00+00:00"),
                expected_phase_path=["FAKE_DUMP", "ACCUMULATION", "BREAKOUT"],
            )
        ],
    )

    def fake_load_klines(symbol: str, timeframe: str, offline: bool = False):
        if timeframe == "15m":
            raise FileNotFoundError("missing native 15m cache")
        index = pd.date_range("2026-04-13T00:00:00Z", periods=4, freq="1h", tz="UTC")
        return pd.DataFrame({"close": [1.0, 1.0, 1.0, 1.0]}, index=index)

    monkeypatch.setattr("research.pattern_search.load_klines", fake_load_klines)

    supported = _filter_candidate_timeframes_for_pack(pack, base_timeframe="1h")

    assert supported == ["1h", "4h"]


def test_evaluate_variant_on_case_scales_warmup_and_normalizes_lead_time(monkeypatch) -> None:
    case = BenchmarkCase(
        symbol="PTBUSDT",
        timeframe="1h",
        start_at=_dt("2026-04-13T00:00:00+00:00"),
        end_at=_dt("2026-04-14T00:00:00+00:00"),
        expected_phase_path=["FAKE_DUMP", "ACCUMULATION", "BREAKOUT"],
    )
    variant = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical__tf-4h",
        timeframe="4h",
    )
    pattern = build_variant_pattern("tradoor-oi-reversal-v1", variant)
    captured: dict[str, int] = {}

    def fake_slice_case_frames(case_arg, *, timeframe, warmup_bars):
        captured["warmup_bars"] = warmup_bars
        index = pd.date_range(case_arg.start_at, periods=3, freq="4h")
        frames = pd.DataFrame({"close": [1.0, 1.0, 1.0]}, index=index)
        return frames, frames

    class _Replay:
        current_phase = "BREAKOUT"
        phase_history = [
            ("FAKE_DUMP", _dt("2026-04-13T00:00:00+00:00")),
            ("ACCUMULATION", _dt("2026-04-13T08:00:00+00:00")),
            ("BREAKOUT", _dt("2026-04-13T16:00:00+00:00")),
        ]

    monkeypatch.setattr("research.pattern_search._slice_case_frames", fake_slice_case_frames)
    monkeypatch.setattr("research.pattern_search.replay_pattern_frames", lambda *args, **kwargs: _Replay())

    result = evaluate_variant_against_pack(
        ReplayBenchmarkPack(
            benchmark_pack_id="pack-1",
            pattern_slug="tradoor-oi-reversal-v1",
            candidate_timeframes=["1h", "4h"],
            cases=[case],
        ),
        variant,
        warmup_bars=240,
    )

    assert captured["warmup_bars"] == 60
    assert result.case_results[0].lead_bars == 2
    assert result.case_results[0].score == pytest.approx(0.966667)


def test_evaluate_variant_against_pack_compresses_expected_phase_path_for_4h_family(monkeypatch) -> None:
    case = BenchmarkCase(
        symbol="PTBUSDT",
        timeframe="1h",
        start_at=_dt("2026-04-13T00:00:00+00:00"),
        end_at=_dt("2026-04-14T00:00:00+00:00"),
        expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
    )
    variant = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h",
        timeframe="4h",
    )

    def fake_slice_case_frames(case_arg, *, timeframe, warmup_bars):
        index = pd.date_range(case_arg.start_at, periods=2, freq="4h")
        frames = pd.DataFrame({"close": [1.0, 1.0]}, index=index)
        return frames, frames

    class _Replay:
        current_phase = "ARCH_ZONE"
        phase_history = [
            ("ARCH_ZONE", _dt("2026-04-13T04:00:00+00:00")),
        ]

    monkeypatch.setattr("research.pattern_search._slice_case_frames", fake_slice_case_frames)
    monkeypatch.setattr("research.pattern_search.replay_pattern_frames", lambda *args, **kwargs: _Replay())

    result = evaluate_variant_against_pack(
        ReplayBenchmarkPack(
            benchmark_pack_id="pack-1",
            pattern_slug="tradoor-oi-reversal-v1",
            candidate_timeframes=["1h", "4h"],
            cases=[case],
        ),
        variant,
        warmup_bars=240,
    )

    assert result.case_results[0].observed_phase_path == ["ARCH_ZONE"]
    assert result.case_results[0].score == pytest.approx(0.166667)


def test_generate_auto_variants_uses_negative_memory_and_phase_attempts() -> None:
    variants = generate_auto_variants(
        "tradoor-oi-reversal-v1",
        negative_memory=[
            {
                "winner_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                "tags": ["benchmark-pack", "dead-end", "variant-miss", "tradoor-oi-reversal-v1"],
            }
        ],
        phase_attempt_summary=PhaseAttemptSummary(
            failed_reason_counts={"missing_any_group": 5},
            missing_block_counts={"positive_funding_bias": 3, "higher_lows_sequence": 2},
            total_attempts=5,
        ),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__auto-funding-flex" in slugs
    assert "tradoor-oi-reversal-v1__auto-reclaim-early" in slugs
    assert "tradoor-oi-reversal-v1__auto-holdout-depth" in slugs


def test_generate_mutation_variants_follow_latest_winner_holdout_block() -> None:
    latest_artifact = {
        "winner_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
        "variant_results": [
            {
                "variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                "case_results": [
                    {
                        "case_id": "ref-1",
                        "symbol": "PTBUSDT",
                        "role": "reference",
                        "current_phase": "ACCUMULATION",
                        "score": 0.54,
                        "missing_block_counts": {"sideways_compression": 3},
                    },
                    {
                        "case_id": "holdout-1",
                        "symbol": "TRADOORUSDT",
                        "role": "holdout",
                        "current_phase": "ARCH_ZONE",
                        "score": 0.14,
                        "missing_block_counts": {},
                    },
                ],
            },
            {
                "variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-proxy",
                "reference_score": 0.24,
                "holdout_score": 0.24,
                "overall_score": 0.24,
                "case_results": [],
            },
        ],
    }

    variants = generate_mutation_variants(
        "tradoor-oi-reversal-v1",
        latest_artifact=latest_artifact,
        available_variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
                phase_overrides={
                    "REAL_DUMP": {"max_bars": 8},
                },
            )
        ],
        phase_attempt_summary=PhaseAttemptSummary(
            failed_reason_counts={"missing_any_group": 4},
            missing_block_counts={"positive_funding_bias": 3, "higher_lows_sequence": 2},
            total_attempts=4,
        ),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock" in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-proxy" not in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded" in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-holdout-window" in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-accum-bridge" in slugs


def test_build_variant_delta_insights_tracks_parent_relative_tradeoff() -> None:
    insights = build_variant_delta_insights(
        [
            VariantSearchResult(
                variant_id="base",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_score=0.54,
                holdout_score=0.14,
                overall_score=0.42,
                case_results=[],
            ),
            VariantSearchResult(
                variant_id="guarded",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
                reference_score=0.54,
                holdout_score=0.24,
                overall_score=0.45,
                case_results=[],
            ),
            VariantSearchResult(
                variant_id="proxy",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-proxy",
                reference_score=0.24,
                holdout_score=0.24,
                overall_score=0.24,
                case_results=[],
            ),
        ]
    )
    insight_by_slug = {insight.variant_slug: insight for insight in insights}

    assert insight_by_slug["tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded"].base_variant_slug == "tradoor-oi-reversal-v1__arch-soft-real-loose"
    assert insight_by_slug["tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded"].classification == "productive"
    assert insight_by_slug["tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-proxy"].classification == "damaging"
    assert insight_by_slug["tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-proxy"].damage_adjusted_gain < 0


def test_build_variant_delta_insights_skips_timeframe_family_clones() -> None:
    insights = build_variant_delta_insights(
        [
            VariantSearchResult(
                variant_id="base",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_score=0.54,
                holdout_score=0.14,
                overall_score=0.42,
                case_results=[],
            ),
            VariantSearchResult(
                variant_id="tf-4h",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h",
                reference_score=0.166667,
                holdout_score=0.166667,
                overall_score=0.166667,
                case_results=[],
            ),
        ]
    )

    assert insights == []


def test_build_mutation_branch_insights_scores_productive_family_above_damaging_family() -> None:
    branch_insights = build_mutation_branch_insights(
        [
            VariantDeltaInsight(
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                base_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_delta=0.0,
                holdout_delta=0.04,
                overall_delta=0.012,
                damage_adjusted_gain=0.04,
                classification="productive",
            ),
            VariantDeltaInsight(
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-proxy",
                base_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_delta=-0.3,
                holdout_delta=0.1,
                overall_delta=-0.18,
                damage_adjusted_gain=-0.2,
                classification="damaging",
            ),
            VariantDeltaInsight(
                variant_slug="tradoor-oi-reversal-v1__canonical__mut-real-unlock",
                base_variant_slug="tradoor-oi-reversal-v1__canonical",
                reference_delta=0.0,
                holdout_delta=0.02,
                overall_delta=0.004,
                damage_adjusted_gain=0.02,
                classification="productive",
            ),
        ]
    )
    by_anchor = {insight.anchor_variant_slug: insight for insight in branch_insights}

    assert by_anchor["tradoor-oi-reversal-v1__canonical"].branch_score > 0
    assert by_anchor["tradoor-oi-reversal-v1__arch-soft-real-loose"].damaging_count == 1
    assert by_anchor["tradoor-oi-reversal-v1__canonical"].branch_score > by_anchor["tradoor-oi-reversal-v1__arch-soft-real-loose"].branch_score


def test_build_search_family_insights_marks_viable_and_damaging_reset_families() -> None:
    variant_results = [
        VariantSearchResult(
            variant_id="winner",
            variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            reference_score=0.54,
            holdout_score=0.14,
            overall_score=0.42,
            case_results=[],
        ),
        VariantSearchResult(
            variant_id="reset-good",
            variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression",
            reference_score=0.54,
            holdout_score=0.14,
            overall_score=0.42,
            case_results=[],
        ),
        VariantSearchResult(
            variant_id="reset-bad",
            variant_slug="tradoor-oi-reversal-v1__reset-real-proxy-balance",
            reference_score=0.24,
            holdout_score=0.24,
            overall_score=0.24,
            case_results=[],
        ),
    ]
    variant_specs = [
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            timeframe="1h",
            search_origin="manual",
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression",
            timeframe="1h",
            search_origin="reset_lane",
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__reset-real-proxy-balance",
            timeframe="1h",
            search_origin="reset_lane",
        ),
    ]

    insights = build_search_family_insights(variant_results, variant_specs, [])
    by_key = {insight.family_key: insight for insight in insights}

    assert by_key["tradoor-oi-reversal-v1__reset-reclaim-compression"].classification == "viable"
    assert by_key["tradoor-oi-reversal-v1__reset-real-proxy-balance"].classification == "damaging"


def test_select_active_family_insight_prefers_viable_reset_family_when_tied_with_manual() -> None:
    family_insights = [
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__arch-soft-real-loose",
            family_type="manual",
            representative_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            member_variant_slugs=["tradoor-oi-reversal-v1__arch-soft-real-loose"],
            best_reference_score=0.54,
            best_holdout_score=0.14,
            best_overall_score=0.42,
            family_score=0.455,
            classification="viable",
        ),
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__reset-reclaim-compression",
            family_type="reset_lane",
            representative_variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression",
            member_variant_slugs=["tradoor-oi-reversal-v1__reset-reclaim-compression"],
            best_reference_score=0.54,
            best_holdout_score=0.14,
            best_overall_score=0.42,
            family_score=0.455,
            classification="viable",
        ),
    ]

    active = select_active_family_insight(family_insights, [])

    assert active is not None
    assert active.family_key == "tradoor-oi-reversal-v1__reset-reclaim-compression"


def test_select_active_family_insight_keeps_recent_active_family_when_still_top_band() -> None:
    family_insights = [
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__arch-soft-real-loose",
            family_type="manual",
            representative_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            member_variant_slugs=["tradoor-oi-reversal-v1__arch-soft-real-loose"],
            best_reference_score=0.54,
            best_holdout_score=0.14,
            best_overall_score=0.42,
            family_score=0.455,
            classification="viable",
        ),
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__reset-reclaim-compression",
            family_type="reset_lane",
            representative_variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression",
            member_variant_slugs=["tradoor-oi-reversal-v1__reset-reclaim-compression"],
            best_reference_score=0.54,
            best_holdout_score=0.13,
            best_overall_score=0.419,
            family_score=0.452,
            classification="viable",
        ),
    ]

    active = select_active_family_insight(
        family_insights,
        [{"active_family_key": "tradoor-oi-reversal-v1__arch-soft-real-loose"}],
    )

    assert active is not None
    assert active.family_key == "tradoor-oi-reversal-v1__arch-soft-real-loose"


def test_select_active_family_insight_uses_policy_stickiness_band() -> None:
    family_insights = [
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__manual-a",
            family_type="manual",
            representative_variant_slug="tradoor-oi-reversal-v1__manual-a",
            member_variant_slugs=["tradoor-oi-reversal-v1__manual-a"],
            best_reference_score=0.54,
            best_holdout_score=0.14,
            best_overall_score=0.42,
            family_score=0.455,
            classification="viable",
        ),
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__reset-b",
            family_type="reset_lane",
            representative_variant_slug="tradoor-oi-reversal-v1__reset-b",
            member_variant_slugs=["tradoor-oi-reversal-v1__reset-b"],
            best_reference_score=0.54,
            best_holdout_score=0.14,
            best_overall_score=0.42,
            family_score=0.461,
            classification="viable",
        ),
    ]

    sticky = select_active_family_insight(
        family_insights,
        [{"active_family_key": "tradoor-oi-reversal-v1__manual-a"}],
        FamilySelectionPolicy(
            policy_id="sticky",
            family_type_priority=DEFAULT_FAMILY_SELECTION_POLICY.family_type_priority,
            active_family_stickiness_band=0.01,
        ),
    )
    strict = select_active_family_insight(
        family_insights,
        [{"active_family_key": "tradoor-oi-reversal-v1__manual-a"}],
        FamilySelectionPolicy(
            policy_id="strict",
            family_type_priority=DEFAULT_FAMILY_SELECTION_POLICY.family_type_priority,
            active_family_stickiness_band=0.001,
        ),
    )

    assert sticky is not None and sticky.family_key == "tradoor-oi-reversal-v1__manual-a"
    assert strict is not None and strict.family_key == "tradoor-oi-reversal-v1__reset-b"


def test_select_mutation_anchor_variant_prefers_productive_reconstructable_branch() -> None:
    artifact = PatternSearchRunArtifact(
        research_run_id="run-1",
        pattern_slug="tradoor-oi-reversal-v1",
        benchmark_pack_id="pack-1",
        winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
        variant_results=[
            VariantSearchResult(
                variant_id="winner",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_score=0.54,
                holdout_score=0.14,
                overall_score=0.42,
                case_results=[],
            ),
            VariantSearchResult(
                variant_id="productive",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                reference_score=0.54,
                holdout_score=0.14,
                overall_score=0.42,
                case_results=[],
            ),
        ],
        variant_specs=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            ),
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                timeframe="1h",
            ),
        ],
        variant_deltas=[
            VariantDeltaInsight(
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                base_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_delta=0.0,
                holdout_delta=0.04,
                overall_delta=0.012,
                damage_adjusted_gain=0.04,
                classification="productive",
            )
        ],
        branch_insights=build_mutation_branch_insights(
            [
                VariantDeltaInsight(
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                    base_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    reference_delta=0.0,
                    holdout_delta=0.04,
                    overall_delta=0.012,
                    damage_adjusted_gain=0.04,
                    classification="productive",
                )
            ]
        ),
    ).to_dict()

    assert (
        select_mutation_anchor_variant_slug(artifact)
        == "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock"
    )


def test_select_mutation_anchor_from_history_prefers_stronger_prior_branch() -> None:
    older = PatternSearchRunArtifact(
        research_run_id="run-older",
        pattern_slug="tradoor-oi-reversal-v1",
        benchmark_pack_id="pack-1",
        winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
        variant_results=[
            VariantSearchResult(
                variant_id="older-winner",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
                reference_score=0.54,
                holdout_score=0.24,
                overall_score=0.45,
                case_results=[],
            )
        ],
        variant_specs=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
                timeframe="1h",
            )
        ],
        branch_insights=[
            {
                "anchor_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
                "descendant_count": 0,
                "productive_count": 0,
                "damaging_count": 0,
                "flat_count": 0,
                "avg_damage_adjusted_gain": 0.0,
                "best_damage_adjusted_gain": 0.0,
                "best_overall_delta": 0.0,
                "branch_score": 0.0,
            }
        ],
        created_at=_dt("2026-04-16T19:03:53+00:00"),
    ).to_dict()
    newer = PatternSearchRunArtifact(
        research_run_id="run-newer",
        pattern_slug="tradoor-oi-reversal-v1",
        benchmark_pack_id="pack-1",
        winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
        variant_results=[
            VariantSearchResult(
                variant_id="newer-winner",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_score=0.54,
                holdout_score=0.14,
                overall_score=0.42,
                case_results=[],
            ),
            VariantSearchResult(
                variant_id="newer-productive",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                reference_score=0.54,
                holdout_score=0.14,
                overall_score=0.42,
                case_results=[],
            ),
        ],
        variant_specs=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            ),
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                timeframe="1h",
            ),
        ],
        variant_deltas=[
            VariantDeltaInsight(
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                base_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_delta=0.0,
                holdout_delta=0.04,
                overall_delta=0.012,
                damage_adjusted_gain=0.04,
                classification="productive",
            )
        ],
        branch_insights=[
            {
                "anchor_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                "descendant_count": 0,
                "productive_count": 0,
                "damaging_count": 0,
                "flat_count": 0,
                "avg_damage_adjusted_gain": 0.0,
                "best_damage_adjusted_gain": 0.0,
                "best_overall_delta": 0.0,
                "branch_score": 0.0,
            }
        ],
        created_at=_dt("2026-04-16T19:28:15+00:00"),
    ).to_dict()

    anchor_artifact, anchor_slug = select_mutation_anchor_from_history([newer, older])

    assert anchor_artifact["research_run_id"] == "run-older"
    assert anchor_slug == "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded"


def test_select_mutation_anchor_from_history_prefers_better_branch_health_over_flat_higher_parent() -> None:
    healthier_older = PatternSearchRunArtifact(
        research_run_id="run-older",
        pattern_slug="tradoor-oi-reversal-v1",
        benchmark_pack_id="pack-1",
        winner_variant_slug="tradoor-oi-reversal-v1__canonical__mut-real-unlock",
        variant_results=[
            VariantSearchResult(
                variant_id="older-anchor",
                variant_slug="tradoor-oi-reversal-v1__canonical__mut-real-unlock",
                reference_score=0.53,
                holdout_score=0.18,
                overall_score=0.425,
                case_results=[],
            )
        ],
        variant_specs=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__canonical__mut-real-unlock",
                timeframe="1h",
            )
        ],
        branch_insights=[
            {
                "anchor_variant_slug": "tradoor-oi-reversal-v1__canonical__mut-real-unlock",
                "descendant_count": 2,
                "productive_count": 1,
                "damaging_count": 0,
                "flat_count": 0,
                "avg_damage_adjusted_gain": 0.05,
                "best_damage_adjusted_gain": 0.06,
                "best_overall_delta": 0.02,
                "branch_score": 0.051,
            }
        ],
        created_at=_dt("2026-04-16T18:00:00+00:00"),
    ).to_dict()
    flatter_newer = PatternSearchRunArtifact(
        research_run_id="run-newer",
        pattern_slug="tradoor-oi-reversal-v1",
        benchmark_pack_id="pack-1",
        winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
        variant_results=[
            VariantSearchResult(
                variant_id="newer-anchor",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_score=0.54,
                holdout_score=0.14,
                overall_score=0.42,
                case_results=[],
            )
        ],
        variant_specs=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            )
        ],
        branch_insights=[
            {
                "anchor_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                "descendant_count": 2,
                "productive_count": 0,
                "damaging_count": 1,
                "flat_count": 1,
                "avg_damage_adjusted_gain": -0.03,
                "best_damage_adjusted_gain": 0.0,
                "best_overall_delta": 0.0,
                "branch_score": -0.11,
            }
        ],
        created_at=_dt("2026-04-16T19:00:00+00:00"),
    ).to_dict()

    anchor_artifact, anchor_slug = select_mutation_anchor_from_history([flatter_newer, healthier_older])

    assert anchor_artifact["research_run_id"] == "run-older"
    assert anchor_slug == "tradoor-oi-reversal-v1__canonical__mut-real-unlock"


def test_select_mutation_anchor_from_history_requires_reconstructable_spec() -> None:
    non_reconstructable_older = PatternSearchRunArtifact(
        research_run_id="run-older",
        pattern_slug="tradoor-oi-reversal-v1",
        benchmark_pack_id="pack-1",
        winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
        variant_results=[
            VariantSearchResult(
                variant_id="older-winner",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
                reference_score=0.54,
                holdout_score=0.24,
                overall_score=0.45,
                case_results=[],
            )
        ],
        variant_specs=[],
        created_at=_dt("2026-04-16T19:03:53+00:00"),
    ).to_dict()
    newer = PatternSearchRunArtifact(
        research_run_id="run-newer",
        pattern_slug="tradoor-oi-reversal-v1",
        benchmark_pack_id="pack-1",
        winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
        variant_results=[
            VariantSearchResult(
                variant_id="newer-winner",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                reference_score=0.54,
                holdout_score=0.14,
                overall_score=0.42,
                case_results=[],
            ),
            VariantSearchResult(
                variant_id="newer-productive",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                reference_score=0.54,
                holdout_score=0.14,
                overall_score=0.42,
                case_results=[],
            ),
        ],
        variant_specs=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            ),
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                timeframe="1h",
            ),
        ],
        variant_deltas=[
            VariantDeltaInsight(
            variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
            base_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            reference_delta=0.0,
            holdout_delta=0.04,
            overall_delta=0.012,
            damage_adjusted_gain=0.04,
            classification="productive",
        )
    ],
        branch_insights=[
            {
                "anchor_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                "descendant_count": 0,
                "productive_count": 0,
                "damaging_count": 0,
                "flat_count": 0,
                "avg_damage_adjusted_gain": 0.0,
                "best_damage_adjusted_gain": 0.0,
                "best_overall_delta": 0.0,
                "branch_score": 0.0,
            }
        ],
        created_at=_dt("2026-04-16T19:28:15+00:00"),
    ).to_dict()

    anchor_artifact, anchor_slug = select_mutation_anchor_from_history([newer, non_reconstructable_older])

    assert anchor_artifact["research_run_id"] == "run-newer"
    assert anchor_slug == "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock"


def test_generate_mutation_variants_use_stored_winner_spec_from_artifact() -> None:
    latest_artifact = {
        "winner_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
        "variant_specs": [
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
                timeframe="1h",
                phase_overrides={"REAL_DUMP": {"max_bars": 12}},
                search_origin="auto_mutation",
            ).to_dict()
        ],
        "variant_results": [
            {
                "variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
                "reference_score": 0.54,
                "holdout_score": 0.24,
                "overall_score": 0.45,
                "case_results": [
                    {
                        "case_id": "holdout-1",
                        "symbol": "TRADOORUSDT",
                        "role": "holdout",
                        "current_phase": "ARCH_ZONE",
                        "score": 0.24,
                        "missing_block_counts": {},
                    }
                ],
            }
        ],
            "variant_deltas": [
                VariantDeltaInsight(
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded__mut-real-proxy",
                    base_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
                    reference_delta=-0.3,
                    holdout_delta=0.0,
                    overall_delta=-0.21,
                damage_adjusted_gain=-0.3,
                classification="damaging",
            ).to_dict()
        ],
    }

    variants = generate_mutation_variants(
        "tradoor-oi-reversal-v1",
        latest_artifact=latest_artifact,
        anchor_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded",
        available_variants=[],
        phase_attempt_summary=PhaseAttemptSummary({}, {}, 0),
    )
    by_slug = {variant.variant_slug: variant for variant in variants}

    guarded_child = by_slug["tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded__mut-real-unlock"]
    assert guarded_child.phase_overrides["REAL_DUMP"]["max_bars"] == 18
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded__mut-real-proxy" not in by_slug
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded__mut-real-guarded" in by_slug


def test_generate_mutation_variants_fall_back_to_latest_winner_when_anchor_branch_is_unhealthy() -> None:
    latest_artifact = {
        "winner_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
        "variant_specs": [
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
                phase_overrides={"REAL_DUMP": {"max_bars": 8}},
            ).to_dict(),
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__canonical__mut-real-unlock__mut-real-unlock",
                timeframe="1h",
                phase_overrides={"REAL_DUMP": {"max_bars": 18}},
                search_origin="auto_mutation",
            ).to_dict(),
        ],
        "variant_results": [
            {
                "variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                "reference_score": 0.54,
                "holdout_score": 0.14,
                "overall_score": 0.42,
                "case_results": [
                    {
                        "case_id": "holdout-1",
                        "symbol": "TRADOORUSDT",
                        "role": "holdout",
                        "current_phase": "ARCH_ZONE",
                        "score": 0.14,
                        "missing_block_counts": {},
                    }
                ],
            },
            {
                "variant_slug": "tradoor-oi-reversal-v1__canonical__mut-real-unlock__mut-real-unlock",
                "reference_score": 0.54,
                "holdout_score": 0.14,
                "overall_score": 0.42,
                "case_results": [
                    {
                        "case_id": "holdout-2",
                        "symbol": "TRADOORUSDT",
                        "role": "holdout",
                        "current_phase": "ARCH_ZONE",
                        "score": 0.14,
                        "missing_block_counts": {},
                    }
                ],
            },
        ],
        "branch_insights": [
            {
                "anchor_variant_slug": "tradoor-oi-reversal-v1__canonical__mut-real-unlock__mut-real-unlock",
                "descendant_count": 3,
                "productive_count": 2,
                "damaging_count": 1,
                "flat_count": 0,
                "avg_damage_adjusted_gain": -0.026667,
                "best_damage_adjusted_gain": 0.04,
                "best_overall_delta": 0.012,
                "branch_score": -0.003467,
            }
        ],
    }

    variants = generate_mutation_variants(
        "tradoor-oi-reversal-v1",
        latest_artifact=latest_artifact,
        anchor_variant_slug="tradoor-oi-reversal-v1__canonical__mut-real-unlock__mut-real-unlock",
        available_variants=[],
        phase_attempt_summary=PhaseAttemptSummary({}, {}, 0),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock" in slugs
    assert "tradoor-oi-reversal-v1__canonical__mut-real-unlock__mut-real-unlock__mut-real-unlock" not in slugs


def test_generate_reset_variants_activate_when_latest_winner_branch_is_unhealthy() -> None:
    latest_artifact = {
        "winner_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
        "branch_insights": [
            {
                "anchor_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                "descendant_count": 3,
                "productive_count": 0,
                "damaging_count": 1,
                "flat_count": 2,
                "avg_damage_adjusted_gain": -0.066667,
                "best_damage_adjusted_gain": 0.0,
                "best_overall_delta": 0.0,
                "branch_score": -0.156667,
            }
        ],
    }

    assert branch_is_unhealthy(latest_artifact, "tradoor-oi-reversal-v1__arch-soft-real-loose") is True

    variants = generate_reset_variants("tradoor-oi-reversal-v1", latest_artifact=latest_artifact)
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-real-proxy-balance" in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression" in slugs
    assert "tradoor-oi-reversal-v1__reset-direct-accum" in slugs


def test_generate_reset_variants_prune_damaging_reset_family_from_latest_artifact() -> None:
    latest_artifact = {
        "winner_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
        "branch_insights": [
            {
                "anchor_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                "descendant_count": 3,
                "productive_count": 0,
                "damaging_count": 1,
                "flat_count": 2,
                "avg_damage_adjusted_gain": -0.066667,
                "best_damage_adjusted_gain": 0.0,
                "best_overall_delta": 0.0,
                "branch_score": -0.156667,
            }
        ],
        "family_insights": [
            {
                "family_key": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                "family_type": "reset_lane",
                "representative_variant_slug": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-real-proxy-balance"],
                "best_reference_score": 0.24,
                "best_holdout_score": 0.24,
                "best_overall_score": 0.24,
                "family_score": 0.3,
                "classification": "damaging",
            },
            {
                "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                "family_type": "reset_lane",
                "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-reclaim-compression"],
                "best_reference_score": 0.54,
                "best_holdout_score": 0.14,
                "best_overall_score": 0.42,
                "family_score": 0.455,
                "classification": "viable",
            },
        ],
    }

    variants = generate_reset_variants("tradoor-oi-reversal-v1", latest_artifact=latest_artifact)
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-real-proxy-balance" not in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression" in slugs
    assert "tradoor-oi-reversal-v1__reset-direct-accum" in slugs


def test_generate_active_family_variants_expand_promoted_reset_family() -> None:
    latest_artifact = {
        "active_family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
        "active_family_type": "reset_lane",
        "family_insights": [
            {
                "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                "family_type": "reset_lane",
                "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-reclaim-compression"],
                "best_reference_score": 0.54,
                "best_holdout_score": 0.14,
                "best_overall_score": 0.42,
                "family_score": 0.455,
                "classification": "viable",
            }
        ],
    }

    variants = generate_active_family_variants(
        "tradoor-oi-reversal-v1",
        latest_artifact=latest_artifact,
        available_variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression",
                timeframe="1h",
                search_origin="reset_lane",
            )
        ],
        phase_attempt_summary=PhaseAttemptSummary(
            failed_reason_counts={"missing_any_group": 3},
            missing_block_counts={"positive_funding_bias": 2, "higher_lows_sequence": 1},
            total_attempts=3,
        ),
    )
    slugs = {variant.variant_slug for variant in variants}
    by_slug = {variant.variant_slug: variant for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window" in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-bias" in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-accum-bridge" in slugs
    assert (
        by_slug["tradoor-oi-reversal-v1__reset-reclaim-compression__fam-accum-bridge"].selection_bias
        > by_slug["tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-bias"].selection_bias
        > by_slug["tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window"].selection_bias
    )


def test_build_search_family_insights_uses_selection_bias_to_break_tied_reset_descendants() -> None:
    variant_results = [
        VariantSearchResult(
            variant_id="window",
            variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window",
            reference_score=0.54,
            holdout_score=0.14,
            overall_score=0.42,
            case_results=[],
        ),
        VariantSearchResult(
            variant_id="bridge",
            variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression__fam-accum-bridge",
            reference_score=0.54,
            holdout_score=0.14,
            overall_score=0.42,
            case_results=[],
        ),
    ]
    variant_specs = [
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window",
            timeframe="1h",
            search_origin="reset_lane",
            selection_bias=0.01,
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression__fam-accum-bridge",
            timeframe="1h",
            search_origin="reset_lane",
            selection_bias=0.03,
        ),
    ]

    insights = build_search_family_insights(variant_results, variant_specs, [])
    assert insights[0].family_key == "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-accum-bridge"
    assert insights[0].family_score > insights[1].family_score


def test_should_use_reset_lane_stays_on_viable_reset_family_even_without_branch_insight() -> None:
    latest_artifact = {
        "winner_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
        "family_insights": [
            {
                "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                "family_type": "reset_lane",
                "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-reclaim-compression"],
                "best_reference_score": 0.54,
                "best_holdout_score": 0.14,
                "best_overall_score": 0.42,
                "family_score": 0.455,
                "classification": "viable",
            }
        ],
    }

    assert has_viable_reset_family(latest_artifact) is True
    assert should_use_reset_lane(latest_artifact) is True


def test_select_preferred_reset_artifact_from_history_prefers_best_viable_reset_family() -> None:
    older = PatternSearchRunArtifact(
        research_run_id="run-older",
        pattern_slug="tradoor-oi-reversal-v1",
        benchmark_pack_id="pack-1",
        winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
        variant_results=[],
        family_insights=[
            {
                "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                "family_type": "reset_lane",
                "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-reclaim-compression"],
                "best_reference_score": 0.54,
                "best_holdout_score": 0.14,
                "best_overall_score": 0.42,
                "family_score": 0.455,
                "classification": "viable",
            }
        ],
        created_at=_dt("2026-04-16T19:45:57+00:00"),
    ).to_dict()
    newer = PatternSearchRunArtifact(
        research_run_id="run-newer",
        pattern_slug="tradoor-oi-reversal-v1",
        benchmark_pack_id="pack-1",
        winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
        variant_results=[],
        family_insights=[
            {
                "family_key": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                "family_type": "reset_lane",
                "representative_variant_slug": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-real-proxy-balance"],
                "best_reference_score": 0.24,
                "best_holdout_score": 0.24,
                "best_overall_score": 0.24,
                "family_score": 0.3,
                "classification": "damaging",
            }
        ],
        created_at=_dt("2026-04-16T19:54:16+00:00"),
    ).to_dict()

    artifact, family_key = select_preferred_reset_artifact_from_history([newer, older])

    assert artifact["research_run_id"] == "run-older"
    assert family_key == "tradoor-oi-reversal-v1__reset-reclaim-compression"


def test_build_search_variants_merges_manual_auto_and_mutation_variants(tmp_path) -> None:
    negative_store = NegativeSearchMemoryStore(tmp_path / "negative")
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    negative_store.save(
        NegativeSearchMemoryEntry(
            memory_id="memory-1",
            pattern_slug="tradoor-oi-reversal-v1",
            research_run_id="run-1",
            benchmark_pack_id="pack-1",
            winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            summary="dead end",
            detail="holdout variant miss",
            tags=["benchmark-pack", "dead-end", "variant-miss", "tradoor-oi-reversal-v1"],
            variant_scores=[],
        )
    )
    artifact_store.save(
        PatternSearchRunArtifact(
            research_run_id="run-last",
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-1",
            winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            variant_specs=[
                PatternVariantSpec(
                    pattern_slug="tradoor-oi-reversal-v1",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    timeframe="1h",
                ),
                PatternVariantSpec(
                    pattern_slug="tradoor-oi-reversal-v1",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                    timeframe="1h",
                )
            ],
            variant_results=[
                VariantSearchResult(
                    variant_id="variant-1",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    reference_score=0.54,
                    holdout_score=0.14,
                    overall_score=0.42,
                    case_results=[
                        VariantCaseResult(
                            case_id="case-1",
                            symbol="TRADOORUSDT",
                            role="holdout",
                            observed_phase_path=["ARCH_ZONE"],
                            current_phase="ARCH_ZONE",
                            phase_fidelity=0.2,
                            phase_depth_progress=0.4,
                            entry_hit=False,
                            target_hit=False,
                            lead_bars=None,
                            score=0.14,
                        )
                    ],
                ),
                VariantSearchResult(
                    variant_id="variant-2",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-proxy",
                    reference_score=0.24,
                    holdout_score=0.24,
                    overall_score=0.24,
                    case_results=[],
                ),
                VariantSearchResult(
                    variant_id="variant-3",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                    reference_score=0.54,
                    holdout_score=0.14,
                    overall_score=0.42,
                    case_results=[
                        VariantCaseResult(
                            case_id="case-2",
                            symbol="TRADOORUSDT",
                            role="holdout",
                            observed_phase_path=["ARCH_ZONE"],
                            current_phase="ARCH_ZONE",
                            phase_fidelity=0.2,
                            phase_depth_progress=0.4,
                            entry_hit=False,
                            target_hit=False,
                            lead_bars=None,
                            score=0.14,
                        )
                    ],
                )
            ],
            variant_deltas=[
                VariantDeltaInsight(
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock",
                    base_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    reference_delta=0.0,
                    holdout_delta=0.04,
                    overall_delta=0.012,
                    damage_adjusted_gain=0.04,
                    classification="productive",
                ),
                VariantDeltaInsight(
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-proxy",
                    base_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    reference_delta=-0.3,
                    holdout_delta=0.1,
                    overall_delta=-0.18,
                    damage_adjusted_gain=-0.2,
                    classification="damaging",
                )
            ],
        )
    )
    phase_attempt = PatternLedgerRecord(
        record_type="phase_attempt",
        pattern_slug="tradoor-oi-reversal-v1",
        symbol="TRADOORUSDT",
        payload={
            "failed_reason": "missing_any_group",
            "missing_blocks": ["positive_funding_bias", "higher_lows_sequence"],
        },
    )

    class FakeRecordStore:
        def list(self, *_args, **_kwargs):
            return [phase_attempt]

    variants = build_search_variants(
        "tradoor-oi-reversal-v1",
        variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            )
        ],
        negative_memory_store=negative_store,
        artifact_store=artifact_store,
        record_store=FakeRecordStore(),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__arch-soft-real-loose" in slugs
    assert "tradoor-oi-reversal-v1__auto-funding-flex" in slugs
    assert "tradoor-oi-reversal-v1__auto-reclaim-early" in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock" in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-proxy" not in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-guarded" in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-holdout-window" in slugs


def test_build_search_variants_switches_to_reset_lane_when_latest_winner_branch_is_unhealthy(tmp_path) -> None:
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    artifact_store.save(
        PatternSearchRunArtifact(
            research_run_id="run-last",
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-1",
            winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            variant_specs=[
                PatternVariantSpec(
                    pattern_slug="tradoor-oi-reversal-v1",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    timeframe="1h",
                )
            ],
            variant_results=[
                VariantSearchResult(
                    variant_id="winner",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    reference_score=0.54,
                    holdout_score=0.14,
                    overall_score=0.42,
                    case_results=[],
                )
            ],
            branch_insights=[
                {
                    "anchor_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                    "descendant_count": 3,
                    "productive_count": 0,
                    "damaging_count": 1,
                    "flat_count": 2,
                    "avg_damage_adjusted_gain": -0.066667,
                    "best_damage_adjusted_gain": 0.0,
                    "best_overall_delta": 0.0,
                    "branch_score": -0.156667,
                }
            ],
        )
    )

    class EmptyRecordStore:
        def list(self, *_args, **_kwargs):
            return []

    variants = build_search_variants(
        "tradoor-oi-reversal-v1",
        variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            )
        ],
        artifact_store=artifact_store,
        record_store=EmptyRecordStore(),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-real-proxy-balance" in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression" in slugs
    assert "tradoor-oi-reversal-v1__reset-direct-accum" in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock" not in slugs


def test_build_search_variants_restore_reset_lane_from_negative_memory_without_artifact(tmp_path) -> None:
    negative_store = NegativeSearchMemoryStore(tmp_path / "negative")
    negative_store.save(
        NegativeSearchMemoryEntry(
            memory_id="memory-reset",
            pattern_slug="tradoor-oi-reversal-v1",
            research_run_id="run-reset",
            benchmark_pack_id="pack-1",
            winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            summary="dead end",
            detail="promoted reset family should remain baseline",
            tags=["benchmark-pack", "dead-end", "variant-miss", "tradoor-oi-reversal-v1"],
            variant_scores=[],
            family_scores=[
                {
                    "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "family_type": "reset_lane",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "best_reference_score": 0.54,
                    "best_holdout_score": 0.14,
                    "best_overall_score": 0.42,
                    "family_score": 0.455,
                    "classification": "viable",
                },
                {
                    "family_key": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                    "family_type": "reset_lane",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                    "best_reference_score": 0.24,
                    "best_holdout_score": 0.24,
                    "best_overall_score": 0.24,
                    "family_score": 0.3,
                    "classification": "damaging",
                },
            ],
            active_family_key="tradoor-oi-reversal-v1__reset-reclaim-compression",
            active_family_type="reset_lane",
            active_family_variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression",
            baseline_family_ref="family:tradoor-oi-reversal-v1__reset-reclaim-compression",
        )
    )

    class EmptyRecordStore:
        def list(self, *_args, **_kwargs):
            return []

    variants = build_search_variants(
        "tradoor-oi-reversal-v1",
        variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            )
        ],
        negative_memory_store=negative_store,
        artifact_store=PatternSearchArtifactStore(tmp_path / "artifacts"),
        record_store=EmptyRecordStore(),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-reclaim-compression" in slugs
    assert "tradoor-oi-reversal-v1__reset-real-proxy-balance" not in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock" not in slugs


def test_build_search_variants_prune_damaging_reset_family_on_followup_runs(tmp_path) -> None:
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    artifact_store.save(
        PatternSearchRunArtifact(
            research_run_id="run-last",
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-1",
            winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            variant_specs=[
                PatternVariantSpec(
                    pattern_slug="tradoor-oi-reversal-v1",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    timeframe="1h",
                )
            ],
            variant_results=[
                VariantSearchResult(
                    variant_id="winner",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    reference_score=0.54,
                    holdout_score=0.14,
                    overall_score=0.42,
                    case_results=[],
                )
            ],
            branch_insights=[
                {
                    "anchor_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                    "descendant_count": 3,
                    "productive_count": 0,
                    "damaging_count": 1,
                    "flat_count": 2,
                    "avg_damage_adjusted_gain": -0.066667,
                    "best_damage_adjusted_gain": 0.0,
                    "best_overall_delta": 0.0,
                    "branch_score": -0.156667,
                }
            ],
            family_insights=[
                {
                    "family_key": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                    "family_type": "reset_lane",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                    "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-real-proxy-balance"],
                    "best_reference_score": 0.24,
                    "best_holdout_score": 0.24,
                    "best_overall_score": 0.24,
                    "family_score": 0.3,
                    "classification": "damaging",
                },
                {
                    "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "family_type": "reset_lane",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-reclaim-compression"],
                    "best_reference_score": 0.54,
                    "best_holdout_score": 0.14,
                    "best_overall_score": 0.42,
                    "family_score": 0.455,
                    "classification": "viable",
                },
            ],
        )
    )

    class EmptyRecordStore:
        def list(self, *_args, **_kwargs):
            return []

    variants = build_search_variants(
        "tradoor-oi-reversal-v1",
        variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            )
        ],
        artifact_store=artifact_store,
        record_store=EmptyRecordStore(),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-real-proxy-balance" not in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression" in slugs


def test_build_search_variants_stay_on_reset_lane_when_latest_artifact_has_viable_reset_family(tmp_path) -> None:
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    artifact_store.save(
        PatternSearchRunArtifact(
            research_run_id="run-last",
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-1",
            winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            variant_specs=[
                PatternVariantSpec(
                    pattern_slug="tradoor-oi-reversal-v1",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    timeframe="1h",
                )
            ],
            variant_results=[
                VariantSearchResult(
                    variant_id="winner",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    reference_score=0.54,
                    holdout_score=0.14,
                    overall_score=0.42,
                    case_results=[],
                )
            ],
            family_insights=[
                {
                    "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "family_type": "reset_lane",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-reclaim-compression"],
                    "best_reference_score": 0.54,
                    "best_holdout_score": 0.14,
                    "best_overall_score": 0.42,
                    "family_score": 0.455,
                    "classification": "viable",
                },
                {
                    "family_key": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                    "family_type": "reset_lane",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                    "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-real-proxy-balance"],
                    "best_reference_score": 0.24,
                    "best_holdout_score": 0.24,
                    "best_overall_score": 0.24,
                    "family_score": 0.3,
                    "classification": "damaging",
                },
            ],
        )
    )

    class EmptyRecordStore:
        def list(self, *_args, **_kwargs):
            return []

    variants = build_search_variants(
        "tradoor-oi-reversal-v1",
        variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            )
        ],
        artifact_store=artifact_store,
        record_store=EmptyRecordStore(),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-reclaim-compression" in slugs
    assert "tradoor-oi-reversal-v1__reset-real-proxy-balance" not in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock" not in slugs


def test_build_search_variants_can_reuse_viable_reset_family_from_history(tmp_path) -> None:
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    artifact_store.save(
        PatternSearchRunArtifact(
            research_run_id="run-reset",
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-1",
            winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            variant_results=[],
            family_insights=[
                {
                    "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "family_type": "reset_lane",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-reclaim-compression"],
                    "best_reference_score": 0.54,
                    "best_holdout_score": 0.14,
                    "best_overall_score": 0.42,
                    "family_score": 0.455,
                    "classification": "viable",
                },
                {
                    "family_key": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                    "family_type": "reset_lane",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__reset-real-proxy-balance",
                    "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-real-proxy-balance"],
                    "best_reference_score": 0.24,
                    "best_holdout_score": 0.24,
                    "best_overall_score": 0.24,
                    "family_score": 0.3,
                    "classification": "damaging",
                },
            ],
            created_at=_dt("2026-04-16T19:45:57+00:00"),
        )
    )
    artifact_store.save(
        PatternSearchRunArtifact(
            research_run_id="run-latest",
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-1",
            winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            variant_specs=[
                PatternVariantSpec(
                    pattern_slug="tradoor-oi-reversal-v1",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    timeframe="1h",
                )
            ],
            variant_results=[
                VariantSearchResult(
                    variant_id="winner",
                    variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                    reference_score=0.54,
                    holdout_score=0.14,
                    overall_score=0.42,
                    case_results=[],
                )
            ],
            family_insights=[
                {
                    "family_key": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                    "family_type": "manual",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__arch-soft-real-loose",
                    "member_variant_slugs": ["tradoor-oi-reversal-v1__arch-soft-real-loose"],
                    "best_reference_score": 0.54,
                    "best_holdout_score": 0.14,
                    "best_overall_score": 0.42,
                    "family_score": 0.455,
                    "classification": "viable",
                }
            ],
            created_at=_dt("2026-04-16T19:54:16+00:00"),
        )
    )

    class EmptyRecordStore:
        def list(self, *_args, **_kwargs):
            return []

    variants = build_search_variants(
        "tradoor-oi-reversal-v1",
        variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            )
        ],
        artifact_store=artifact_store,
        record_store=EmptyRecordStore(),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-reclaim-compression" in slugs
    assert "tradoor-oi-reversal-v1__reset-real-proxy-balance" not in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock" not in slugs


def test_build_search_variants_expand_active_reset_family_descendants(tmp_path) -> None:
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    artifact_store.save(
        PatternSearchRunArtifact(
            research_run_id="run-reset-active",
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-1",
            winner_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            variant_results=[],
            family_insights=[
                {
                    "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "family_type": "reset_lane",
                    "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression",
                    "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-reclaim-compression"],
                    "best_reference_score": 0.54,
                    "best_holdout_score": 0.14,
                    "best_overall_score": 0.42,
                    "family_score": 0.455,
                    "classification": "viable",
                }
            ],
            active_family_key="tradoor-oi-reversal-v1__reset-reclaim-compression",
            active_family_type="reset_lane",
            active_family_variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression",
            created_at=_dt("2026-04-17T00:10:00+00:00"),
        )
    )

    class AttemptRecordStore:
        def list(self, *_args, **_kwargs):
            return [
                PatternLedgerRecord(
                    pattern_slug="tradoor-oi-reversal-v1",
                    record_type="phase_attempt",
                    symbol="TRADOORUSDT",
                    created_at=_dt("2026-04-17T00:15:00+00:00"),
                    payload={
                        "failed_reason": "missing_any_group",
                        "missing_blocks": ["positive_funding_bias", "higher_lows_sequence"],
                    },
                )
            ]

    variants = build_search_variants(
        "tradoor-oi-reversal-v1",
        variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            )
        ],
        artifact_store=artifact_store,
        record_store=AttemptRecordStore(),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-reclaim-compression" in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window" in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-bias" in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-accum-bridge" in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__mut-real-unlock" not in slugs


def test_generate_active_family_variants_do_not_nest_reset_family_suffixes() -> None:
    latest_artifact = {
        "active_family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window",
        "active_family_type": "reset_lane",
        "family_insights": [
            {
                "family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window",
                "family_type": "reset_lane",
                "representative_variant_slug": "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window",
                "member_variant_slugs": ["tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window"],
                "best_reference_score": 0.54,
                "best_holdout_score": 0.14,
                "best_overall_score": 0.42,
                "family_score": 0.461,
                "classification": "viable",
            }
        ],
        "variant_specs": [
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression",
                timeframe="1h",
                search_origin="reset_lane",
            ).to_dict(),
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window",
                timeframe="1h",
                search_origin="reset_lane",
                selection_bias=0.01,
            ).to_dict(),
        ],
    }

    variants = generate_active_family_variants(
        "tradoor-oi-reversal-v1",
        latest_artifact=latest_artifact,
        available_variants=[],
        phase_attempt_summary=PhaseAttemptSummary({}, {}, 0),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-bias" in slugs
    assert "tradoor-oi-reversal-v1__reset-reclaim-compression__fam-reclaim-window__fam-reclaim-bias" not in slugs


def test_build_search_variants_expand_results_across_candidate_timeframes(tmp_path) -> None:
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")

    class EmptyRecordStore:
        def list(self, *_args, **_kwargs):
            return []

    variants = build_search_variants(
        "tradoor-oi-reversal-v1",
        variants=[
            PatternVariantSpec(
                pattern_slug="tradoor-oi-reversal-v1",
                variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
                timeframe="1h",
            )
        ],
        candidate_timeframes=["1h", "4h"],
        artifact_store=artifact_store,
        record_store=EmptyRecordStore(),
    )
    slugs = {variant.variant_slug for variant in variants}

    assert "tradoor-oi-reversal-v1__arch-soft-real-loose" in slugs
    assert "tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h" in slugs


def test_evaluate_variant_against_pack_uses_variant_timeframe(monkeypatch) -> None:
    seen: list[str] = []

    def _fake_slice(case, *, timeframe, warmup_bars):
        import pandas as pd

        seen.append(timeframe)
        index = pd.date_range(case.start_at, periods=8, freq="4h", tz="UTC")
        klines = pd.DataFrame(
            {
                "open": [1.0] * 8,
                "high": [1.1] * 8,
                "low": [0.9] * 8,
                "close": [1.0] * 8,
                "volume": [10.0] * 8,
            },
            index=index,
        )
        return klines, klines

    class FakeReplay:
        phase_history = [("FAKE_DUMP", _dt("2026-04-13T00:00:00+00:00"))]
        current_phase = "FAKE_DUMP"

    monkeypatch.setattr("research.pattern_search._slice_case_frames", _fake_slice)
    monkeypatch.setattr("research.pattern_search.replay_pattern_frames", lambda *args, **kwargs: FakeReplay())

    pack = ReplayBenchmarkPack(
        benchmark_pack_id="pack-tf",
        pattern_slug="tradoor-oi-reversal-v1",
        candidate_timeframes=["1h", "4h"],
        cases=[
            BenchmarkCase(
                symbol="PTBUSDT",
                timeframe="1h",
                start_at=_dt("2026-04-13T00:00:00+00:00"),
                end_at=_dt("2026-04-15T12:00:00+00:00"),
                expected_phase_path=["FAKE_DUMP", "ARCH_ZONE"],
            )
        ],
    )
    variant = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical__tf-4h",
        timeframe="4h",
    )

    evaluate_variant_against_pack(pack, variant)

    assert seen == ["4h"]


def test_run_pattern_benchmark_search_records_run_and_artifact(tmp_path, monkeypatch) -> None:
    pack_store = BenchmarkPackStore(tmp_path / "packs")
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    negative_memory_store = NegativeSearchMemoryStore(tmp_path / "negative")
    controller = ResearchWorkerController(ResearchStateStore(tmp_path / "research.sqlite"))
    pack = ReplayBenchmarkPack(
        benchmark_pack_id="pack-2",
        pattern_slug="tradoor-oi-reversal-v1",
        candidate_timeframes=["1h"],
        cases=[
            BenchmarkCase(
                symbol="PTBUSDT",
                timeframe="1h",
                start_at=_dt("2026-04-13T00:00:00+00:00"),
                end_at=_dt("2026-04-15T12:00:00+00:00"),
                expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"],
                role="reference",
            ),
            BenchmarkCase(
                symbol="TRADOORUSDT",
                timeframe="1h",
                start_at=_dt("2026-04-11T00:00:00+00:00"),
                end_at=_dt("2026-04-14T18:00:00+00:00"),
                expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"],
                role="holdout",
            ),
        ],
    )
    pack_store.save(pack)

    def _fake_eval(_pack, variant, *, warmup_bars=240):
        score = 0.82 if variant.variant_slug.endswith("__winner") else 0.41
        holdout = 0.55 if variant.variant_slug.endswith("__winner") else 0.22
        return VariantSearchResult(
            variant_id=variant.variant_id,
            variant_slug=variant.variant_slug,
            reference_score=score,
            holdout_score=holdout,
            overall_score=score * 0.7 + holdout * 0.3,
            case_results=[
                VariantCaseResult(
                    case_id="case-1",
                    symbol="PTBUSDT",
                    role="reference",
                    observed_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"],
                    current_phase="ACCUMULATION",
                    phase_fidelity=1.0,
                    phase_depth_progress=1.0,
                    entry_hit=True,
                    target_hit=False,
                    lead_bars=None,
                    score=score,
                )
            ],
        )

    monkeypatch.setattr("research.pattern_search.evaluate_variant_against_pack", _fake_eval)

    variants = [
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__baseline",
            timeframe="1h",
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__winner",
            timeframe="1h",
        ),
    ]

    run = run_pattern_benchmark_search(
        PatternBenchmarkSearchConfig(
            pattern_slug="tradoor-oi-reversal-v1",
            definition_id="tradoor-oi-reversal-v1:v1",
            benchmark_pack_id="pack-2",
            variants=variants,
            search_query_spec={
                "schema_version": 1,
                "pattern_family": "tradoor_ptb_oi_reversal",
                "reference_timeframe": "1h",
                "phase_path": ["REAL_DUMP", "ACCUMULATION"],
            },
            min_reference_score=0.6,
            min_holdout_score=0.3,
        ),
        controller=controller,
        pack_store=pack_store,
        artifact_store=artifact_store,
        negative_memory_store=negative_memory_store,
    )

    assert run.status == "completed"
    assert run.completion_disposition == "no_op"
    assert run.winner_variant_ref == "tradoor-oi-reversal-v1__winner"
    assert run.definition_ref["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert run.search_policy["family_selection_policy"]["policy_id"] == "family-selection-v1"
    assert run.handoff_payload["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert run.handoff_payload["active_family_key"] == "tradoor-oi-reversal-v1__winner"
    assert run.handoff_payload["active_family_type"] == "manual"
    assert run.handoff_payload["baseline_family_ref"] == "family:tradoor-oi-reversal-v1__winner"
    assert run.handoff_payload["family_policy_id"] == "family-selection-v1"
    artifact = artifact_store.load(run.research_run_id)
    assert artifact is not None
    assert artifact["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert artifact["winner_variant_slug"] == "tradoor-oi-reversal-v1__winner"
    assert artifact["search_query_spec"] == {
        "schema_version": 1,
        "pattern_family": "tradoor_ptb_oi_reversal",
        "reference_timeframe": "1h",
        "phase_path": ["REAL_DUMP", "ACCUMULATION"],
    }
    assert artifact["family_policy"]["policy_id"] == "family-selection-v1"
    assert artifact["active_family_key"] == "tradoor-oi-reversal-v1__winner"
    assert artifact["active_family_type"] == "manual"
    decision = controller.store.get_selection_decision(run.research_run_id)
    assert decision is not None
    assert decision.decision_kind == "advance"
    assert decision.metrics["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert decision.metrics["active_family_key"] == "tradoor-oi-reversal-v1__winner"
    assert decision.metrics["baseline_family_ref"] == "family:tradoor-oi-reversal-v1__winner"
    assert decision.metrics["family_policy_id"] == "family-selection-v1"
    assert negative_memory_store.list("tradoor-oi-reversal-v1") == []


def test_run_pattern_benchmark_search_syncs_gate_cleared_winner_to_active_registry(
    tmp_path, monkeypatch
) -> None:
    pack_store = BenchmarkPackStore(tmp_path / "packs")
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    negative_memory_store = NegativeSearchMemoryStore(tmp_path / "negative")
    active_variant_store = ActivePatternVariantStore(tmp_path / "active-variants")
    controller = ResearchWorkerController(ResearchStateStore(tmp_path / "research.sqlite"))
    pack = ReplayBenchmarkPack(
        benchmark_pack_id="pack-active",
        pattern_slug="tradoor-oi-reversal-v1",
        candidate_timeframes=["1h"],
        cases=[
            BenchmarkCase(
                symbol="PTBUSDT",
                timeframe="1h",
                start_at=_dt("2026-04-13T00:00:00+00:00"),
                end_at=_dt("2026-04-15T12:00:00+00:00"),
                expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
                role="reference",
            ),
            BenchmarkCase(
                symbol="TRADOORUSDT",
                timeframe="1h",
                start_at=_dt("2026-04-11T00:00:00+00:00"),
                end_at=_dt("2026-04-14T18:00:00+00:00"),
                expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
                role="holdout",
            ),
        ],
    )
    pack_store.save(pack)

    def _winner_case(case_id: str, role: str, symbol: str, score: float) -> VariantCaseResult:
        return VariantCaseResult(
            case_id=case_id,
            symbol=symbol,
            role=role,
            observed_phase_path=["ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
            current_phase="BREAKOUT",
            phase_fidelity=1.0,
            phase_depth_progress=1.0,
            entry_hit=True,
            target_hit=True,
            lead_bars=2,
            score=score,
            entry_close=1.0,
            forward_peak_return_pct=18.0,
            entry_next_open=1.001,
            realistic_forward_peak_return_pct=17.5,
        )

    def _fake_eval(_pack, variant, *, warmup_bars=240):
        if variant.variant_slug.endswith("__winner"):
            return VariantSearchResult(
                variant_id=variant.variant_id,
                variant_slug=variant.variant_slug,
                reference_score=0.95,
                holdout_score=0.91,
                overall_score=0.938,
                case_results=[
                    _winner_case("case-ref", "reference", "PTBUSDT", 0.95),
                    _winner_case("case-holdout", "holdout", "TRADOORUSDT", 0.91),
                ],
            )
        return VariantSearchResult(
            variant_id=variant.variant_id,
            variant_slug=variant.variant_slug,
            reference_score=0.42,
            holdout_score=0.22,
            overall_score=0.36,
            case_results=[
                VariantCaseResult(
                    case_id="case-ref",
                    symbol="PTBUSDT",
                    role="reference",
                    observed_phase_path=["ARCH_ZONE"],
                    current_phase="ARCH_ZONE",
                    phase_fidelity=0.2,
                    phase_depth_progress=0.2,
                    entry_hit=False,
                    target_hit=False,
                    lead_bars=None,
                    score=0.36,
                )
            ],
        )

    monkeypatch.setattr("research.pattern_search.evaluate_variant_against_pack", _fake_eval)

    run = run_pattern_benchmark_search(
        PatternBenchmarkSearchConfig(
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-active",
            min_reference_score=0.6,
            min_holdout_score=0.3,
            variants=[
                PatternVariantSpec(
                    pattern_slug="tradoor-oi-reversal-v1",
                    variant_slug="tradoor-oi-reversal-v1__baseline",
                    timeframe="1h",
                ),
                PatternVariantSpec(
                    pattern_slug="tradoor-oi-reversal-v1",
                    variant_slug="tradoor-oi-reversal-v1__winner",
                    timeframe="1h",
                ),
            ],
        ),
        controller=controller,
        pack_store=pack_store,
        artifact_store=artifact_store,
        negative_memory_store=negative_memory_store,
        active_variant_store=active_variant_store,
    )

    active = active_variant_store.get("tradoor-oi-reversal-v1")

    assert run.winner_variant_ref == "tradoor-oi-reversal-v1__winner"
    assert run.handoff_payload["active_registry_variant_slug"] == "tradoor-oi-reversal-v1__winner"
    assert active is not None
    assert active.variant_slug == "tradoor-oi-reversal-v1__winner"
    assert active.timeframe == "1h"
    assert active.watch_phases == ["ACCUMULATION", "REAL_DUMP"]
    assert active.source_kind == "benchmark_search"


def test_run_pattern_benchmark_search_promotes_reset_family_when_tied_with_manual(tmp_path, monkeypatch) -> None:
    pack_store = BenchmarkPackStore(tmp_path / "packs")
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    negative_memory_store = NegativeSearchMemoryStore(tmp_path / "negative")
    controller = ResearchWorkerController(ResearchStateStore(tmp_path / "research.sqlite"))
    pack = ReplayBenchmarkPack(
        benchmark_pack_id="pack-4",
        pattern_slug="tradoor-oi-reversal-v1",
        candidate_timeframes=["1h"],
        cases=[
            BenchmarkCase(
                symbol="PTBUSDT",
                timeframe="1h",
                start_at=_dt("2026-04-13T00:00:00+00:00"),
                end_at=_dt("2026-04-15T12:00:00+00:00"),
                expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"],
                role="reference",
            )
        ],
    )
    pack_store.save(pack)

    def _fake_eval(_pack, variant, *, warmup_bars=240):
        return VariantSearchResult(
            variant_id=variant.variant_id,
            variant_slug=variant.variant_slug,
            reference_score=0.54,
            holdout_score=0.14,
            overall_score=0.42,
            case_results=[
                VariantCaseResult(
                    case_id="case-1",
                    symbol="PTBUSDT",
                    role="reference",
                    observed_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP"],
                    current_phase="REAL_DUMP",
                    phase_fidelity=0.75,
                    phase_depth_progress=0.75,
                    entry_hit=False,
                    target_hit=False,
                    lead_bars=None,
                    score=0.42,
                )
            ],
        )

    monkeypatch.setattr("research.pattern_search.evaluate_variant_against_pack", _fake_eval)

    variants = [
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            timeframe="1h",
            search_origin="manual",
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__reset-reclaim-compression",
            timeframe="1h",
            search_origin="reset_lane",
        ),
    ]

    run = run_pattern_benchmark_search(
        PatternBenchmarkSearchConfig(
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-4",
            variants=variants,
            min_reference_score=0.7,
            min_holdout_score=0.3,
        ),
        controller=controller,
        pack_store=pack_store,
        artifact_store=artifact_store,
        negative_memory_store=negative_memory_store,
    )

    artifact = artifact_store.load(run.research_run_id)
    assert artifact is not None
    assert artifact["winner_variant_slug"] == "tradoor-oi-reversal-v1__arch-soft-real-loose"
    assert artifact["active_family_key"] == "tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert artifact["active_family_type"] == "reset_lane"
    assert run.handoff_payload["active_family_key"] == "tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert run.handoff_payload["baseline_family_ref"] == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"


def test_dead_end_search_persists_negative_memory(tmp_path, monkeypatch) -> None:
    pack_store = BenchmarkPackStore(tmp_path / "packs")
    artifact_store = PatternSearchArtifactStore(tmp_path / "artifacts")
    negative_memory_store = NegativeSearchMemoryStore(tmp_path / "negative")
    controller = ResearchWorkerController(ResearchStateStore(tmp_path / "research.sqlite"))
    pack = ReplayBenchmarkPack(
        benchmark_pack_id="pack-3",
        pattern_slug="tradoor-oi-reversal-v1",
        candidate_timeframes=["1h"],
        cases=[
            BenchmarkCase(
                symbol="PTBUSDT",
                timeframe="1h",
                start_at=_dt("2026-04-13T00:00:00+00:00"),
                end_at=_dt("2026-04-15T12:00:00+00:00"),
                expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"],
                role="reference",
            )
        ],
    )
    pack_store.save(pack)

    def _fake_eval(_pack, variant, *, warmup_bars=240):
        return VariantSearchResult(
            variant_id=variant.variant_id,
            variant_slug=variant.variant_slug,
            reference_score=0.2,
            holdout_score=None,
            overall_score=0.2,
            case_results=[
                VariantCaseResult(
                    case_id="case-1",
                    symbol="PTBUSDT",
                    role="reference",
                    observed_phase_path=["FAKE_DUMP"],
                    current_phase="FAKE_DUMP",
                    phase_fidelity=0.1,
                    phase_depth_progress=0.25,
                    entry_hit=False,
                    target_hit=False,
                    lead_bars=None,
                    score=0.2,
                )
            ],
        )

    monkeypatch.setattr("research.pattern_search.evaluate_variant_against_pack", _fake_eval)

    variants = [
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__dead-a",
            timeframe="1h",
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__dead-b",
            timeframe="1h",
        ),
    ]

    run = run_pattern_benchmark_search(
        PatternBenchmarkSearchConfig(
            pattern_slug="tradoor-oi-reversal-v1",
            benchmark_pack_id="pack-3",
            variants=variants,
            min_reference_score=0.6,
        ),
        controller=controller,
        pack_store=pack_store,
        artifact_store=artifact_store,
        negative_memory_store=negative_memory_store,
    )

    assert run.completion_disposition == "dead_end"
    memories = negative_memory_store.list("tradoor-oi-reversal-v1")
    assert len(memories) == 1
    assert memories[0]["research_run_id"] == run.research_run_id
    assert "flat-landscape" in memories[0]["tags"]
    assert memories[0]["active_family_key"] in {
        "tradoor-oi-reversal-v1__dead-a",
        "tradoor-oi-reversal-v1__dead-b",
    }
    assert memories[0]["baseline_family_ref"] == f"family:{memories[0]['active_family_key']}"
    family_keys = {score["family_key"] for score in memories[0]["family_scores"]}
    assert memories[0]["active_family_key"] in family_keys
    assert {
        "tradoor-oi-reversal-v1__dead-a",
        "tradoor-oi-reversal-v1__dead-b",
    }.issubset(family_keys)


def test_expand_variants_across_durations_adds_short_and_long_clones() -> None:
    base = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        timeframe="1h",
        search_origin="manual",
    )
    expanded = expand_variants_across_durations([base])
    by_slug = {v.variant_slug: v for v in expanded}

    assert "tradoor-oi-reversal-v1__canonical" in by_slug
    short = by_slug["tradoor-oi-reversal-v1__canonical__dur-short"]
    long_ = by_slug["tradoor-oi-reversal-v1__canonical__dur-long"]
    assert short.search_origin == "duration_family"
    assert long_.search_origin == "duration_family"
    assert short.duration_scale == 0.5
    assert long_.duration_scale == 2.0
    assert short.timeframe == "1h"
    assert long_.timeframe == "1h"


def test_expand_variants_across_durations_skips_timeframe_family_variants() -> None:
    base = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical__tf-4h",
        timeframe="4h",
        search_origin="timeframe_family",
    )
    expanded = expand_variants_across_durations([base])
    slugs = {v.variant_slug for v in expanded}

    assert slugs == {"tradoor-oi-reversal-v1__canonical__tf-4h"}


def test_expand_variants_across_timeframes_skips_duration_family_variants() -> None:
    base = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical__dur-short",
        timeframe="1h",
        search_origin="duration_family",
        duration_scale=0.5,
    )
    expanded = expand_variants_across_timeframes([base], ["1h", "4h"])
    slugs = {v.variant_slug for v in expanded}

    # duration_family variants must not fan out into __tf-4h clones
    assert slugs == {"tradoor-oi-reversal-v1__canonical__dur-short"}


def test_build_variant_pattern_scales_phase_bar_windows_by_duration_scale() -> None:
    base_spec = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        timeframe="1h",
    )
    long_spec = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical__dur-long",
        timeframe="1h",
        search_origin="duration_family",
        duration_scale=2.0,
    )

    base_pattern = build_variant_pattern("tradoor-oi-reversal-v1", base_spec)
    long_pattern = build_variant_pattern("tradoor-oi-reversal-v1", long_spec)

    base_by_phase = {phase.phase_id: phase for phase in base_pattern.phases}
    long_by_phase = {phase.phase_id: phase for phase in long_pattern.phases}

    # at least one phase should have a scaled max_bars to prove the scaling wired
    scaled_any = False
    for phase_id, base_phase in base_by_phase.items():
        long_phase = long_by_phase[phase_id]
        if base_phase.max_bars and base_phase.max_bars != long_phase.max_bars:
            assert long_phase.max_bars >= base_phase.max_bars
            scaled_any = True
    assert scaled_any


def test_build_search_family_insights_groups_duration_clones_under_single_family() -> None:
    base = "tradoor-oi-reversal-v1__canonical"
    short = f"{base}__dur-short"
    long_ = f"{base}__dur-long"

    variant_results = [
        _mk_result(base, 0.42),
        _mk_result(short, 0.35),
        _mk_result(long_, 0.48),
    ]
    variant_specs = [
        _mk_spec(base, "1h", "manual"),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug=short,
            timeframe="1h",
            search_origin="duration_family",
            duration_scale=0.5,
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug=long_,
            timeframe="1h",
            search_origin="duration_family",
            duration_scale=2.0,
        ),
    ]

    insights = build_search_family_insights(variant_results, variant_specs, [])
    by_type = {insight.family_type: insight for insight in insights}

    assert "manual" in by_type
    assert by_type["manual"].family_key == base

    dur_family = by_type["duration_family"]
    assert dur_family.family_key == f"{base}__dur-family"
    assert set(dur_family.member_variant_slugs) == {short, long_}
    # representative should be the best-scoring clone (long_ with 0.48)
    assert dur_family.representative_variant_slug == long_


def test_select_active_family_insight_ignores_duration_family() -> None:
    family_insights = [
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__canonical__dur-family",
            family_type="duration_family",
            representative_variant_slug="tradoor-oi-reversal-v1__canonical__dur-long",
            member_variant_slugs=["tradoor-oi-reversal-v1__canonical__dur-long"],
            best_reference_score=0.9,
            best_holdout_score=0.9,
            best_overall_score=0.9,
            family_score=1.5,
            classification="viable",
        ),
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__canonical",
            family_type="manual",
            representative_variant_slug="tradoor-oi-reversal-v1__canonical",
            member_variant_slugs=["tradoor-oi-reversal-v1__canonical"],
            best_reference_score=0.42,
            best_holdout_score=0.14,
            best_overall_score=0.42,
            family_score=0.455,
            classification="viable",
        ),
    ]

    active = select_active_family_insight(family_insights)

    assert active is not None
    assert active.family_type == "manual"


def test_build_duration_recommendations_marks_upgrade_when_clone_beats_parent() -> None:
    base = "tradoor-oi-reversal-v1__canonical"
    clone = f"{base}__dur-long"
    insight = SearchFamilyInsight(
        family_key=f"{base}__dur-family",
        family_type="duration_family",
        representative_variant_slug=clone,
        member_variant_slugs=[clone],
        best_reference_score=0.55,
        best_holdout_score=0.55,
        best_overall_score=0.55,
        family_score=0.55,
        classification="viable",
    )
    variant_results = [_mk_result(base, 0.42), _mk_result(clone, 0.55)]
    variant_specs = [
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug=base,
            timeframe="1h",
            search_origin="manual",
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug=clone,
            timeframe="1h",
            search_origin="duration_family",
            duration_scale=2.0,
        ),
    ]

    recommendations = build_duration_recommendations([insight], variant_results, variant_specs)

    assert len(recommendations) == 1
    rec = recommendations[0]
    assert rec.classification == "upgrade"
    assert rec.recommended_duration_scale == 2.0
    assert rec.duration_label == "long"
    assert rec.score_delta > 0.1


def test_build_duration_recommendations_marks_avoid_when_clone_loses_to_parent() -> None:
    base = "tradoor-oi-reversal-v1__canonical"
    clone = f"{base}__dur-short"
    insight = SearchFamilyInsight(
        family_key=f"{base}__dur-family",
        family_type="duration_family",
        representative_variant_slug=clone,
        member_variant_slugs=[clone],
        best_reference_score=0.18,
        best_holdout_score=0.18,
        best_overall_score=0.18,
        family_score=0.18,
        classification="damaging",
    )
    variant_results = [_mk_result(base, 0.42), _mk_result(clone, 0.18)]
    variant_specs = [
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug=base,
            timeframe="1h",
            search_origin="manual",
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug=clone,
            timeframe="1h",
            search_origin="duration_family",
            duration_scale=0.5,
        ),
    ]

    recommendations = build_duration_recommendations([insight], variant_results, variant_specs)

    assert len(recommendations) == 1
    rec = recommendations[0]
    assert rec.classification == "avoid"
    assert rec.recommended_duration_scale == 1.0
    assert rec.duration_label == "short"


def _mk_case_result(
    *,
    role: str = "reference",
    entry_hit: bool = True,
    target_hit: bool = True,
    lead_bars: int | None = 5,
    phase_fidelity: float = 1.0,
    score: float = 0.8,
    case_id: str = "case",
    symbol: str = "PTBUSDT",
) -> VariantCaseResult:
    return VariantCaseResult(
        case_id=case_id,
        symbol=symbol,
        role=role,
        observed_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
        current_phase="BREAKOUT",
        phase_fidelity=phase_fidelity,
        phase_depth_progress=1.0,
        entry_hit=entry_hit,
        target_hit=target_hit,
        lead_bars=lead_bars,
        score=score,
    )


def test_build_promotion_report_promotes_when_all_gates_clear() -> None:
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
        reference_score=0.8,
        holdout_score=0.75,
        overall_score=0.77,
        case_results=[
            _mk_case_result(role="reference", case_id="ref-1", symbol="PTBUSDT"),
            _mk_case_result(role="reference", case_id="ref-2", symbol="PTBUSDT"),
            _mk_case_result(role="holdout", case_id="hold-1", symbol="TRADOORUSDT"),
        ],
    )

    report = build_promotion_report("tradoor-oi-reversal-v1", winner)

    assert report.decision == "promote_candidate"
    assert report.holdout_passed is True
    assert report.reference_recall == 1.0
    assert report.phase_fidelity == 1.0
    assert report.false_discovery_rate == 0.0
    assert report.rejection_reasons == []
    assert all(report.gate_results.values())


def test_build_promotion_report_rejects_when_reference_recall_below_floor() -> None:
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        reference_score=0.1,
        holdout_score=0.1,
        overall_score=0.1,
        case_results=[
            _mk_case_result(role="reference", entry_hit=False, target_hit=False, lead_bars=None, phase_fidelity=0.2, score=0.1, case_id="ref-1"),
            _mk_case_result(role="reference", entry_hit=False, target_hit=False, lead_bars=None, phase_fidelity=0.2, score=0.1, case_id="ref-2"),
            _mk_case_result(role="holdout", entry_hit=True, target_hit=True, lead_bars=5, score=0.8, case_id="hold-1", symbol="TRADOORUSDT"),
        ],
    )

    report = build_promotion_report("tradoor-oi-reversal-v1", winner)

    assert report.decision == "reject"
    assert report.reference_recall == 0.0
    assert report.gate_results["reference_recall"] is False
    assert any("reference_recall" in reason for reason in report.rejection_reasons)


def test_build_promotion_report_rejects_when_holdout_fails() -> None:
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        reference_score=0.8,
        holdout_score=0.1,
        overall_score=0.5,
        case_results=[
            _mk_case_result(role="reference", case_id="ref-1"),
            _mk_case_result(role="reference", case_id="ref-2"),
            _mk_case_result(role="holdout", entry_hit=False, target_hit=False, lead_bars=None, phase_fidelity=0.2, score=0.1, case_id="hold-1", symbol="TRADOORUSDT"),
        ],
    )

    report = build_promotion_report("tradoor-oi-reversal-v1", winner)

    assert report.decision == "reject"
    assert report.holdout_passed is False
    assert report.gate_results["holdout_passed"] is False
    assert "holdout_passed=False" in report.rejection_reasons


def test_build_promotion_report_rejects_when_false_discovery_rate_exceeds_ceiling() -> None:
    # three entries, only one hits the target => FDR = 2/3 > default 0.4 ceiling
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        reference_score=0.5,
        holdout_score=0.5,
        overall_score=0.5,
        case_results=[
            _mk_case_result(role="reference", entry_hit=True, target_hit=True, lead_bars=5, case_id="ref-1"),
            _mk_case_result(role="reference", entry_hit=True, target_hit=False, lead_bars=None, case_id="ref-2"),
            _mk_case_result(role="reference", entry_hit=True, target_hit=False, lead_bars=None, case_id="ref-3"),
            _mk_case_result(role="holdout", entry_hit=True, target_hit=True, lead_bars=5, case_id="hold-1", symbol="TRADOORUSDT"),
        ],
    )

    report = build_promotion_report("tradoor-oi-reversal-v1", winner)

    assert report.false_discovery_rate > 0.4
    assert report.gate_results["false_discovery_rate"] is False
    assert report.decision == "reject"


def test_build_promotion_report_allows_override_policy() -> None:
    strict_policy = PromotionGatePolicy(
        policy_id="strict-v1",
        min_reference_recall=0.9,
        min_phase_fidelity=0.9,
        min_lead_time_bars=3.0,
        max_false_discovery_rate=0.1,
        max_robustness_spread=0.1,
        require_holdout_passed=True,
    )
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        reference_score=0.6,
        holdout_score=0.6,
        overall_score=0.6,
        case_results=[
            _mk_case_result(role="reference", phase_fidelity=0.7, score=0.6, case_id="ref-1"),
            _mk_case_result(role="reference", phase_fidelity=0.7, score=0.6, case_id="ref-2"),
        ],
    )

    report = build_promotion_report("tradoor-oi-reversal-v1", winner, policy=strict_policy)

    # 0.7 phase_fidelity < 0.9 floor under strict policy
    assert report.gate_policy.policy_id == "strict-v1"
    assert report.gate_results["phase_fidelity"] is False
    assert report.decision == "reject"


def test_default_promotion_gate_policy_has_stable_id() -> None:
    assert DEFAULT_PROMOTION_GATE_POLICY.policy_id == "promotion-gate-v1"


# ──────────────────────────────────────────────────────────────────────────
# W-0088: trading-edge parallel promotion path
# ──────────────────────────────────────────────────────────────────────────


def _mk_case_result_with_return(
    *,
    role: str = "reference",
    entry_hit: bool = True,
    target_hit: bool = True,
    forward_peak_return_pct: float | None = None,
    case_id: str = "case",
    symbol: str = "PTBUSDT",
    phase_fidelity: float = 1.0,
) -> VariantCaseResult:
    return VariantCaseResult(
        case_id=case_id,
        symbol=symbol,
        role=role,
        observed_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"]
        if target_hit
        else ["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"],
        current_phase="BREAKOUT" if target_hit else "ACCUMULATION",
        phase_fidelity=phase_fidelity,
        phase_depth_progress=1.0 if target_hit else 0.8,
        entry_hit=entry_hit,
        target_hit=target_hit,
        lead_bars=5 if (entry_hit and target_hit) else None,
        score=0.8 if (entry_hit and target_hit) else 0.55,
        entry_close=100.0 if forward_peak_return_pct is not None else None,
        forward_peak_return_pct=forward_peak_return_pct,
    )


def test_build_promotion_report_v_reversal_promotes_via_strict_path() -> None:
    """TRADOOR-class: full path completes, FDR=0, forward return strong."""
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        reference_score=0.8,
        holdout_score=0.75,
        overall_score=0.77,
        case_results=[
            _mk_case_result_with_return(
                role="reference", forward_peak_return_pct=60.0, case_id="ref-1"
            ),
            _mk_case_result_with_return(
                role="reference", forward_peak_return_pct=55.0, case_id="ref-2"
            ),
            _mk_case_result_with_return(
                role="holdout",
                forward_peak_return_pct=111.0,
                case_id="hold-1",
                symbol="TRADOORUSDT",
            ),
        ],
    )

    report = build_promotion_report("tradoor-oi-reversal-v1", winner)

    assert report.decision == "promote_candidate"
    assert report.decision_path == "strict"
    assert report.entry_profitable_rate == 1.0
    assert report.entry_profitable_gate is True


def test_build_promotion_report_slow_recovery_promotes_via_trading_edge_path() -> None:
    """KOMA / DYM-class: pattern stops at ACCUMULATION (FDR=1.0) but
    forward return clears 5% threshold for a majority of cases — should
    promote via the trading-edge path with FDR waived."""
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        reference_score=0.55,
        holdout_score=0.55,
        overall_score=0.55,
        case_results=[
            _mk_case_result_with_return(
                role="reference",
                target_hit=False,
                forward_peak_return_pct=20.9,
                case_id="ref-koma",
                symbol="KOMAUSDT",
            ),
            _mk_case_result_with_return(
                role="reference",
                target_hit=False,
                forward_peak_return_pct=7.1,
                case_id="ref-dym",
                symbol="DYMUSDT",
            ),
            _mk_case_result_with_return(
                role="holdout",
                target_hit=False,
                forward_peak_return_pct=22.1,
                case_id="hold-fart",
                symbol="FARTCOINUSDT",
            ),
        ],
    )

    report = build_promotion_report("tradoor-oi-reversal-v1", winner)

    # FDR is 1.0 (no target hits) — strict path fails by construction
    assert report.false_discovery_rate == 1.0
    assert report.gate_results["false_discovery_rate"] is False
    # But forward returns >= 5% for all 3 entered cases — trading-edge path passes
    assert report.entry_profitable_rate == 1.0
    assert report.entry_profitable_gate is True
    assert report.decision == "promote_candidate"
    assert report.decision_path == "trading_edge"


def test_build_promotion_report_pump_and_dump_rejects_when_forward_return_below_threshold() -> None:
    """Pattern completes (entry + target hit) but forward return is
    below the 5% trading-edge floor — strict path passes only if FDR
    is acceptable. Here we contrive the case where strict fails on
    FDR and forward returns are too small for trading-edge → reject."""
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        reference_score=0.4,
        holdout_score=0.4,
        overall_score=0.4,
        case_results=[
            _mk_case_result_with_return(
                role="reference",
                target_hit=True,
                forward_peak_return_pct=2.0,
                case_id="ref-1",
            ),
            _mk_case_result_with_return(
                role="reference",
                target_hit=False,
                forward_peak_return_pct=1.5,
                case_id="ref-2",
            ),
            _mk_case_result_with_return(
                role="reference",
                target_hit=False,
                forward_peak_return_pct=3.0,
                case_id="ref-3",
            ),
            _mk_case_result_with_return(
                role="holdout",
                target_hit=True,
                forward_peak_return_pct=1.0,
                case_id="hold-1",
                symbol="TRADOORUSDT",
            ),
        ],
    )

    report = build_promotion_report("tradoor-oi-reversal-v1", winner)

    # FDR = 2/4 = 0.5 > 0.4 ceiling → strict path fails
    assert report.gate_results["false_discovery_rate"] is False
    # No forward return clears 5% → entry_profitable_rate = 0.0 → trading-edge fails
    assert report.entry_profitable_rate == 0.0
    assert report.entry_profitable_gate is False
    assert report.decision == "reject"
    assert report.decision_path == "rejected"
    assert any("entry_profitable_rate" in reason for reason in report.rejection_reasons)


def test_build_promotion_report_no_entry_rejects_with_unmeasured_metric() -> None:
    """No case ever hit entry phase — entry_profitable_rate is undefined
    (None), trading-edge path is unavailable, and strict path fails on
    reference_recall. Rejection reason should flag the unmeasured
    metric rather than reporting a numeric floor breach."""
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        reference_score=0.1,
        holdout_score=0.1,
        overall_score=0.1,
        case_results=[
            _mk_case_result_with_return(
                role="reference",
                entry_hit=False,
                target_hit=False,
                phase_fidelity=0.2,
                case_id="ref-1",
            ),
            _mk_case_result_with_return(
                role="reference",
                entry_hit=False,
                target_hit=False,
                phase_fidelity=0.2,
                case_id="ref-2",
            ),
            _mk_case_result_with_return(
                role="holdout",
                entry_hit=False,
                target_hit=False,
                phase_fidelity=0.2,
                case_id="hold-1",
                symbol="TRADOORUSDT",
            ),
        ],
    )

    report = build_promotion_report("tradoor-oi-reversal-v1", winner)

    assert report.decision == "reject"
    assert report.decision_path == "rejected"
    assert report.entry_profitable_rate is None
    assert report.entry_profitable_gate is False  # enabled but unmeasured
    assert any("unmeasured" in reason for reason in report.rejection_reasons)


def test_build_promotion_report_trading_edge_path_disabled_falls_back_to_strict() -> None:
    """When the policy disables the parallel path
    (min_entry_profitable_rate=None), the gate behaves exactly like
    the original strict-only gate: a KOMA/DYM-class result that would
    promote via trading_edge is rejected."""
    strict_only = PromotionGatePolicy(
        policy_id="strict-only-v1",
        min_entry_profitable_rate=None,
    )
    winner = VariantSearchResult(
        variant_id="winner",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        reference_score=0.55,
        holdout_score=0.55,
        overall_score=0.55,
        case_results=[
            _mk_case_result_with_return(
                role="reference",
                target_hit=False,
                forward_peak_return_pct=20.9,
                case_id="ref-koma",
                symbol="KOMAUSDT",
            ),
            _mk_case_result_with_return(
                role="holdout",
                target_hit=False,
                forward_peak_return_pct=22.1,
                case_id="hold-fart",
                symbol="FARTCOINUSDT",
            ),
        ],
    )

    report = build_promotion_report(
        "tradoor-oi-reversal-v1", winner, policy=strict_only
    )

    assert report.entry_profitable_gate is None  # parallel path disabled
    assert report.decision == "reject"
    assert report.decision_path == "rejected"


def test_depth_progress_distinguishes_deeper_holdout_paths() -> None:
    from research.pattern_search import _phase_depth_progress

    expected = ["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"]

    fake_only = _phase_depth_progress(expected, ["FAKE_DUMP"], "FAKE_DUMP")
    arch_progress = _phase_depth_progress(expected, ["ARCH_ZONE"], "ARCH_ZONE")

    assert arch_progress > fake_only


def test_expand_variants_tags_non_base_timeframe_clones_as_timeframe_family() -> None:
    base = PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
        timeframe="1h",
        search_origin="manual",
    )
    expanded = expand_variants_across_timeframes([base], ["1h", "4h"])
    by_slug = {variant.variant_slug: variant for variant in expanded}

    assert by_slug["tradoor-oi-reversal-v1__arch-soft-real-loose"].search_origin == "manual"
    assert by_slug["tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h"].search_origin == "timeframe_family"


def test_build_search_family_insights_groups_timeframe_clones_under_single_family() -> None:
    variant_results = [
        VariantSearchResult(
            variant_id="base",
            variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            reference_score=0.54,
            holdout_score=0.14,
            overall_score=0.42,
            case_results=[],
        ),
        VariantSearchResult(
            variant_id="tf-4h",
            variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h",
            reference_score=0.18,
            holdout_score=0.18,
            overall_score=0.18,
            case_results=[],
        ),
    ]
    variant_specs = [
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            timeframe="1h",
            search_origin="manual",
        ),
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h",
            timeframe="4h",
            search_origin="timeframe_family",
        ),
    ]

    insights = build_search_family_insights(variant_results, variant_specs, [])
    by_type = {insight.family_type: insight for insight in insights}

    assert "manual" in by_type
    assert by_type["manual"].family_key == "tradoor-oi-reversal-v1__arch-soft-real-loose"
    assert by_type["manual"].member_variant_slugs == [
        "tradoor-oi-reversal-v1__arch-soft-real-loose"
    ]

    tf_family = by_type["timeframe_family"]
    assert tf_family.family_key == "tradoor-oi-reversal-v1__arch-soft-real-loose__tf-family"
    assert tf_family.member_variant_slugs == [
        "tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h"
    ]
    assert tf_family.representative_variant_slug == (
        "tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h"
    )


def _make_tf_family_insight(
    base_slug: str,
    clone_slug: str,
    *,
    best_overall_score: float,
    best_reference_score: float = 0.0,
    best_holdout_score: float | None = 0.0,
) -> SearchFamilyInsight:
    return SearchFamilyInsight(
        family_key=f"{base_slug}__tf-family",
        family_type="timeframe_family",
        representative_variant_slug=clone_slug,
        member_variant_slugs=[clone_slug],
        best_reference_score=best_reference_score,
        best_holdout_score=best_holdout_score,
        best_overall_score=best_overall_score,
        family_score=best_overall_score,
        classification="viable",
    )


def _mk_result(slug: str, overall: float) -> VariantSearchResult:
    return VariantSearchResult(
        variant_id=slug,
        variant_slug=slug,
        reference_score=overall,
        holdout_score=overall,
        overall_score=overall,
        case_results=[],
    )


def _mk_spec(slug: str, timeframe: str, origin: str) -> PatternVariantSpec:
    return PatternVariantSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug=slug,
        timeframe=timeframe,
        search_origin=origin,
    )


def test_build_timeframe_recommendations_marks_upgrade_when_clone_beats_parent() -> None:
    base = "tradoor-oi-reversal-v1__arch-soft-real-loose"
    clone = f"{base}__tf-4h"
    insights = [_make_tf_family_insight(base, clone, best_overall_score=0.55)]
    variant_results = [
        _mk_result(base, 0.42),
        _mk_result(clone, 0.55),
    ]
    variant_specs = [
        _mk_spec(base, "1h", "manual"),
        _mk_spec(clone, "4h", "timeframe_family"),
    ]

    recommendations = build_timeframe_recommendations(insights, variant_results, variant_specs)

    assert len(recommendations) == 1
    rec = recommendations[0]
    assert rec.classification == "upgrade"
    assert rec.recommended_timeframe == "4h"
    assert rec.parent_timeframe == "1h"
    assert rec.score_delta > 0.1
    assert rec.clone_variant_slug == clone


def test_build_timeframe_recommendations_marks_avoid_when_clone_loses_to_parent() -> None:
    base = "tradoor-oi-reversal-v1__arch-soft-real-loose"
    clone = f"{base}__tf-4h"
    insights = [_make_tf_family_insight(base, clone, best_overall_score=0.18)]
    variant_results = [
        _mk_result(base, 0.42),
        _mk_result(clone, 0.18),
    ]
    variant_specs = [
        _mk_spec(base, "1h", "manual"),
        _mk_spec(clone, "4h", "timeframe_family"),
    ]

    recommendations = build_timeframe_recommendations(insights, variant_results, variant_specs)

    assert len(recommendations) == 1
    rec = recommendations[0]
    assert rec.classification == "avoid"
    assert rec.recommended_timeframe == "1h"
    assert rec.score_delta < 0


def test_build_timeframe_recommendations_marks_keep_inside_band() -> None:
    base = "tradoor-oi-reversal-v1__arch-soft-real-loose"
    clone = f"{base}__tf-4h"
    insights = [_make_tf_family_insight(base, clone, best_overall_score=0.42)]
    variant_results = [
        _mk_result(base, 0.42),
        _mk_result(clone, 0.43),
    ]
    variant_specs = [
        _mk_spec(base, "1h", "manual"),
        _mk_spec(clone, "4h", "timeframe_family"),
    ]

    recommendations = build_timeframe_recommendations(insights, variant_results, variant_specs)

    assert len(recommendations) == 1
    assert recommendations[0].classification == "keep"
    assert recommendations[0].recommended_timeframe == "1h"


def test_build_timeframe_recommendations_skips_non_timeframe_families() -> None:
    variant_results = [_mk_result("foo", 0.1), _mk_result("foo__tf-4h", 0.3)]
    variant_specs = [
        _mk_spec("foo", "1h", "manual"),
        _mk_spec("foo__tf-4h", "4h", "timeframe_family"),
    ]
    manual_insight = SearchFamilyInsight(
        family_key="foo",
        family_type="manual",
        representative_variant_slug="foo",
        member_variant_slugs=["foo"],
        best_reference_score=0.1,
        best_holdout_score=0.1,
        best_overall_score=0.1,
        family_score=0.1,
        classification="viable",
    )

    recommendations = build_timeframe_recommendations(
        [manual_insight], variant_results, variant_specs
    )

    assert recommendations == []


def test_select_active_family_insight_ignores_timeframe_family() -> None:
    family_insights = [
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__arch-soft-real-loose__tf-family",
            family_type="timeframe_family",
            representative_variant_slug=(
                "tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h"
            ),
            member_variant_slugs=[
                "tradoor-oi-reversal-v1__arch-soft-real-loose__tf-4h"
            ],
            best_reference_score=0.9,
            best_holdout_score=0.9,
            best_overall_score=0.9,
            family_score=1.5,
            classification="viable",
        ),
        SearchFamilyInsight(
            family_key="tradoor-oi-reversal-v1__arch-soft-real-loose",
            family_type="manual",
            representative_variant_slug="tradoor-oi-reversal-v1__arch-soft-real-loose",
            member_variant_slugs=["tradoor-oi-reversal-v1__arch-soft-real-loose"],
            best_reference_score=0.54,
            best_holdout_score=0.14,
            best_overall_score=0.42,
            family_score=0.455,
            classification="viable",
        ),
    ]

    active = select_active_family_insight(family_insights)

    assert active is not None
    assert active.family_type == "manual"
    assert active.family_key == "tradoor-oi-reversal-v1__arch-soft-real-loose"


# ---------------------------------------------------------------------------
# W-0086 slice #4 — forward-walk validation: no future-leak in detection
# ---------------------------------------------------------------------------


def test_slice_case_frames_clips_at_case_end_at_no_future_leak(monkeypatch) -> None:
    from datetime import timedelta
    from research.pattern_search import _slice_case_frames

    case_end = _dt("2026-04-14T00:00:00+00:00")
    case = BenchmarkCase(
        symbol="TESTUSDT",
        timeframe="1h",
        start_at=_dt("2026-04-13T00:00:00+00:00"),
        end_at=case_end,
        expected_phase_path=["FAKE_DUMP", "BREAKOUT"],
    )
    # klines extend 48 bars (2 days) beyond case.end_at
    extra_end = case_end + timedelta(hours=48)
    full_index = pd.date_range(_dt("2026-04-12T00:00:00+00:00"), extra_end, freq="1h", tz="UTC")
    full_klines = pd.DataFrame(
        {"open": 1.0, "high": 1.0, "low": 1.0, "close": 1.0, "volume": 100.0},
        index=full_index,
    )

    monkeypatch.setattr("research.pattern_search.load_klines", lambda *a, **kw: full_klines)
    monkeypatch.setattr("research.pattern_search.load_perp", lambda *a, **kw: None)
    monkeypatch.setattr(
        "research.pattern_search.compute_features_table",
        lambda klines, *a, **kw: klines,
    )

    sliced_klines, _ = _slice_case_frames(case, timeframe="1h", warmup_bars=0)

    assert sliced_klines.index[-1] <= case_end, (
        f"future data leaked: last bar {sliced_klines.index[-1]} > case.end_at {case_end}"
    )


def test_evaluate_variant_on_case_filters_phase_history_outside_window(monkeypatch) -> None:
    """Phase detections beyond case.end_at must not affect entry_hit / target_hit."""
    from research.pattern_search import evaluate_variant_on_case

    case_end = _dt("2026-04-14T00:00:00+00:00")
    case = BenchmarkCase(
        symbol="PTBUSDT",
        timeframe="1h",
        start_at=_dt("2026-04-13T00:00:00+00:00"),
        end_at=case_end,
        expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
    )

    def _fake_slice(c, *, timeframe, warmup_bars):
        index = pd.date_range(c.start_at, periods=4, freq="6h", tz="UTC")
        frames = pd.DataFrame({"close": [1.0] * 4}, index=index)
        return frames, frames

    class _FakeReplay:
        current_phase = "BREAKOUT"
        # ACCUMULATION within window; BREAKOUT is 6h BEYOND case.end_at
        phase_history = [
            ("FAKE_DUMP", _dt("2026-04-13T06:00:00+00:00")),
            ("REAL_DUMP", _dt("2026-04-13T12:00:00+00:00")),
            ("ACCUMULATION", _dt("2026-04-13T18:00:00+00:00")),
            ("BREAKOUT", _dt("2026-04-14T06:00:00+00:00")),  # future — must be filtered
        ]

    monkeypatch.setattr("research.pattern_search._slice_case_frames", _fake_slice)
    monkeypatch.setattr(
        "research.pattern_search.replay_pattern_frames", lambda *a, **kw: _FakeReplay()
    )
    monkeypatch.setattr(
        "research.pattern_search._measure_forward_peak_return",
        lambda **kw: (None, None, None, None),
    )

    pattern = build_variant_pattern(
        "tradoor-oi-reversal-v1",
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__canonical",
            timeframe="1h",
        ),
    )
    result = evaluate_variant_on_case(pattern, case, timeframe="1h", warmup_bars=0)

    # ACCUMULATION (entry_phase) is within window → entry_hit=True
    assert result.entry_hit is True
    # BREAKOUT (target_phase) is BEYOND case.end_at → filtered out → target_hit=False
    assert result.target_hit is False
    assert "BREAKOUT" not in result.observed_phase_path


# ---------------------------------------------------------------------------
# W-0086 slice #5 — realistic entry price + slippage
# ---------------------------------------------------------------------------


def test_measure_forward_peak_return_computes_realistic_entry_with_slippage(monkeypatch) -> None:
    from research.pattern_search import _measure_forward_peak_return

    # Build klines: entry bar close=100, next bar open=101 (real price), forward closes rise to 120
    index = pd.date_range(_dt("2026-04-13T00:00:00+00:00"), periods=5, freq="1h", tz="UTC")
    klines = pd.DataFrame(
        {
            "open": [99.0, 101.0, 105.0, 115.0, 118.0],
            "close": [100.0, 103.0, 108.0, 118.0, 120.0],
        },
        index=index,
    )
    monkeypatch.setattr("research.pattern_search.load_klines", lambda *a, **kw: klines)

    entry_ts = _dt("2026-04-13T00:00:00+00:00")
    entry_close, paper_pct, entry_next_open, realistic_pct = _measure_forward_peak_return(
        symbol="TESTUSDT",
        timeframe="1h",
        entry_ts=entry_ts,
        horizon_bars=4,
        entry_slippage_pct=0.1,
    )

    assert entry_close == pytest.approx(100.0, rel=1e-6)
    # paper: (120 - 100) / 100 * 100 = 20.0%
    assert paper_pct == pytest.approx(20.0, rel=1e-4)
    # next open = 101.0, slippage 0.1% → adjusted = 101.101
    assert entry_next_open == pytest.approx(101.0 * 1.001, rel=1e-6)
    # realistic: (120 - 101.101) / 101.101 * 100
    expected_realistic = (120.0 - 101.0 * 1.001) / (101.0 * 1.001) * 100.0
    assert realistic_pct == pytest.approx(expected_realistic, rel=1e-4)


def test_evaluate_variant_on_case_populates_realistic_return_fields(monkeypatch) -> None:
    from research.pattern_search import evaluate_variant_on_case

    case = BenchmarkCase(
        symbol="PTBUSDT",
        timeframe="1h",
        start_at=_dt("2026-04-13T00:00:00+00:00"),
        end_at=_dt("2026-04-14T00:00:00+00:00"),
        expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
    )

    def _fake_slice(c, *, timeframe, warmup_bars):
        index = pd.date_range(c.start_at, periods=4, freq="6h", tz="UTC")
        frames = pd.DataFrame({"close": [1.0] * 4}, index=index)
        return frames, frames

    class _FakeReplay:
        current_phase = "ACCUMULATION"
        phase_history = [
            ("FAKE_DUMP", _dt("2026-04-13T06:00:00+00:00")),
            ("ACCUMULATION", _dt("2026-04-13T12:00:00+00:00")),
        ]

    monkeypatch.setattr("research.pattern_search._slice_case_frames", _fake_slice)
    monkeypatch.setattr(
        "research.pattern_search.replay_pattern_frames", lambda *a, **kw: _FakeReplay()
    )
    monkeypatch.setattr(
        "research.pattern_search._measure_forward_peak_return",
        lambda **kw: (0.01, 15.0, 0.010101, 14.5),
    )

    pattern = build_variant_pattern(
        "tradoor-oi-reversal-v1",
        PatternVariantSpec(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__canonical",
            timeframe="1h",
        ),
    )
    result = evaluate_variant_on_case(pattern, case, timeframe="1h", warmup_bars=0, entry_slippage_pct=0.1)

    assert result.entry_close == pytest.approx(0.01)
    assert result.forward_peak_return_pct == pytest.approx(15.0)
    assert result.entry_next_open == pytest.approx(0.010101)
    assert result.realistic_forward_peak_return_pct == pytest.approx(14.5)
