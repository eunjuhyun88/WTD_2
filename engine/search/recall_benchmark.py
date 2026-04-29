"""F-16: recall@10 benchmark for pattern similarity search.

Usage:
    cd engine && python -m search.recall_benchmark
    # prints JSON report with recall@10 + per-query breakdown

Architecture:
    For each EvalItem in eval_set.EVAL_SET:
      1. Build a temp corpus: 1 expected window + 19 noise windows
      2. Run run_similar_search(query)
      3. Check if expected_window_id appears in top-10
      4. Collect hit/miss, compute recall@10

Noise generation: noise windows use opposite-direction signatures
(e.g., if expected is long/high-vol, noise is flat/low-vol). This
ensures Layer A can discriminate — the eval is not trivially easy.
"""
from __future__ import annotations

import json
import random
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from search.corpus import CorpusWindow, SearchCorpusStore
from search.eval_set import EVAL_SET, EvalItem
from search.similar import run_similar_search


_NOISE_POOL: list[dict[str, Any]] = [
    {"close_return_pct": -0.5, "realized_volatility_pct": 0.8, "volume_ratio": 0.9, "trend": "flat"},
    {"close_return_pct": 1.2, "realized_volatility_pct": 0.5, "volume_ratio": 0.7, "trend": "flat"},
    {"close_return_pct": -3.0, "realized_volatility_pct": 6.0, "volume_ratio": 0.6, "trend": "down"},
    {"close_return_pct": 0.3, "realized_volatility_pct": 0.4, "volume_ratio": 0.8, "trend": "flat"},
    {"close_return_pct": -8.0, "realized_volatility_pct": 7.0, "volume_ratio": 1.1, "trend": "down"},
    {"close_return_pct": 0.1, "realized_volatility_pct": 0.3, "volume_ratio": 0.5, "trend": "flat"},
    {"close_return_pct": 2.5, "realized_volatility_pct": 0.9, "volume_ratio": 0.8, "trend": "up"},
    {"close_return_pct": -1.5, "realized_volatility_pct": 1.2, "volume_ratio": 0.6, "trend": "down"},
    {"close_return_pct": 0.8, "realized_volatility_pct": 0.6, "volume_ratio": 0.7, "trend": "flat"},
    {"close_return_pct": -4.0, "realized_volatility_pct": 5.5, "volume_ratio": 0.9, "trend": "down"},
    {"close_return_pct": 1.0, "realized_volatility_pct": 0.7, "volume_ratio": 0.8, "trend": "up"},
    {"close_return_pct": -0.8, "realized_volatility_pct": 0.5, "volume_ratio": 0.6, "trend": "flat"},
    {"close_return_pct": 3.0, "realized_volatility_pct": 1.0, "volume_ratio": 0.9, "trend": "up"},
    {"close_return_pct": -2.0, "realized_volatility_pct": 4.0, "volume_ratio": 0.7, "trend": "down"},
    {"close_return_pct": 0.5, "realized_volatility_pct": 0.4, "volume_ratio": 0.5, "trend": "flat"},
    {"close_return_pct": -1.0, "realized_volatility_pct": 0.9, "volume_ratio": 0.8, "trend": "flat"},
    {"close_return_pct": 1.8, "realized_volatility_pct": 0.8, "volume_ratio": 0.7, "trend": "up"},
    {"close_return_pct": -5.0, "realized_volatility_pct": 6.5, "volume_ratio": 1.0, "trend": "down"},
    {"close_return_pct": 0.2, "realized_volatility_pct": 0.3, "volume_ratio": 0.6, "trend": "flat"},
]


def _make_window(window_id: str, symbol: str, signature: dict[str, Any]) -> CorpusWindow:
    return CorpusWindow(
        window_id=window_id,
        symbol=symbol,
        timeframe="4h",
        start_ts="2026-01-01T00:00:00+00:00",
        end_ts="2026-01-02T00:00:00+00:00",
        bars=16,
        source="eval_harness",
        signature=signature,
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )


@dataclass
class QueryResult:
    query_id: str
    pattern_slug: str
    hit: bool
    rank: int | None  # 1-based rank of expected window in results (None if not found)
    top_score: float | None
    expected_score: float | None


