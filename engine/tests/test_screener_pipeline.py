from __future__ import annotations

from screener.pipeline import ScreenerInputRecord, build_listing_from_input, run_screener
from screener.store import ScreenerStore


def test_build_listing_from_input_scores_core_criteria() -> None:
    listing = build_listing_from_input(
        ScreenerInputRecord(
            symbol="UBUSDT",
            min_mc_usd=12_000_000,
            drawdown_ratio=0.88,
            max_recovery_multiple=4.0,
            adjusted_top10_pct=62.0,
            pattern_phase="ACCUMULATION",
            funding_rate=-0.02,
            oi_change_24h=0.03,
            long_short_ratio=0.8,
        ),
        run_id="scr_test",
    )

    scores = listing.meta["criterion_scores"]
    assert scores["market_cap"] == 85.0
    assert scores["drawdown"] == 100.0
    assert scores["history"] == 100.0
    assert scores["supply"] == 80.0
    assert scores["pattern"] == 100.0
    assert scores["onchain"] == 100.0
    assert listing.structural_grade == "A"
    assert listing.action_priority == "P0"


def test_build_listing_from_input_hard_filters_extreme_cases() -> None:
    listing = build_listing_from_input(
        ScreenerInputRecord(
            symbol="BADUSDT",
            min_mc_usd=150_000_000,
            drawdown_ratio=0.97,
        ),
        run_id="scr_test",
    )

    assert listing.hard_filtered is True
    assert listing.structural_grade == "excluded"


def test_run_screener_applies_symbol_blacklist_override(tmp_path) -> None:
    store = ScreenerStore(tmp_path / "screener.sqlite")
    store.save_override(
        scope="symbol_blacklist",
        target="BADUSDT",
        action="exclude",
        reason="manual deny",
        author="tester",
        created_at="2026-04-16T00:00:00+00:00",
    )

    run, listings = run_screener(
        [
            ScreenerInputRecord(
                symbol="BADUSDT",
                min_mc_usd=5_000_000,
                drawdown_ratio=0.80,
                max_recovery_multiple=2.0,
                adjusted_top10_pct=55.0,
                pattern_phase="ARCH_ZONE",
            ),
            ScreenerInputRecord(
                symbol="GOODUSDT",
                min_mc_usd=7_000_000,
                drawdown_ratio=0.85,
                max_recovery_multiple=2.0,
                adjusted_top10_pct=55.0,
                pattern_phase="ACCUMULATION",
                funding_rate=-0.02,
                oi_change_24h=0.02,
                long_short_ratio=0.85,
            ),
        ],
        store=store,
        mode="full",
        started_at="2026-04-16T00:00:00+00:00",
        completed_at="2026-04-16T00:05:00+00:00",
    )

    assert run.grade_counts["excluded"] == 1
    bad = next(item for item in listings if item.symbol == "BADUSDT")
    good = next(item for item in listings if item.symbol == "GOODUSDT")
    assert bad.hard_filtered is True
    assert "override_blacklist_exclude" in bad.grade_flags
    assert good.structural_grade == "A"
