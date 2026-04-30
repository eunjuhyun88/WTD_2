"""Mine real EvalItem pairs from the SearchCorpusStore using temporal overlap.

Temporal overlap eval design:
  - Corpus windows: 48-bar rolling windows with 12h stride → 75% bar overlap
  - Query: window[i]'s signature as search_hints in pattern_draft
  - Expected: window[i+1] (next window, 75% overlap → should be very similar)
  - Distractors: 99 real corpus windows from the same 30-day period

This replaces the trivially-100% synthetic eval (19 hand-crafted contrarian
noise windows) with realistic distractors drawn from the actual 188K-window
corpus, measuring real Layer A discriminability under production conditions.

Usage:
    from search.eval_miner import mine_real_eval_set
    items = mine_real_eval_set(n_items=50)
"""
from __future__ import annotations

import json
import random
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from search.eval_set import EvalItem

_CORPUS_DB = Path(__file__).resolve().parent / "state" / "search_corpus.sqlite"

# Minimum windows needed per symbol/timeframe to form temporal pairs
_MIN_WINDOWS = 10

# How many days around the query window to draw distractors from
_DISTRACTOR_WINDOW_DAYS = 30

# Fields used for Layer A scoring (6-field compact corpus schema)
_SCORE_FIELDS = (
    "close_return_pct",
    "high_low_range_pct",
    "last_close",
    "realized_volatility_pct",
    "trend",
    "volume_ratio",
)


@dataclass
class _RawWindow:
    window_id: str
    symbol: str
    timeframe: str
    start_ts: str
    end_ts: str
    end_epoch: int
    signature: dict[str, Any]


