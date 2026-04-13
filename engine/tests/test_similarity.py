"""Tests for scoring.similarity — similarity search engine."""
import pytest
import numpy as np
import pandas as pd

from scoring.similarity import SimilarityIndex


def _make_features_df(n: int = 100) -> pd.DataFrame:
    """Create a synthetic features DataFrame matching FEATURE_NAMES."""
    from scoring.feature_matrix import FEATURE_NAMES

    rng = np.random.RandomState(42)
    data = {}
    for col in FEATURE_NAMES:
        if col in ("ema_alignment", "htf_structure", "cvd_state", "regime"):
            choices = {
                "ema_alignment": ["bearish", "neutral", "bullish"],
                "htf_structure": ["downtrend", "range", "uptrend"],
                "cvd_state": ["selling", "neutral", "buying"],
                "regime": ["risk_off", "chop", "risk_on"],
            }
            data[col] = rng.choice(choices[col], size=n)
        else:
            data[col] = rng.randn(n)

    # Add price column (needed by feature_calc but not in FEATURE_NAMES)
    data["price"] = rng.uniform(30000, 50000, n)

    index = pd.date_range("2023-01-01", periods=n, freq="h", tz="UTC")
    return pd.DataFrame(data, index=index)


class TestSimilarityIndex:
    def test_build_and_query(self):
        idx = SimilarityIndex()
        features = _make_features_df(200)
        labels = np.random.randint(0, 2, 200).astype(np.int8)
        regimes = np.array(["risk_on"] * 200)

        idx.build(features, labels=labels, regimes=regimes)
        assert idx.is_built
        assert idx.size == 200

        result = idx.query(features, top_k=10)
        assert result.n_total == 200
        assert len(result.cases) <= 10
        assert result.win_rate is not None

    def test_empty_index(self):
        idx = SimilarityIndex()
        features = _make_features_df(10)
        result = idx.query(features)
        assert result.n_total == 0
        assert result.confidence == "low"

    def test_self_similarity(self):
        """Query with the last row of the index — should find itself with sim ~1.0."""
        idx = SimilarityIndex()
        features = _make_features_df(100)
        idx.build(features)

        result = idx.query(features, top_k=1, min_similarity=0.0)
        assert len(result.cases) == 1
        assert result.cases[0].similarity > 0.95  # near-perfect self-match

    def test_to_dict(self):
        idx = SimilarityIndex()
        features = _make_features_df(50)
        labels = np.random.randint(0, 2, 50).astype(np.int8)
        idx.build(features, labels=labels)

        result = idx.query(features, top_k=5)
        d = result.to_dict()
        assert "n_total" in d
        assert "cases" in d
        assert "confidence" in d

    def test_no_labels_returns_none_winrate(self):
        idx = SimilarityIndex()
        features = _make_features_df(50)
        idx.build(features)  # no labels

        result = idx.query(features, top_k=5)
        assert result.win_rate is None
