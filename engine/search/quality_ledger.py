"""Search Quality Ledger.

Records user judgements (good/bad) on search candidates and computes
signal weight adjustments over time.

Write path:
    POST /search/quality/judge  →  append_judgement(run_id, candidate_id, verdict)

Read path:
    GET  /search/quality/stats  →  layer_stats()  (aggregate quality per layer)
    GET  /search/quality/weights →  compute_weights()  (adjusted blend weights)

Weight recalibration algorithm:
    For each candidate with a judgement:
        - If verdict == "good": reinforce the dominant layer (highest contributor)
        - If verdict == "bad":  penalize the dominant layer

    We track "effective accuracy" per layer:
        acc_layer = good_dominant_for_layer / total_dominant_for_layer

    Adjusted weight = default_weight * (acc_layer / avg_acc)

    Weights are then re-normalised to sum to 1.0.

Defaults (no data):
    layer_a = 0.45, layer_b = 0.30, layer_c = 0.25
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STATE_DIR = Path(__file__).resolve().parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "quality_ledger.sqlite"

_DEFAULT_WEIGHTS = {"layer_a": 0.45, "layer_b": 0.30, "layer_c": 0.25}
_MIN_SAMPLES_FOR_RECALIBRATION = 10  # need at least this many judgements before adjusting


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _jdumps(v: Any) -> str:
    return json.dumps(v if v is not None else {}, sort_keys=True, separators=(",", ":"))


def _jloads(v: str | None, default: Any) -> Any:
    if not v:
        return default
    try:
        return json.loads(v)
    except json.JSONDecodeError:
        return default


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def _init_db(db_path: Path) -> None:
    with _connect(db_path) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS search_judgements (
                judgement_id    TEXT PRIMARY KEY,
                run_id          TEXT NOT NULL,
                candidate_id    TEXT NOT NULL,
                symbol          TEXT,
                verdict         TEXT NOT NULL,   -- 'good' | 'bad' | 'neutral'
                dominant_layer  TEXT,            -- 'layer_a' | 'layer_b' | 'layer_c'
                layer_a_score   REAL,
                layer_b_score   REAL,
                layer_c_score   REAL,
                final_score     REAL,
                user_id         TEXT,
                judged_at       TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_sj_run_id
                ON search_judgements(run_id);
            CREATE INDEX IF NOT EXISTS idx_sj_judged_at
                ON search_judgements(judged_at DESC);
            CREATE INDEX IF NOT EXISTS idx_sj_verdict
                ON search_judgements(verdict, dominant_layer);

            CREATE TABLE IF NOT EXISTS weight_snapshots (
                snapshot_id     TEXT PRIMARY KEY,
                layer_a         REAL NOT NULL,
                layer_b         REAL NOT NULL,
                layer_c         REAL NOT NULL,
                sample_count    INTEGER NOT NULL,
                computed_at     TEXT NOT NULL
            );
        """)


def _dominant_layer(
    layer_a: float | None,
    layer_b: float | None,
    layer_c: float | None,
) -> str:
    """Return the layer with the highest score contribution."""
    scores = {
        "layer_a": (layer_a or 0.0) * _DEFAULT_WEIGHTS["layer_a"],
        "layer_b": (layer_b or 0.0) * _DEFAULT_WEIGHTS["layer_b"],
        "layer_c": (layer_c or 0.0) * _DEFAULT_WEIGHTS["layer_c"],
    }
    return max(scores, key=lambda k: scores[k])


def append_judgement(
    run_id: str,
    candidate_id: str,
    verdict: str,
    *,
    symbol: str | None = None,
    layer_a_score: float | None = None,
    layer_b_score: float | None = None,
    layer_c_score: float | None = None,
    final_score: float | None = None,
    user_id: str | None = None,
    db_path: Path | str = DEFAULT_DB_PATH,
) -> str:
    """Record a user judgement. Returns the new judgement_id.

    verdict: 'good' | 'bad' | 'neutral'
    """
    import uuid
    db_path = Path(db_path)
    _init_db(db_path)

    judgement_id = uuid.uuid4().hex[:20]
    dom = _dominant_layer(layer_a_score, layer_b_score, layer_c_score)

    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO search_judgements
              (judgement_id, run_id, candidate_id, symbol, verdict,
               dominant_layer, layer_a_score, layer_b_score, layer_c_score,
               final_score, user_id, judged_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                judgement_id, run_id, candidate_id, symbol, verdict,
                dom, layer_a_score, layer_b_score, layer_c_score,
                final_score, user_id, _utcnow(),
            ),
        )
    return judgement_id