def _load_windows(
    db_path: Path,
    symbol: str,
    timeframe: str,
    limit: int = 2000,
) -> list[_RawWindow]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT window_id, symbol, timeframe, start_ts, end_ts,
               CAST(strftime('%s', end_ts) AS INTEGER) AS end_epoch,
               signature_json
        FROM search_corpus_windows
        WHERE symbol = ? AND timeframe = ? AND bars = 48
        ORDER BY end_ts
        LIMIT ?
        """,
        (symbol, timeframe, limit),
    ).fetchall()
    conn.close()

    result = []
    for r in rows:
        try:
            sig = json.loads(r["signature_json"])
        except (json.JSONDecodeError, TypeError):
            continue
        if not sig:
            continue
        result.append(_RawWindow(
            window_id=r["window_id"],
            symbol=r["symbol"],
            timeframe=r["timeframe"],
            start_ts=r["start_ts"],
            end_ts=r["end_ts"],
            end_epoch=r["end_epoch"] or 0,
            signature=sig,
        ))
    return result


def _sig_to_search_hints(sig: dict[str, Any]) -> dict[str, Any]:
    """Convert a corpus signature dict to search_hints for a pattern_draft."""
    hints: dict[str, Any] = {}
    for k in _SCORE_FIELDS:
        v = sig.get(k)
        if v is not None:
            hints[k] = v
    return hints


def mine_real_eval_set(
    *,
    n_items: int = 50,
    noise_per_item: int = 99,
    seed: int = 42,
    corpus_db_path: Path | str | None = None,
) -> list[EvalItem]:
    """Generate EvalItems from consecutive corpus window pairs.

    For each item:
      - query signature  = window[i]  (search_hints in pattern_draft)
      - expected window  = window[i+1] (75% temporal overlap with query)
      - real_noise       = 99 contemporary windows (same 30-day window)

    Args:
        n_items: number of eval items to generate.
        noise_per_item: real distractors per query (default 99 → 100 total corpus).
        seed: random seed for sampling.
        corpus_db_path: override the default corpus DB path.
    """
    db = Path(corpus_db_path) if corpus_db_path else _CORPUS_DB
    if not db.exists():
        return []

    rng = random.Random(seed)

    # Symbols with enough windows, prioritise major pairs for stable regimes
    priority_symbols = [
        "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT",
        "SOLUSDT", "DOGEUSDT", "LTCUSDT", "LINKUSDT", "ATOMUSDT",
    ]

    conn = sqlite3.connect(str(db))
    available = conn.execute(
        """
        SELECT symbol, timeframe, COUNT(*) as n
        FROM search_corpus_windows WHERE bars = 48
        GROUP BY symbol, timeframe HAVING n >= ?
        ORDER BY n DESC
        """,
        (_MIN_WINDOWS,),
    ).fetchall()
    conn.close()

    avail_set = {(r[0], r[1]) for r in available}

    # Ordered candidate pairs: priority first, then rest
    candidates: list[tuple[str, str]] = []
    for sym in priority_symbols:
        for tf in ("1h", "4h"):
            if (sym, tf) in avail_set:
                candidates.append((sym, tf))
    for r in available:
        pair = (r[0], r[1])
        if pair not in candidates:
            candidates.append(pair)

    items: list[EvalItem] = []
    items_per_pair = max(1, (n_items + len(candidates) - 1) // len(candidates)) if candidates else 1

    for symbol, timeframe in candidates:
        if len(items) >= n_items:
            break

        windows = _load_windows(db, symbol, timeframe)
        if len(windows) < 3:
            continue

        # Sample query indices (not the last window — need a next window)
        indices = list(range(len(windows) - 1))
        rng.shuffle(indices)

        for qi in indices[:items_per_pair]:
            if len(items) >= n_items:
                break

            query_win = windows[qi]
            expected_win = windows[qi + 1]

            # Draw distractors from windows within ±30 days of expected_win
            secs_30d = _DISTRACTOR_WINDOW_DAYS * 86400
            distractor_pool = [
                w for w in windows
                if w.window_id != query_win.window_id
                and w.window_id != expected_win.window_id
                and abs(w.end_epoch - expected_win.end_epoch) <= secs_30d
            ]

            if len(distractor_pool) < noise_per_item:
                # Fall back to all windows as pool
                distractor_pool = [
                    w for w in windows
                    if w.window_id not in {query_win.window_id, expected_win.window_id}
                ]

            noise_wins = rng.sample(
                distractor_pool,
                k=min(noise_per_item, len(distractor_pool)),
            )
            real_noise = tuple(w.signature for w in noise_wins)

            query_id = f"real-{symbol}-{timeframe}-{qi}"
            items.append(EvalItem(
                query_id=query_id,
                pattern_slug=f"temporal-overlap-{symbol.lower()}",
                pattern_draft={
                    "pattern_slug": f"temporal-overlap-{symbol.lower()}",
                    # Use feature_snapshot so _extract_reference_sig picks up
                    # all numeric fields — matches the production code path.
                    "feature_snapshot": {
                        k: v for k, v in query_win.signature.items()
                        if isinstance(v, (int, float))
                    },
                },
                expected_signature=expected_win.signature,
                noise_profile="real",
                real_noise=real_noise,
            ))

    return items


def report_coverage(corpus_db_path: Path | str | None = None) -> dict[str, Any]:
    """Return a summary of corpus coverage for diagnostic purposes."""
    db = Path(corpus_db_path) if corpus_db_path else _CORPUS_DB
    if not db.exists():
        return {"error": "corpus DB not found", "path": str(db)}

    conn = sqlite3.connect(str(db))
    rows = conn.execute(
        """
        SELECT symbol, timeframe,
               COUNT(*) as n_windows,
               MIN(start_ts) as earliest,
               MAX(end_ts) as latest
        FROM search_corpus_windows WHERE bars = 48
        GROUP BY symbol, timeframe
        ORDER BY n_windows DESC
        LIMIT 20
        """
    ).fetchall()
    total = conn.execute(
        "SELECT COUNT(*) FROM search_corpus_windows"
    ).fetchone()[0]
    conn.close()

    return {
        "total_windows": total,
        "top_symbols": [
            {
                "symbol": r[0], "timeframe": r[1],
                "n": r[2], "earliest": r[3], "latest": r[4],
            }
            for r in rows
        ],
    }
