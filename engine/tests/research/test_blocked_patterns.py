"""W-0365 T7: Unit tests for research.blocked_patterns auto-block logic."""
from __future__ import annotations

import importlib
import os

import pytest


def _fresh_module():
    """Reload module to reset _blocked dict between tests."""
    import research.blocked_patterns as mod
    mod._blocked.clear()
    return mod


@pytest.fixture(autouse=True)
def clear_blocked():
    """Reset in-memory _blocked state before each test."""
    import research.blocked_patterns as mod
    mod._blocked.clear()
    yield
    mod._blocked.clear()


@pytest.fixture(autouse=True)
def disable_dry_run(monkeypatch):
    """Disable DRY_RUN so writes actually hit _blocked dict."""
    import research.blocked_patterns as mod
    monkeypatch.setattr(mod, "DRY_RUN", False)


def test_no_block_below_min_n():
    from research.blocked_patterns import maybe_auto_block
    r = maybe_auto_block("test", n=10, mean_pnl_bps=-5.0, sharpe_like=-0.5)
    assert r is None


def test_block_negative_mean():
    from research.blocked_patterns import maybe_auto_block
    r = maybe_auto_block("neg-mean", n=30, mean_pnl_bps=-3.0, sharpe_like=0.5)
    assert r is not None
    assert r.reason == "negative_mean_pnl"


def test_block_negative_sharpe():
    from research.blocked_patterns import maybe_auto_block
    r = maybe_auto_block("neg-sharpe", n=30, mean_pnl_bps=1.0, sharpe_like=-0.1)
    assert r is not None
    assert r.reason == "negative_sharpe"


def test_block_both():
    from research.blocked_patterns import maybe_auto_block
    r = maybe_auto_block("both", n=30, mean_pnl_bps=-2.0, sharpe_like=-0.3)
    assert r is not None
    assert r.reason == "both"


def test_positive_not_blocked():
    from research.blocked_patterns import maybe_auto_block
    r = maybe_auto_block("positive", n=30, mean_pnl_bps=5.0, sharpe_like=0.8)
    assert r is None


def test_is_blocked_after_block():
    from research.blocked_patterns import maybe_auto_block, is_blocked
    maybe_auto_block("slug-x", n=50, mean_pnl_bps=-1.0, sharpe_like=-0.2)
    assert is_blocked("slug-x") is True


def test_is_not_blocked_when_positive():
    from research.blocked_patterns import maybe_auto_block, is_blocked
    maybe_auto_block("slug-pos", n=50, mean_pnl_bps=2.0, sharpe_like=0.5)
    assert is_blocked("slug-pos") is False


def test_get_blocked_returns_list():
    from research.blocked_patterns import maybe_auto_block, get_blocked
    maybe_auto_block("a", n=30, mean_pnl_bps=-1.0, sharpe_like=None)
    maybe_auto_block("b", n=30, mean_pnl_bps=None, sharpe_like=-0.5)
    blocked = get_blocked()
    slugs = {r.pattern_slug for r in blocked}
    assert "a" in slugs
    assert "b" in slugs


def test_none_inputs_no_block():
    from research.blocked_patterns import maybe_auto_block
    r = maybe_auto_block("none-both", n=30, mean_pnl_bps=None, sharpe_like=None)
    assert r is None


def test_zero_mean_pnl_is_blocked():
    """mean_pnl_bps == 0 satisfies <= 0 condition."""
    from research.blocked_patterns import maybe_auto_block
    r = maybe_auto_block("zero-mean", n=30, mean_pnl_bps=0.0, sharpe_like=0.5)
    assert r is not None
    assert r.reason == "negative_mean_pnl"