@dataclass
class RecallReport:
    recall_at_10: float
    hits: int
    total: int
    query_results: list[QueryResult]
    weights_abc: tuple[float, float, float]

    def to_dict(self) -> dict:
        return {
            "recall_at_10": round(self.recall_at_10, 4),
            "hits": self.hits,
            "total": self.total,
            "weights_abc": list(self.weights_abc),
            "per_query": [
                {
                    "query_id": r.query_id,
                    "pattern_slug": r.pattern_slug,
                    "hit": r.hit,
                    "rank": r.rank,
                    "top_score": r.top_score,
                    "expected_score": r.expected_score,
                }
                for r in self.query_results
            ],
        }


def run_recall_benchmark(
    *,
    weights_abc: tuple[float, float, float] = (0.60, 0.30, 0.10),
    eval_set: list[EvalItem] | None = None,
    top_k: int = 10,
    noise_count: int = 19,
    seed: int = 42,
) -> RecallReport:
    """Run recall@10 benchmark over the eval set.

    Args:
        weights_abc: Layer A/B/C blend weights to test.
        eval_set: custom eval items (default: synthetic EVAL_SET).
        top_k: number of results to check (default 10).
        noise_count: noise windows per query (default 19 → 20 total windows).
        seed: random seed for noise window order.
    """
    import search.similar as _similar_mod
    # Override weights for this benchmark run
    _orig_abc = _similar_mod._W_ABC_DEFAULT
    _similar_mod._W_ABC = weights_abc
    _similar_mod._W_ABC_DEFAULT = weights_abc

    rng = random.Random(seed)
    query_results: list[QueryResult] = []
    items = eval_set if eval_set is not None else EVAL_SET

    try:
        for item in items:
            expected_wid = f"eval-expected-{item.query_id}"
            symbol = "BTCUSDT"

            with tempfile.TemporaryDirectory() as tmp:
                corpus_db = Path(tmp) / "search_corpus.sqlite"
                runs_db = Path(tmp) / "similar_runs.sqlite"
                store = SearchCorpusStore(corpus_db)

                # Build corpus: 1 expected + noise_count noise windows
                pool = list(item.real_noise) if item.real_noise else _NOISE_POOL
                noise_sigs = rng.choices(pool, k=noise_count)
                windows = [_make_window(expected_wid, symbol, item.expected_signature)]
                for i, nsig in enumerate(noise_sigs):
                    windows.append(_make_window(f"eval-noise-{item.query_id}-{i}", symbol, nsig))
                store.upsert_windows(windows)

                result = run_similar_search(
                    {
                        "pattern_draft": item.pattern_draft,
                        "timeframe": "4h",
                        "top_k": top_k,
                    },
                    db_path=runs_db,
                    corpus_db_path=corpus_db,
                )

            candidates = result.get("candidates", [])
            candidate_ids = [c.get("window_id") for c in candidates]

            rank: int | None = None
            expected_score: float | None = None
            for idx, c in enumerate(candidates):
                if c.get("window_id") == expected_wid:
                    rank = idx + 1
                    expected_score = c.get("final_score") or c.get("score")
                    break

            top_score = (candidates[0].get("final_score") or candidates[0].get("score")) if candidates else None
            hit = rank is not None and rank <= top_k

            query_results.append(QueryResult(
                query_id=item.query_id,
                pattern_slug=item.pattern_slug,
                hit=hit,
                rank=rank,
                top_score=top_score,
                expected_score=expected_score,
            ))
    finally:
        # Restore original defaults
        _similar_mod._W_ABC = _orig_abc
        _similar_mod._W_ABC_DEFAULT = _orig_abc

    hits = sum(1 for r in query_results if r.hit)
    total = len(query_results)
    recall = hits / total if total > 0 else 0.0

    return RecallReport(
        recall_at_10=recall,
        hits=hits,
        total=total,
        query_results=query_results,
        weights_abc=weights_abc,
    )


if __name__ == "__main__":
    print("Running recall@10 benchmark with weights (0.60, 0.30, 0.10)...")
    report = run_recall_benchmark(weights_abc=(0.60, 0.30, 0.10))
    print(json.dumps(report.to_dict(), indent=2))
    print(f"\nrecall@10 = {report.recall_at_10:.2%}  ({report.hits}/{report.total})")
    baseline = run_recall_benchmark(weights_abc=(0.45, 0.30, 0.25))
    print(f"baseline   = {baseline.recall_at_10:.2%}  ({baseline.hits}/{baseline.total})")
