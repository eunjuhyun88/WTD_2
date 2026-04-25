"""Canonical pattern feature-plane helpers.

This module owns the reusable cross-pattern subset that sits between raw
aligned series and pattern/search consumers.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

CANONICAL_PATTERN_FEATURE_VERSION = "canonical-pattern-v1"

CANONICAL_PATTERN_FEATURE_COLUMNS: tuple[str, ...] = (
    "oi_raw",
    "oi_zscore",
    "funding_rate_zscore",
    "funding_flip_flag",
    "volume_percentile",
    "pullback_depth_pct",
    "cvd_price_divergence",
)


def _rolling_zscore(series: pd.Series, period: int, *, clip: float | None = None) -> pd.Series:
    mean = series.rolling(period, min_periods=period).mean()
    std = series.rolling(period, min_periods=period).std(ddof=1)
    zscore = ((series - mean) / std.replace(0, np.nan)).fillna(0.0)
    if clip is not None:
        zscore = zscore.clip(-clip, clip)
    return zscore


def _rolling_percentile(series: pd.Series, period: int) -> pd.Series:
    if period < 2:
        raise ValueError(f"period must be >= 2, got {period}")
    percentile = series.rolling(period, min_periods=period).apply(
        lambda window: float(np.sum(window <= window[-1]) / len(window)),
        raw=True,
    )
    return percentile.fillna(0.5).clip(0.0, 1.0)


def _funding_flip_flag(funding_rate: pd.Series) -> pd.Series:
    previous = funding_rate.shift(1).fillna(0.0)
    return ((previous <= 0.0) & (funding_rate > 0.0)).astype(float)


def _pullback_depth_pct(close: pd.Series, high: pd.Series, period: int) -> pd.Series:
    rolling_high = high.rolling(period, min_periods=1).max()
    return ((rolling_high - close) / rolling_high.replace(0, np.nan)).fillna(0.0).clip(0.0, 1.0)


def _cvd_price_divergence(close: pd.Series, cvd_cumulative: pd.Series, period: int) -> pd.Series:
    price_change = close.pct_change(period).fillna(0.0)
    cvd_change = cvd_cumulative.diff(period).fillna(0.0)
    bullish = (price_change < 0.0) & (cvd_change > 0.0)
    bearish = (price_change > 0.0) & (cvd_change < 0.0)
    return pd.Series(
        np.where(bullish, 1.0, np.where(bearish, -1.0, 0.0)),
        index=close.index,
        dtype=float,
    )


def materialize_canonical_pattern_features(
    *,
    close: pd.Series,
    high: pd.Series,
    volume: pd.Series,
    funding_rate: pd.Series,
    oi_raw: pd.Series,
    cvd_cumulative: pd.Series,
    oi_zscore_period: int,
    funding_rate_zscore_period: int,
    volume_percentile_period: int,
    pullback_period: int,
    cvd_divergence_period: int,
) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "oi_raw": oi_raw.astype(float),
            "oi_zscore": _rolling_zscore(oi_raw.astype(float), oi_zscore_period, clip=4.0),
            "funding_rate_zscore": _rolling_zscore(
                funding_rate.astype(float),
                funding_rate_zscore_period,
                clip=4.0,
            ),
            "funding_flip_flag": _funding_flip_flag(funding_rate.astype(float)),
            "volume_percentile": _rolling_percentile(volume.astype(float), volume_percentile_period),
            "pullback_depth_pct": _pullback_depth_pct(
                close.astype(float),
                high.astype(float),
                pullback_period,
            ),
            "cvd_price_divergence": _cvd_price_divergence(
                close.astype(float),
                cvd_cumulative.astype(float),
                cvd_divergence_period,
            ),
        },
        index=close.index,
    )


def extract_canonical_pattern_feature_snapshot(feature_row: pd.Series | dict) -> dict[str, float | bool | None]:
    values = feature_row if isinstance(feature_row, dict) else feature_row.to_dict()
    snapshot: dict[str, float | bool | None] = {}
    for column in CANONICAL_PATTERN_FEATURE_COLUMNS:
        raw_value = values.get(column)
        if raw_value is None or pd.isna(raw_value):
            snapshot[column] = None
            continue
        if column == "funding_flip_flag":
            snapshot[column] = bool(raw_value)
            continue
        snapshot[column] = float(raw_value)
    return snapshot


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _coerce_feature_float(value: float | bool | None) -> float | None:
    if value is None or isinstance(value, (bool, np.bool_)):
        return None
    return float(value)


def _pullback_shape_score(value: float | None) -> float | None:
    if value is None:
        return None
    center = 0.08
    radius = 0.16
    return _clip01(1.0 - (abs(value - center) / radius))


def score_canonical_feature_snapshot(snapshot: dict[str, float | bool | None]) -> float:
    """Return a compact 0..1 alignment score from the canonical feature subset."""
    if not snapshot:
        return 0.5

    weighted_total = 0.0
    weights = 0.0

    oi_zscore = _coerce_feature_float(snapshot.get("oi_zscore"))
    if oi_zscore is not None:
        weighted_total += 0.30 * _clip01(abs(oi_zscore) / 3.0)
        weights += 0.30

    funding_score: float | None = None
    funding_zscore = _coerce_feature_float(snapshot.get("funding_rate_zscore"))
    funding_flip = snapshot.get("funding_flip_flag")
    if funding_zscore is not None:
        funding_score = _clip01(abs(funding_zscore) / 2.5)
    if funding_flip is not None:
        funding_score = max(funding_score or 0.0, 1.0 if bool(funding_flip) else 0.0)
    if funding_score is not None:
        weighted_total += 0.20 * funding_score
        weights += 0.20

    volume_percentile = _coerce_feature_float(snapshot.get("volume_percentile"))
    if volume_percentile is not None:
        weighted_total += 0.20 * _clip01(volume_percentile)
        weights += 0.20

    pullback_depth = _coerce_feature_float(snapshot.get("pullback_depth_pct"))
    pullback_score = _pullback_shape_score(pullback_depth)
    if pullback_score is not None:
        weighted_total += 0.15 * pullback_score
        weights += 0.15

    cvd_divergence = _coerce_feature_float(snapshot.get("cvd_price_divergence"))
    if cvd_divergence is not None:
        weighted_total += 0.15 * _clip01(abs(cvd_divergence))
        weights += 0.15

    if weights == 0.0:
        return 0.5
    return round(weighted_total / weights, 6)