def layer_stats(
    *,
    limit: int = 1000,
    db_path: Path | str = DEFAULT_DB_PATH,
) -> dict[str, Any]:
    """Return per-layer accuracy stats.

    Returns:
        {
          "total_judgements": int,
          "layers": {
            "layer_a": {"good": int, "bad": int, "total": int, "accuracy": float},
            ...
          }
        }
    """
    db_path = Path(db_path)
    if not db_path.exists():
        return _empty_stats()

    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT dominant_layer, verdict, COUNT(*) as cnt
            FROM search_judgements
            WHERE verdict IN ('good', 'bad')
            GROUP BY dominant_layer, verdict
            """,
        ).fetchall()

    per_layer: dict[str, dict[str, int]] = {
        "layer_a": {"good": 0, "bad": 0},
        "layer_b": {"good": 0, "bad": 0},
        "layer_c": {"good": 0, "bad": 0},
    }
    for row in rows:
        layer = row["dominant_layer"]
        verdict = row["verdict"]
        if layer in per_layer and verdict in ("good", "bad"):
            per_layer[layer][verdict] = int(row["cnt"])

    total = sum(v["good"] + v["bad"] for v in per_layer.values())
    result: dict[str, Any] = {"total_judgements": total, "layers": {}}
    for layer, counts in per_layer.items():
        t = counts["good"] + counts["bad"]
        acc = counts["good"] / t if t > 0 else None
        result["layers"][layer] = {
            "good": counts["good"],
            "bad": counts["bad"],
            "total": t,
            "accuracy": round(acc, 4) if acc is not None else None,
        }
    return result


def compute_weights(
    *,
    db_path: Path | str = DEFAULT_DB_PATH,
) -> dict[str, float]:
    """Compute adjusted blend weights from accumulated judgements.

    Falls back to defaults if there's insufficient data.
    Returns normalised weights summing to 1.0.
    """
    stats = layer_stats(db_path=db_path)
    total = stats.get("total_judgements", 0)
    if total < _MIN_SAMPLES_FOR_RECALIBRATION:
        return dict(_DEFAULT_WEIGHTS)

    layers = stats["layers"]
    accs = {
        layer: (info["accuracy"] or 0.5)
        for layer, info in layers.items()
        if info["total"] >= 3  # need at least 3 samples per layer to trust it
    }

    if not accs:
        return dict(_DEFAULT_WEIGHTS)

    avg_acc = sum(accs.values()) / len(accs)
    if avg_acc < 0.01:
        avg_acc = 0.01

    # Adjust: scale each layer's default weight by its relative accuracy
    adjusted: dict[str, float] = {}
    for layer, default_w in _DEFAULT_WEIGHTS.items():
        if layer in accs:
            adjusted[layer] = default_w * (accs[layer] / avg_acc)
        else:
            adjusted[layer] = default_w  # not enough data, keep default

    # Normalise
    total_w = sum(adjusted.values())
    if total_w < 0.001:
        return dict(_DEFAULT_WEIGHTS)

    return {layer: round(w / total_w, 6) for layer, w in adjusted.items()}


def save_weight_snapshot(
    weights: dict[str, float],
    sample_count: int,
    *,
    db_path: Path | str = DEFAULT_DB_PATH,
) -> None:
    import uuid
    db_path = Path(db_path)
    _init_db(db_path)
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO weight_snapshots
              (snapshot_id, layer_a, layer_b, layer_c, sample_count, computed_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                uuid.uuid4().hex[:16],
                weights.get("layer_a", _DEFAULT_WEIGHTS["layer_a"]),
                weights.get("layer_b", _DEFAULT_WEIGHTS["layer_b"]),
                weights.get("layer_c", _DEFAULT_WEIGHTS["layer_c"]),
                sample_count,
                _utcnow(),
            ),
        )


def _empty_stats() -> dict[str, Any]:
    return {
        "total_judgements": 0,
        "layers": {
            "layer_a": {"good": 0, "bad": 0, "total": 0, "accuracy": None},
            "layer_b": {"good": 0, "bad": 0, "total": 0, "accuracy": None},
            "layer_c": {"good": 0, "bad": 0, "total": 0, "accuracy": None},
        },
    }
