"""Tests for VAR (Volume Absorption Reversal) building blocks.

Covers:
  - building_blocks.triggers.volume_spike_down
  - building_blocks.confirmations.delta_flip_positive
"""
from __future__ import annotations

import pytest
import pandas as pd

from building_blocks.triggers.volume_spike_down import volume_spike_down
from building_blocks.confirmations.delta_flip_positive import delta_flip_positive


# ---------------------------------------------------------------------------
# volume_spike_down tests
# ---------------------------------------------------------------------------

class TestVolumeSpikeDown:

    def test_detects_high_volume_down_bar(self, make_ctx):
        """A red bar with 4× avg volume should trigger."""
        # 10 flat bars (close=100, open=100), then 1 down bar with 4× volume
        closes = [100.0] * 10 + [97.0]   # last bar closes lower
        opens  = [100.0] * 11            # open = 100 throughout
        vols   = [1000.0] * 10 + [4000.0]
        ctx = make_ctx(close=closes, overrides={"open": opens, "volume": vols})
        mask = volume_spike_down(ctx, multiple=3.0, vs_window=10)
        assert bool(mask.iloc[-1]) is True

    def test_up_bar_not_detected_even_with_volume_spike(self, make_ctx):
        """A green bar with high volume is NOT a selling climax."""
        closes = [100.0] * 10 + [103.0]  # close > open → green
        opens  = [100.0] * 11
        vols   = [1000.0] * 10 + [4000.0]
        ctx = make_ctx(close=closes, overrides={"open": opens, "volume": vols})
        mask = volume_spike_down(ctx, multiple=3.0, vs_window=10)
        assert bool(mask.iloc[-1]) is False

    def test_down_bar_without_volume_spike_not_detected(self, make_ctx):
        """A red bar with normal volume is NOT a climax."""
        closes = [100.0] * 10 + [98.0]
        opens  = [100.0] * 11
        vols   = [1000.0] * 11          # no spike
        ctx = make_ctx(close=closes, overrides={"open": opens, "volume": vols})
        mask = volume_spike_down(ctx, multiple=3.0, vs_window=10)
        assert bool(mask.iloc[-1]) is False

    def test_insufficient_history_returns_false(self, make_ctx):
        """With fewer bars than vs_window, result should be all-False."""
        ctx = make_ctx(close=[100.0, 99.0, 98.0])  # only 3 bars
        mask = volume_spike_down(ctx, multiple=2.0, vs_window=10)
        assert not mask.any()

    def test_exactly_at_multiple_is_true(self, make_ctx):
        """Volume exactly at the threshold satisfies >= condition."""
        closes = [100.0] * 5 + [97.0]
        opens  = [100.0] * 6
        vols   = [1000.0] * 5 + [3000.0]  # exactly 3× avg
        ctx = make_ctx(close=closes, overrides={"open": opens, "volume": vols})
        mask = volume_spike_down(ctx, multiple=3.0, vs_window=5)
        assert bool(mask.iloc[-1]) is True

    def test_invalid_multiple_raises(self, make_ctx):
        ctx = make_ctx(close=[100.0] * 5)
        with pytest.raises(ValueError):
            volume_spike_down(ctx, multiple=0.0, vs_window=3)

    def test_invalid_vs_window_raises(self, make_ctx):
        ctx = make_ctx(close=[100.0] * 5)
        with pytest.raises(ValueError):
            volume_spike_down(ctx, multiple=2.0, vs_window=0)

    def test_all_up_bars_returns_all_false(self, make_ctx):
        """All green bars → never triggers."""
        closes = list(range(100, 115))   # monotone up
        opens  = [closes[0]] + closes[:-1]
        ctx = make_ctx(close=closes, overrides={"open": opens})
        mask = volume_spike_down(ctx, multiple=2.0, vs_window=5)
        assert not mask.any()

    def test_multiple_climax_bars_detected(self, make_ctx):
        """Two separate high-volume down bars should both trigger."""
        closes = [100.0] * 5 + [96.0] + [100.0] * 5 + [95.0]
        opens  = [100.0] * 12
        vols   = [500.0] * 5 + [2000.0] + [500.0] * 5 + [2000.0]
        ctx = make_ctx(close=closes, overrides={"open": opens, "volume": vols})
        mask = volume_spike_down(ctx, multiple=3.0, vs_window=5)
        assert bool(mask.iloc[5]) is True
        assert bool(mask.iloc[-1]) is True


# ---------------------------------------------------------------------------
# delta_flip_positive tests
# ---------------------------------------------------------------------------

