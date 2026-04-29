"""Tests for W-0292 D-G — DEX efficiency indicators."""
import pytest
from features.dex_ratios import calc_volume_tvl_ratio, calc_fee_revenue_ratio


class TestCalcVolumeTvlRatio:
    def test_normal_case(self):
        assert calc_volume_tvl_ratio(1_000_000, 10_000_000) == pytest.approx(0.1)

    def test_high_activity(self):
        # volume > TVL → ratio > 1
        assert calc_volume_tvl_ratio(5_000_000, 1_000_000) == pytest.approx(5.0)

    def test_zero_tvl_returns_none(self):
        assert calc_volume_tvl_ratio(1_000_000, 0) is None

    def test_negative_tvl_returns_none(self):
        assert calc_volume_tvl_ratio(1_000_000, -500) is None

    def test_none_volume_returns_none(self):
        assert calc_volume_tvl_ratio(None, 1_000_000) is None

    def test_none_tvl_returns_none(self):
        assert calc_volume_tvl_ratio(1_000_000, None) is None

    def test_both_none_returns_none(self):
        assert calc_volume_tvl_ratio(None, None) is None

    def test_zero_volume_valid(self):
        # Zero volume with non-zero TVL is valid (ratio = 0)
        assert calc_volume_tvl_ratio(0.0, 1_000_000) == pytest.approx(0.0)


class TestCalcFeeRevenueRatio:
    def test_normal_case(self):
        ratio = calc_fee_revenue_ratio(3_000, 1_000_000)
        assert ratio == pytest.approx(0.003)

    def test_zero_volume_returns_none(self):
        assert calc_fee_revenue_ratio(3_000, 0) is None

    def test_none_fees_returns_none(self):
        assert calc_fee_revenue_ratio(None, 1_000_000) is None

    def test_none_volume_returns_none(self):
        assert calc_fee_revenue_ratio(3_000, None) is None

    def test_zero_fees_valid(self):
        assert calc_fee_revenue_ratio(0.0, 1_000_000) == pytest.approx(0.0)
