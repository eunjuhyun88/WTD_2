"""Tests for scoring.ensemble — the ensemble filter."""
import pytest

from scoring.ensemble import (
    analyze_blocks,
    compute_ensemble,
    SignalDirection,
    BlockCategory,
    _compute_block_score,
    _compute_regime_bonus,
)


class TestAnalyzeBlocks:
    def test_empty_blocks(self):
        analysis = analyze_blocks([])
        assert analysis.entries == []
        assert analysis.triggers == []
        assert analysis.confirmations == []
        assert analysis.disqualifiers == []
        assert analysis.n_categories_active == 0

    def test_single_entry(self):
        analysis = analyze_blocks(["bullish_engulfing"])
        assert analysis.entries == ["bullish_engulfing"]
        assert analysis.n_categories_active == 1
        assert analysis.bullish_count == 1
        assert analysis.bearish_count == 0

    def test_full_convergence(self):
        blocks = ["bullish_engulfing", "volume_spike", "golden_cross"]
        analysis = analyze_blocks(blocks)
        assert analysis.n_categories_active == 3  # entry + trigger + confirmation
        assert analysis.bullish_count == 2  # volume_spike is neutral (not in bullish/bearish sets)

    def test_bearish_blocks(self):
        blocks = ["bearish_engulfing", "recent_decline", "dead_cross"]
        analysis = analyze_blocks(blocks)
        assert analysis.net_direction == "bearish"
        assert analysis.bearish_count == 3

    def test_disqualifier_flagged(self):
        blocks = ["bullish_engulfing", "extreme_volatility"]
        analysis = analyze_blocks(blocks)
        assert analysis.has_disqualifier
        assert analysis.disqualifiers == ["extreme_volatility"]

    def test_mixed_direction(self):
        blocks = ["bullish_engulfing", "bearish_engulfing"]
        analysis = analyze_blocks(blocks)
        assert analysis.net_direction == "mixed"


class TestBlockScore:
    def test_zero_blocks(self):
        analysis = analyze_blocks([])
        assert _compute_block_score(analysis) == 0.0

    def test_single_block(self):
        analysis = analyze_blocks(["bullish_engulfing"])
        score = _compute_block_score(analysis)
        assert 0.0 < score < 0.5  # low score for single block

    def test_diversity_bonus(self):
        # 3 blocks from 3 categories > 3 blocks from 1 category
        diverse = analyze_blocks(["bullish_engulfing", "volume_spike", "golden_cross"])
        same_cat = analyze_blocks(["bullish_engulfing", "long_lower_wick", "support_bounce"])
        assert _compute_block_score(diverse) > _compute_block_score(same_cat)


class TestRegimeBonus:
    def test_aligned_bullish(self):
        assert _compute_regime_bonus("risk_on", "bullish") == 0.05

    def test_opposed_bearish_in_risk_on(self):
        assert _compute_regime_bonus("risk_on", "bearish") == -0.10

    def test_chop_neutral(self):
        assert _compute_regime_bonus("chop", "bullish") == 0.0


class TestComputeEnsemble:
    def test_neutral_when_nothing(self):
        result = compute_ensemble(p_win=None, blocks_triggered=[], regime="chop")
        assert result.direction == SignalDirection.NEUTRAL
        assert result.confidence == "low"

    def test_strong_long_signal(self):
        result = compute_ensemble(
            p_win=0.70,
            blocks_triggered=["bullish_engulfing", "volume_spike", "golden_cross", "ema_pullback"],
            regime="risk_on",
        )
        assert result.direction in (SignalDirection.STRONG_LONG, SignalDirection.LONG)
        assert result.ensemble_score >= 0.55

    def test_disqualifier_reduces_score(self):
        no_disq = compute_ensemble(
            p_win=0.60,
            blocks_triggered=["bullish_engulfing", "volume_spike"],
            regime="chop",
        )
        with_disq = compute_ensemble(
            p_win=0.60,
            blocks_triggered=["bullish_engulfing", "volume_spike", "extreme_volatility"],
            regime="chop",
        )
        assert with_disq.ensemble_score < no_disq.ensemble_score

    def test_short_signal(self):
        result = compute_ensemble(
            p_win=0.30,  # low P(win) → bearish
            blocks_triggered=["bearish_engulfing", "recent_decline", "dead_cross"],
            regime="risk_off",
        )
        assert result.direction in (SignalDirection.SHORT, SignalDirection.STRONG_SHORT)

    def test_ml_none_uses_neutral(self):
        result = compute_ensemble(
            p_win=None,
            blocks_triggered=["bullish_engulfing", "volume_spike", "golden_cross"],
            regime="risk_on",
        )
        # Should still produce a signal based on blocks alone
        assert result.ml_contribution == 0.5

    def test_to_dict_shape(self):
        result = compute_ensemble(p_win=0.65, blocks_triggered=["bullish_engulfing"], regime="chop")
        d = result.to_dict()
        assert "direction" in d
        assert "ensemble_score" in d
        assert "block_analysis" in d
        assert "confidence" in d
