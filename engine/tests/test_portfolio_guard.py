"""W-0311 — PortfolioGuard unit tests."""
from __future__ import annotations

import pytest

from patterns.portfolio_guard import (
    PatternFamily,
    PortfolioGuard,
    get_portfolio_guard,
    reset_portfolio_guard,
)
from patterns.position_guard import Direction, OpenPosition


def _make_pos(symbol: str, direction: Direction = Direction.LONG) -> OpenPosition:
    return OpenPosition(
        symbol=symbol,
        direction=direction,
        entry_price=100.0,
        size_coin=1.0,
        stop_price=95.0,
        target_price=115.0,
    )


@pytest.fixture(autouse=True)
def reset_global():
    reset_portfolio_guard()
    yield
    reset_portfolio_guard()


# ---------------------------------------------------------------------------
# penalty computation
# ---------------------------------------------------------------------------

def test_no_penalty_with_zero_positions():
    guard = PortfolioGuard()
    penalty, _ = guard.compute_penalty(Direction.LONG, PatternFamily.HAMMER)
    assert penalty == 1.0


def test_no_penalty_with_one_same_direction():
    guard = PortfolioGuard()
    guard.register(_make_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    penalty, _ = guard.compute_penalty(Direction.LONG, PatternFamily.DOJI)
    assert penalty == 1.0


def test_two_same_direction_returns_half_AC3():
    guard = PortfolioGuard()
    guard.register(_make_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    guard.register(_make_pos("ETHUSDT", Direction.LONG), PatternFamily.DOJI)
    penalty, _ = guard.compute_penalty(Direction.LONG, PatternFamily.PIN_BAR)
    assert penalty == 0.5


def test_two_same_family_returns_seventy_pct():
    guard = PortfolioGuard()
    guard.register(_make_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    guard.register(_make_pos("ETHUSDT", Direction.SHORT), PatternFamily.HAMMER)
    penalty, _ = guard.compute_penalty(Direction.SHORT, PatternFamily.HAMMER)
    # same_dir=1 (< threshold=2), same_family=2 (>= threshold=2) → penalty=0.7
    assert penalty == pytest.approx(0.7)


def test_same_dir_and_family_compounds_to_035():
    guard = PortfolioGuard()
    guard.register(_make_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    guard.register(_make_pos("ETHUSDT", Direction.LONG), PatternFamily.HAMMER)
    penalty, _ = guard.compute_penalty(Direction.LONG, PatternFamily.HAMMER)
    # same_dir=2 → *0.5, same_family=2 → *0.7 → 0.35
    assert penalty == pytest.approx(0.35)


def test_portfolio_full_blocks_at_five():
    guard = PortfolioGuard()
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
    for sym in symbols:
        guard.register(_make_pos(sym, Direction.LONG), PatternFamily.HAMMER)
    penalty, info = guard.compute_penalty(Direction.SHORT, PatternFamily.DOJI)
    assert penalty == 0.0
    assert info.get("reason") == "portfolio_full"


def test_close_releases_penalty():
    guard = PortfolioGuard()
    guard.register(_make_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    guard.register(_make_pos("ETHUSDT", Direction.LONG), PatternFamily.HAMMER)
    guard.close("ETHUSDT")
    # Now only 1 LONG — below threshold
    penalty, _ = guard.compute_penalty(Direction.LONG, PatternFamily.DOJI)
    assert penalty == 1.0


def test_opposite_direction_no_penalty():
    guard = PortfolioGuard()
    guard.register(_make_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    guard.register(_make_pos("ETHUSDT", Direction.LONG), PatternFamily.DOJI)
    # New SHORT — same_dir count should be 0 for SHORT
    penalty, _ = guard.compute_penalty(Direction.SHORT, PatternFamily.PIN_BAR)
    assert penalty == 1.0


def test_breakdown_dict_shape_contains_keys():
    guard = PortfolioGuard()
    _, info = guard.compute_penalty(Direction.LONG, PatternFamily.HAMMER)
    for key in ("penalty", "same_dir", "same_family", "applied", "n_positions"):
        assert key in info


def test_register_overwrites_same_symbol():
    guard = PortfolioGuard()
    guard.register(_make_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    guard.register(_make_pos("BTCUSDT", Direction.SHORT), PatternFamily.DOJI)
    assert guard.open_count() == 1


def test_get_portfolio_guard_singleton_identity():
    reset_portfolio_guard()
    g1 = get_portfolio_guard()
    g2 = get_portfolio_guard()
    assert g1 is g2
