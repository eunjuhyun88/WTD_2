from __future__ import annotations

from datetime import datetime, timedelta, timezone

from screener.engine import build_listing
from screener.store import ScreenerStore


def _iso(delta_hours: int = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=delta_hours)).isoformat()


def test_screener_run_and_latest_listings_persist(tmp_path) -> None:
    store = ScreenerStore(tmp_path / "screener.sqlite")
    run = store.create_run(mode="full", started_at=_iso())

    listings = [
        build_listing(
            symbol="BTCUSDT",
            run_id=run.run_id,
            structural_score=85.0,
            timing_score=91.0,
            pattern_phase="ACCUMULATION",
            available_weight=0.92,
        ),
        build_listing(
            symbol="ETHUSDT",
            run_id=run.run_id,
            structural_score=67.0,
            timing_score=72.0,
            pattern_phase="REAL_DUMP",
            available_weight=0.9,
        ),
        build_listing(
            symbol="XRPUSDT",
            run_id=run.run_id,
            structural_score=45.0,
            timing_score=40.0,
            available_weight=0.9,
        ),
    ]
    store.replace_latest_listings(run.run_id, listings)
    completed = store.complete_run(
        run.run_id,
        completed_at=_iso(),
        symbols_considered=3,
        symbols_scored=3,
        symbols_filtered_hard=0,
        grade_counts={"A": 1, "B": 1, "C": 1},
    )

    assert completed.status == "completed"
    assert store.get_latest_run() is not None

    fetched = store.get_latest_listing("btcusdt")
    assert fetched is not None
    assert fetched.structural_grade == "A"
    assert fetched.action_priority == "P0"

    filtered = store.list_filtered_symbols(max_symbols=10)
    assert filtered == ["BTCUSDT", "ETHUSDT"]


def test_filtered_symbols_require_fresh_completed_run(tmp_path) -> None:
    store = ScreenerStore(tmp_path / "screener.sqlite")
    run = store.create_run(mode="full", started_at="2026-01-01T00:00:00+00:00")
    store.replace_latest_listings(
        run.run_id,
        [
            build_listing(
                symbol="BTCUSDT",
                run_id=run.run_id,
                structural_score=88.0,
                timing_score=80.0,
                available_weight=0.9,
            )
        ],
    )
    store.complete_run(
        run.run_id,
        completed_at="2026-01-01T00:10:00+00:00",
        symbols_considered=1,
        symbols_scored=1,
        symbols_filtered_hard=0,
        grade_counts={"A": 1, "B": 0, "C": 0},
    )

    assert store.list_filtered_symbols(max_symbols=10) == []


def test_active_overrides_exclude_expired_rows(tmp_path) -> None:
    store = ScreenerStore(tmp_path / "screener.sqlite")
    active = store.save_override(
        scope="symbol_blacklist",
        target="BADUSDT",
        action="exclude",
        reason="known washed name",
        author="tester",
        created_at="2026-04-16T00:00:00+00:00",
    )
    store.save_override(
        scope="wallet_allow_deny",
        target="0xdeadbeef",
        action="ignore",
        reason="known binance treasury",
        author="tester",
        created_at="2026-04-16T00:00:00+00:00",
        expires_at="2026-04-16T01:00:00+00:00",
    )

    overrides = store.list_active_overrides(now_iso="2026-04-16T02:00:00+00:00")
    assert [item.override_id for item in overrides] == [active.override_id]
