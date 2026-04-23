"""Cheap market retrieval over the cached corpus, followed by replay rerank."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from math import isnan

import pandas as pd

from data_cache.loader import list_cached_symbols, load_klines, load_perp
from research.live_monitor import resolve_live_variant_slug
from research.pattern_search import (
    BenchmarkCase,
    BenchmarkPackStore,
    PatternVariantSpec,
    VariantCaseResult,
    build_variant_pattern,
    evaluate_variant_on_case,
)
from scanner.feature_calc import compute_features_table

_DEFAULT_HISTORY_BARS = 24 * 30
_DEFAULT_STRIDE_BARS = 6
_DEFAULT_TOP_K = 20
_DEFAULT_REPLAY_TOP_K = 8

_SIGNATURE_FLOORS: dict[str, float] = {
    "price_return_pct": 5.0,
    "range_pct": 5.0,
    "drawdown_pct": 5.0,
    "recovery_pct": 5.0,
    "volume_zscore_mean": 1.0,
    "volume_zscore_max": 1.0,
    "rsi14_end": 5.0,
    "rsi14_change": 5.0,
    "bb_width_end": 0.05,
    "funding_rate_end": 0.001,
    "oi_change_1h_max": 0.05,
    "oi_change_24h_end": 0.05,
    "long_short_ratio_end": 0.1,
    "taker_buy_ratio_end": 0.05,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if isnan(parsed):
        return default
    return parsed


def _pick_reference_case(pattern_slug: str, benchmark_pack_id: str | None = None) -> BenchmarkCase:
    store = BenchmarkPackStore()
    pack = store.load(benchmark_pack_id) if benchmark_pack_id else None
    if pack is None:
        pack = store.ensure_default_pack(pattern_slug)
    for case in pack.cases:
        if case.role == "reference":
            return case
    if not pack.cases:
        raise ValueError(f"No benchmark cases available for {pattern_slug}")
    return pack.cases[0]


def _load_symbol_frames(symbol: str, timeframe: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    klines = load_klines(symbol, timeframe, offline=True)
    if klines is None or klines.empty:
        raise ValueError(f"Missing klines for {symbol} {timeframe}")
    perp = load_perp(symbol, offline=True)
    features = compute_features_table(klines, symbol, perp=perp)
    common_index = klines.index.intersection(features.index)
    if common_index.empty:
        raise ValueError(f"No aligned feature rows for {symbol} {timeframe}")
    return klines.loc[common_index].copy(), features.loc[common_index].copy()


def _slice_window(klines: pd.DataFrame, features: pd.DataFrame, start_at: datetime, end_at: datetime) -> tuple[pd.DataFrame, pd.DataFrame]:
    k_window = klines.loc[(klines.index >= start_at) & (klines.index <= end_at)].copy()
    f_window = features.loc[(features.index >= start_at) & (features.index <= end_at)].copy()
    if k_window.empty or f_window.empty:
        raise ValueError("Empty window")
    common_index = k_window.index.intersection(f_window.index)
    if common_index.empty:
        raise ValueError("No aligned bars in window")
    return k_window.loc[common_index], f_window.loc[common_index]


def _build_window_signature(klines: pd.DataFrame, features: pd.DataFrame) -> dict[str, float]:
    close = klines["close"].astype(float)
    high = klines["high"].astype(float)
    low = klines["low"].astype(float)
    first_close = _safe_float(close.iloc[0], 1.0)
    last_close = _safe_float(close.iloc[-1], first_close)
    low_min = _safe_float(low.min(), first_close)
    high_max = _safe_float(high.max(), first_close)
    running_peak = close.cummax()
    drawdown = ((running_peak - close) / running_peak.replace(0.0, pd.NA)).fillna(0.0)

    vol_zscore = features["vol_zscore"].astype(float) if "vol_zscore" in features.columns else pd.Series(0.0, index=features.index)
    rsi14 = features["rsi14"].astype(float) if "rsi14" in features.columns else pd.Series(50.0, index=features.index)
    bb_width = features["bb_width"].astype(float) if "bb_width" in features.columns else pd.Series(0.0, index=features.index)
    funding_rate = features["funding_rate"].astype(float) if "funding_rate" in features.columns else pd.Series(0.0, index=features.index)
    oi_change_1h = features["oi_change_1h"].astype(float) if "oi_change_1h" in features.columns else pd.Series(0.0, index=features.index)
    oi_change_24h = features["oi_change_24h"].astype(float) if "oi_change_24h" in features.columns else pd.Series(0.0, index=features.index)
    long_short_ratio = features["long_short_ratio"].astype(float) if "long_short_ratio" in features.columns else pd.Series(1.0, index=features.index)
    taker_buy_ratio = features["taker_buy_ratio_1h"].astype(float) if "taker_buy_ratio_1h" in features.columns else pd.Series(0.5, index=features.index)

    return {
        "price_return_pct": _safe_float((last_close - first_close) / first_close * 100.0 if first_close else 0.0),
        "range_pct": _safe_float((high_max - low_min) / first_close * 100.0 if first_close else 0.0),
        "drawdown_pct": _safe_float(drawdown.max() * 100.0),
        "recovery_pct": _safe_float((last_close - low_min) / low_min * 100.0 if low_min else 0.0),
        "volume_zscore_mean": _safe_float(vol_zscore.mean()),
        "volume_zscore_max": _safe_float(vol_zscore.max()),
        "rsi14_end": _safe_float(rsi14.iloc[-1]),
        "rsi14_change": _safe_float(rsi14.iloc[-1] - rsi14.iloc[0]),
        "bb_width_end": _safe_float(bb_width.iloc[-1]),
        "funding_rate_end": _safe_float(funding_rate.iloc[-1]),
        "oi_change_1h_max": _safe_float(oi_change_1h.max()),
        "oi_change_24h_end": _safe_float(oi_change_24h.iloc[-1]),
        "long_short_ratio_end": _safe_float(long_short_ratio.iloc[-1]),
        "taker_buy_ratio_end": _safe_float(taker_buy_ratio.iloc[-1]),
    }


def _signature_distance(reference: dict[str, float], candidate: dict[str, float]) -> float:
    deltas: list[float] = []
    for key, ref_value in reference.items():
        cand_value = candidate.get(key)
        if cand_value is None:
            continue
        denom = max(abs(ref_value), _SIGNATURE_FLOORS.get(key, 1.0))
        deltas.append(abs(cand_value - ref_value) / denom)
    if not deltas:
        return float("inf")
    return sum(deltas) / len(deltas)


@dataclass(frozen=True)
class MarketSearchCandidate:
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    window_bars: int
    retrieval_score: float
    retrieval_distance: float
    retrieval_rank: int | None = None
    replay_score: float | None = None
    current_phase: str | None = None
    phase_fidelity: float | None = None
    entry_hit: bool | None = None
    observed_phase_path: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "start_at": self.start_at.isoformat(),
            "end_at": self.end_at.isoformat(),
            "window_bars": self.window_bars,
            "retrieval_score": self.retrieval_score,
            "retrieval_distance": self.retrieval_distance,
            "retrieval_rank": self.retrieval_rank,
            "replay_score": self.replay_score,
            "current_phase": self.current_phase,
            "phase_fidelity": self.phase_fidelity,
            "entry_hit": self.entry_hit,
            "observed_phase_path": list(self.observed_phase_path),
        }


@dataclass(frozen=True)
class MarketSearchResult:
    pattern_slug: str
    variant_slug: str
    timeframe: str
    reference_symbol: str
    reference_start_at: datetime
    reference_end_at: datetime
    reference_window_bars: int
    universe_size: int
    history_bars: int
    stride_bars: int
    top_k: int
    replay_top_k: int
    candidates: list[MarketSearchCandidate]
    scanned_at: datetime = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        return {
            "pattern_slug": self.pattern_slug,
            "variant_slug": self.variant_slug,
            "timeframe": self.timeframe,
            "reference_symbol": self.reference_symbol,
            "reference_start_at": self.reference_start_at.isoformat(),
            "reference_end_at": self.reference_end_at.isoformat(),
            "reference_window_bars": self.reference_window_bars,
            "universe_size": self.universe_size,
            "history_bars": self.history_bars,
            "stride_bars": self.stride_bars,
            "top_k": self.top_k,
            "replay_top_k": self.replay_top_k,
            "scanned_at": self.scanned_at.isoformat(),
            "candidates": [candidate.to_dict() for candidate in self.candidates],
        }


def run_pattern_market_search(
    *,
    pattern_slug: str,
    variant_slug: str | None = None,
    benchmark_pack_id: str | None = None,
    timeframe: str = "1h",
    history_bars: int = _DEFAULT_HISTORY_BARS,
    stride_bars: int = _DEFAULT_STRIDE_BARS,
    top_k: int = _DEFAULT_TOP_K,
    replay_top_k: int = _DEFAULT_REPLAY_TOP_K,
    universe: list[str] | None = None,
    warmup_bars: int = 240,
) -> MarketSearchResult:
    if timeframe != "1h":
        raise ValueError("W-0152 market retrieval currently supports timeframe='1h' only")

    reference_case = _pick_reference_case(pattern_slug, benchmark_pack_id=benchmark_pack_id)
    reference_klines, reference_features = _load_symbol_frames(reference_case.symbol, timeframe)
    ref_k_window, ref_f_window = _slice_window(
        reference_klines,
        reference_features,
        start_at=reference_case.start_at,
        end_at=reference_case.end_at,
    )
    reference_signature = _build_window_signature(ref_k_window, ref_f_window)
    reference_window_bars = len(ref_k_window)
    if reference_window_bars <= 1:
        raise ValueError("Reference window must contain at least two bars")

    variant_slug = resolve_live_variant_slug(pattern_slug, variant_slug)
    variant = PatternVariantSpec(pattern_slug=pattern_slug, variant_slug=variant_slug, timeframe=timeframe)
    pattern = build_variant_pattern(pattern_slug, variant)

    if universe is None:
        universe = list_cached_symbols(require_perp=False)

    raw_candidates: list[MarketSearchCandidate] = []
    for symbol in universe:
        if symbol == reference_case.symbol:
            continue
        try:
            klines, features = _load_symbol_frames(symbol, timeframe)
        except Exception:
            continue
        if len(klines) < reference_window_bars:
            continue

        end_start = max(reference_window_bars - 1, len(klines) - history_bars)
        best_candidate: MarketSearchCandidate | None = None
        for end_pos in range(end_start, len(klines), max(1, stride_bars)):
            start_pos = end_pos - reference_window_bars + 1
            if start_pos < 0:
                continue
            k_window = klines.iloc[start_pos : end_pos + 1]
            f_window = features.iloc[start_pos : end_pos + 1]
            if len(k_window) != reference_window_bars or len(f_window) != reference_window_bars:
                continue

            candidate_signature = _build_window_signature(k_window, f_window)
            distance = _signature_distance(reference_signature, candidate_signature)
            if distance == float("inf"):
                continue
            score = 1.0 / (1.0 + distance)
            candidate = MarketSearchCandidate(
                symbol=symbol,
                timeframe=timeframe,
                start_at=pd.Timestamp(k_window.index[0]).to_pydatetime(),
                end_at=pd.Timestamp(k_window.index[-1]).to_pydatetime(),
                window_bars=reference_window_bars,
                retrieval_score=round(score, 6),
                retrieval_distance=round(distance, 6),
            )
            if best_candidate is None or candidate.retrieval_score > best_candidate.retrieval_score:
                best_candidate = candidate

        if best_candidate is not None:
            raw_candidates.append(best_candidate)

    raw_candidates.sort(key=lambda candidate: candidate.retrieval_score, reverse=True)
    ranked_candidates = [
        MarketSearchCandidate(
            **{
                **candidate.__dict__,
                "retrieval_rank": idx + 1,
            }
        )
        for idx, candidate in enumerate(raw_candidates[:top_k])
    ]

    reranked: list[MarketSearchCandidate] = []
    for idx, candidate in enumerate(ranked_candidates):
        if idx >= replay_top_k:
            reranked.append(candidate)
            continue
        case = BenchmarkCase(
            symbol=candidate.symbol,
            timeframe=timeframe,
            start_at=candidate.start_at,
            end_at=candidate.end_at,
            expected_phase_path=list(reference_case.expected_phase_path),
            role="holdout",
            notes=["market retrieval candidate"],
        )
        replay_result: VariantCaseResult = evaluate_variant_on_case(
            pattern,
            case,
            timeframe=timeframe,
            warmup_bars=warmup_bars,
        )
        reranked.append(
            MarketSearchCandidate(
                symbol=candidate.symbol,
                timeframe=candidate.timeframe,
                start_at=candidate.start_at,
                end_at=candidate.end_at,
                window_bars=candidate.window_bars,
                retrieval_score=candidate.retrieval_score,
                retrieval_distance=candidate.retrieval_distance,
                retrieval_rank=candidate.retrieval_rank,
                replay_score=replay_result.score,
                current_phase=replay_result.current_phase,
                phase_fidelity=replay_result.phase_fidelity,
                entry_hit=replay_result.entry_hit,
                observed_phase_path=list(replay_result.observed_phase_path),
            )
        )

    reranked.sort(
        key=lambda candidate: (
            candidate.replay_score is not None,
            candidate.replay_score if candidate.replay_score is not None else -1.0,
            candidate.retrieval_score,
        ),
        reverse=True,
    )

    return MarketSearchResult(
        pattern_slug=pattern_slug,
        variant_slug=variant_slug,
        timeframe=timeframe,
        reference_symbol=reference_case.symbol,
        reference_start_at=reference_case.start_at,
        reference_end_at=reference_case.end_at,
        reference_window_bars=reference_window_bars,
        universe_size=len(universe),
        history_bars=history_bars,
        stride_bars=stride_bars,
        top_k=top_k,
        replay_top_k=min(replay_top_k, top_k),
        candidates=reranked,
    )


def print_market_search_report(result: MarketSearchResult) -> None:
    print("=" * 100)
    print(f"MARKET SEARCH  —  {result.scanned_at.strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 100)
    print(
        f"pattern={result.pattern_slug} variant={result.variant_slug} timeframe={result.timeframe} "
        f"reference={result.reference_symbol} [{result.reference_start_at.isoformat()} → {result.reference_end_at.isoformat()}]"
    )
    print(
        f"universe={result.universe_size} history_bars={result.history_bars} stride_bars={result.stride_bars} "
        f"top_k={result.top_k} replay_top_k={result.replay_top_k}"
    )
    print()
    print(
        f"{'RANK':<5} {'SYMBOL':<18} {'RETR':>7} {'REPLAY':>7} {'PHASE':<14} {'ENTRY':<5} "
        f"{'START':<20} {'END':<20}"
    )
    print("-" * 110)
    for idx, candidate in enumerate(result.candidates, start=1):
        replay_score = f"{candidate.replay_score:.3f}" if candidate.replay_score is not None else "n/a"
        phase = candidate.current_phase or "-"
        entry = "YES" if candidate.entry_hit else "no"
        print(
            f"{idx:<5} {candidate.symbol:<18} {candidate.retrieval_score:>7.3f} {replay_score:>7} "
            f"{phase:<14} {entry:<5} "
            f"{candidate.start_at.strftime('%Y-%m-%d %H:%M'):<20} {candidate.end_at.strftime('%Y-%m-%d %H:%M'):<20}"
        )
