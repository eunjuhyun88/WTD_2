"""Unit + integration tests for W-0366 IndicatorFilter."""
from __future__ import annotations

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.pattern_search import IndicatorFilter, PatternVariantSpec
from research.feature_catalog import USER_FACING_FEATURES, ALLOWED_OPERATORS


# -- IndicatorFilter unit tests -----------------------------------------------

def test_filter_lt():
    f = IndicatorFilter('rsi14', '<', 30.0)
    assert f.evaluate(25.0) is True
    assert f.evaluate(35.0) is False


def test_filter_gt():
    f = IndicatorFilter('rsi14', '>', 70.0)
    assert f.evaluate(75.0) is True
    assert f.evaluate(65.0) is False


def test_filter_eq_enum():
    f = IndicatorFilter('ema_alignment', '==', 'bullish')
    assert f.evaluate('bullish') is True
    assert f.evaluate('bearish') is False


def test_filter_in():
    f = IndicatorFilter('ema_alignment', 'in', ['bullish', 'neutral'])
    assert f.evaluate('bullish') is True
    assert f.evaluate('bearish') is False


def test_filter_between():
    f = IndicatorFilter('rsi14', 'between', [30, 70])
    assert f.evaluate(50.0) is True
    assert f.evaluate(25.0) is False
    assert f.evaluate(75.0) is False


def test_filter_invalid_operator():
    with pytest.raises(ValueError):
        IndicatorFilter('rsi14', 'XOR', 30.0)


def test_filter_in_requires_list():
    with pytest.raises(ValueError):
        IndicatorFilter('rsi14', 'in', 30.0)


# -- PatternVariantSpec backward compat ----------------------------------------

def test_from_dict_no_filters():
    """Existing packs without indicator_filters load fine."""
    d = {
        'pattern_slug': 'test', 'variant_slug': 'v1', 'timeframe': '1h',
    }
    spec = PatternVariantSpec.from_dict(d)
    assert spec.indicator_filters == ()


def test_roundtrip_with_filters():
    f = IndicatorFilter('rsi14', '<', 30.0)
    spec = PatternVariantSpec(
        pattern_slug='test', variant_slug='v1', timeframe='1h',
        indicator_filters=(f,),
    )
    d = spec.to_dict()
    assert isinstance(d['indicator_filters'], list)
    spec2 = PatternVariantSpec.from_dict(d)
    assert len(spec2.indicator_filters) == 1
    assert spec2.indicator_filters[0].feature_name == 'rsi14'
    assert spec2.indicator_filters[0].operator == '<'
    assert spec2.indicator_filters[0].value == 30.0


# -- feature_catalog tests -----------------------------------------------------

def test_catalog_has_20_features():
    assert len(USER_FACING_FEATURES) >= 20


@pytest.mark.parametrize('fname,meta', list(USER_FACING_FEATURES.items()))
def test_catalog_operators_valid(fname, meta):
    for op in meta.operators:
        assert op in ALLOWED_OPERATORS, f"{fname}: operator {op!r} not in ALLOWED_OPERATORS"


def test_catalog_enum_features_have_values():
    for fname, meta in USER_FACING_FEATURES.items():
        if meta.value_type == 'enum':
            assert meta.enum_values, f"{fname}: enum type must have enum_values"