class TestDeltaFlipPositive:

    def _make_tbv_ctx(self, make_ctx, tbv_ratios: list[float]) -> object:
        """Build ctx where taker_buy_base_volume / volume = tbv_ratios."""
        n = len(tbv_ratios)
        closes = [100.0] * n
        vols   = [1000.0] * n
        tbv    = [1000.0 * r for r in tbv_ratios]
        return make_ctx(
            close=closes,
            overrides={"volume": vols, "taker_buy_base_volume": tbv},
        )

    def test_flip_detected_when_ratio_crosses_above_neutral(self, make_ctx):
        """Ratio goes from 0.40 → 0.60 over window=2 → flip at last bar."""
        # 6 bars below 0.5, then 2 bars above 0.5 (window=2 rolling sum)
        ratios = [0.40] * 6 + [0.60] * 2
        ctx = self._make_tbv_ctx(make_ctx, ratios)
        mask = delta_flip_positive(ctx, window=2, flip_from_below=0.50, flip_to_at_least=0.55)
        assert bool(mask.iloc[-1]) is True
        # Prior bars: ratio was below 0.50 throughout → no prior flip
        assert not mask.iloc[:-1].any()

    def test_no_flip_when_already_above(self, make_ctx):
        """Ratio is above 0.5 all the time → no crossing → all False."""
        ratios = [0.60] * 10
        ctx = self._make_tbv_ctx(make_ctx, ratios)
        mask = delta_flip_positive(ctx, window=2, flip_from_below=0.50, flip_to_at_least=0.55)
        # Prior window always above → prior_ratio >= flip_from_below → no flip
        assert not mask.any()

    def test_no_flip_when_always_below(self, make_ctx):
        """Ratio is always below 0.5 → never crosses → all False."""
        ratios = [0.40] * 10
        ctx = self._make_tbv_ctx(make_ctx, ratios)
        mask = delta_flip_positive(ctx, window=2, flip_from_below=0.50, flip_to_at_least=0.55)
        assert not mask.any()

    def test_multiple_flips_detected(self, make_ctx):
        """Two distinct flip events should both be detected."""
        # window=2: prior=[i-3,i-2], current=[i-1,i]
        # need 2 low bars, then 2 high bars for each flip
        ratios = [0.40, 0.40, 0.60, 0.60, 0.40, 0.40, 0.60, 0.60]
        ctx = self._make_tbv_ctx(make_ctx, ratios)
        mask = delta_flip_positive(ctx, window=2, flip_from_below=0.50, flip_to_at_least=0.55)
        assert bool(mask.iloc[3]) is True   # first flip (bars 2+3 high, bars 0+1 low)
        assert bool(mask.iloc[7]) is True   # second flip (bars 6+7 high, bars 4+5 low)

    def test_rolling_window_smooths_single_noisy_bar(self, make_ctx):
        """window=3 means a single spike bar doesn't trigger alone."""
        # 7 bars at 0.40, then 1 at 0.80, then back to 0.40
        # With window=3, rolling sum at bar 7 = (0.40+0.40+0.80)/3 ≈ 0.533 ≥ 0.52
        # Prior window at bar 7 = bars [4,5,6] = all 0.40 < 0.50 → flip!
        ratios = [0.40] * 7 + [0.80] + [0.40]
        ctx = self._make_tbv_ctx(make_ctx, ratios)
        mask = delta_flip_positive(ctx, window=3, flip_from_below=0.50, flip_to_at_least=0.52)
        assert bool(mask.iloc[7]) is True

    def test_insufficient_history_returns_false(self, make_ctx):
        """With only 2 bars and window=5, nothing can flip."""
        ratios = [0.60, 0.60]
        ctx = self._make_tbv_ctx(make_ctx, ratios)
        mask = delta_flip_positive(ctx, window=5, flip_from_below=0.50, flip_to_at_least=0.55)
        assert not mask.any()

    def test_invalid_flip_window_raises(self, make_ctx):
        ctx = self._make_tbv_ctx(make_ctx, [0.5] * 5)
        with pytest.raises(ValueError):
            delta_flip_positive(ctx, window=1)  # must be >= 2

    def test_invalid_threshold_raises(self, make_ctx):
        ctx = self._make_tbv_ctx(make_ctx, [0.5] * 5)
        with pytest.raises(ValueError):
            delta_flip_positive(ctx, flip_from_below=1.0)
        with pytest.raises(ValueError):
            delta_flip_positive(ctx, flip_from_below=0.0)

    def test_zero_volume_bars_treated_as_neutral(self, make_ctx):
        """Zero-volume bars fill to neutral (0.5) — do not trigger alone."""
        n = 10
        # Override volume to zero for the last 3 bars
        vols = [1000.0] * (n - 3) + [0.0, 0.0, 0.0]
        tbv  = [500.0] * (n - 3) + [0.0, 0.0, 0.0]
        ctx2 = make_ctx(
            close=[100.0] * n,
            overrides={"volume": vols, "taker_buy_base_volume": tbv},
        )
        mask = delta_flip_positive(ctx2, window=2, flip_from_below=0.50, flip_to_at_least=0.55)
        # Zero-vol bars fill to neutral (0.5) which is < flip_to_at_least → no flip
        assert not mask.any()


# ---------------------------------------------------------------------------
# VAR pattern in library registry
# ---------------------------------------------------------------------------

def test_var_pattern_registered():
    from patterns.library import PATTERN_LIBRARY, get_pattern
    assert "volume-absorption-reversal-v1" in PATTERN_LIBRARY
    pat = get_pattern("volume-absorption-reversal-v1")
    assert pat.slug == "volume-absorption-reversal-v1"
    phase_ids = {p.phase_id for p in pat.phases}
    # CTO fix (W-0103 Slice 3): BASE_FORMATION→DELTA_FLIP, BREAKOUT→MARKUP
    assert phase_ids == {"SELLING_CLIMAX", "ABSORPTION", "DELTA_FLIP", "MARKUP"}
    assert pat.entry_phase == "DELTA_FLIP"
    assert pat.target_phase == "MARKUP"
    assert "spot_compatible" in pat.tags


def test_var_block_evaluator_registered():
    """volume_spike_down and delta_flip_positive appear in the block registry."""
    from scoring.block_evaluator import _BLOCKS
    names = {name for name, _ in _BLOCKS}
    assert "volume_spike_down" in names
    assert "delta_flip_positive" in names
