"""3-Layer pattern similarity search engine.

Layer A — Feature signature similarity
    Compares reference features from PatternDraft search_hints against each
    corpus window's compact signature using L1 distance.

Layer B — Phase path (sequence) similarity
    Compares observed_phase_paths against each candidate symbol's actual
    phase transition history in PatternStateStore via LCS similarity.
    Score = LCS / max(len(query), len(candidate)).

Layer C — ML p_win
    If LightGBM model is trained, scores using stored feature_snapshot from
    the most recent phase transition for the candidate symbol.

Blending weights:
    - A + B + C:  0.45 / 0.30 / 0.25
    - A + B only: 0.60 / 0.40
    - A + C only: 0.70 / 0.30
    - A only:     1.00
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STATE_DIR = Path(__file__).resolve().parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "similar_runs.sqlite"

# FeatureWindowStore SQLite — used to enrich corpus window signatures with
# the full 40+ signal set (W-0162 strangler upgrade).
_FW_DB_PATH = (
    Path(__file__).resolve().parent.parent
    / "research" / "pattern_search" / "feature_windows.sqlite"
)

_W_ABC_DEFAULT = (0.45, 0.30, 0.25)
_W_AB_DEFAULT  = (0.60, 0.40)
_W_AC_DEFAULT  = (0.70, 0.30)

# Kept as module-level aliases for blending — updated at runtime via quality ledger
_W_ABC = _W_ABC_DEFAULT
_W_AB  = _W_AB_DEFAULT
_W_AC  = _W_AC_DEFAULT


# ── run store ─────────────────────────────────────────────────────────────────

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


def _db_connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def _init_db(db_path: Path) -> None:
    with _db_connect(db_path) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS similar_runs (
                run_id      TEXT PRIMARY KEY,
                request     TEXT NOT NULL,
                candidates  TEXT NOT NULL,
                status      TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_similar_runs_updated
                ON similar_runs(updated_at DESC);
        """)


def _save_run(db_path: Path, run_id: str, request: dict, candidates: list[dict], status: str) -> dict:
    now = _utcnow()
    _init_db(db_path)
    with _db_connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO similar_runs (run_id, request, candidates, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                candidates=excluded.candidates, status=excluded.status,
                updated_at=excluded.updated_at
            """,
            (run_id, _jdumps(request), _jdumps(candidates), status, now, now),
        )
    return {"run_id": run_id, "request": request, "candidates": candidates,
            "status": status, "updated_at": now}


def _load_run(db_path: Path, run_id: str) -> dict | None:
    if not db_path.exists():
        return None
    with _db_connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM similar_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
    if row is None:
        return None
    return {
        "run_id": row["run_id"],
        "request": _jloads(row["request"], {}),
        "candidates": _jloads(row["candidates"], []),
        "status": row["status"],
        "updated_at": row["updated_at"],
    }


# ── W-0162: FeatureWindowStore signal enrichment ──────────────────────────────

def _ts_iso_to_ms(ts: str) -> int | None:
    """Parse ISO timestamp string → epoch milliseconds. Returns None on failure."""
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except (ValueError, TypeError):
        return None


def _fetch_feature_signals_batch(
    windows: list[Any],
    fw_db_path: Path,
) -> dict[str, dict[str, float]]:
    """Batch-fetch FeatureWindowStore signals for a list of corpus windows.

    For each window, finds the nearest feature bar within ±8h of start_ts.
    Returns {window_id: signals_dict}. Silently returns {} on any error so
    Layer A degrades gracefully to the legacy corpus signature.
    """
    if not windows or not fw_db_path.exists():
        return {}

    # Group by (symbol, timeframe) for efficient range queries
    groups: dict[tuple[str, str], list[tuple[str, int]]] = {}
    for w in windows:
        ts_ms = _ts_iso_to_ms(w.start_ts)
        if ts_ms is None:
            continue
        key = (w.symbol.upper(), w.timeframe)
        groups.setdefault(key, []).append((w.window_id, ts_ms))

    if not groups:
        return {}

    result: dict[str, dict[str, float]] = {}
    _TOLERANCE_MS = 8 * 3_600_000  # ±8h — covers up to 2× 4h bars

    try:
        from research.feature_windows import SIGNAL_COLUMNS
        cols_sql = "bar_ts_ms, " + ", ".join(SIGNAL_COLUMNS)
        conn = sqlite3.connect(str(fw_db_path), timeout=5.0)
        conn.row_factory = sqlite3.Row

        for (symbol, timeframe), wid_ts_list in groups.items():
            all_ts = [ts for _, ts in wid_ts_list]
            min_ms = min(all_ts) - _TOLERANCE_MS
            max_ms = max(all_ts) + _TOLERANCE_MS

            rows = conn.execute(
                f"SELECT {cols_sql} FROM feature_windows "
                "WHERE symbol=? AND timeframe=? AND bar_ts_ms BETWEEN ? AND ? "
                "ORDER BY bar_ts_ms",
                [symbol, timeframe, min_ms, max_ms],
            ).fetchall()

            if not rows:
                continue

            fw_map: dict[int, dict[str, float]] = {
                row["bar_ts_ms"]: {col: float(row[col]) for col in SIGNAL_COLUMNS}
                for row in rows
            }
            fw_times = sorted(fw_map.keys())

            for window_id, ts_ms in wid_ts_list:
                nearest = min(fw_times, key=lambda t: abs(t - ts_ms))
                if abs(nearest - ts_ms) <= _TOLERANCE_MS:
                    result[window_id] = fw_map[nearest]

        conn.close()
    except Exception:
        pass  # degrade gracefully — Layer A falls back to corpus signature

    return result


# ── Layer A: feature signature similarity ─────────────────────────────────────

# Signal importance weights for weighted L1 distance.
# OI and funding signals are leading indicators in crypto — weight them higher.
# Price structure and volume are confirmatory — moderate weight.
_SIGNAL_WEIGHTS: dict[str, float] = {
    "oi_zscore": 2.0, "oi_spike_flag": 2.0, "oi_unwind_flag": 1.8,
    "oi_reexpansion_flag": 1.8, "oi_change_24h": 1.5, "oi_change_1h": 1.5,
    "oi_small_uptick_flag": 1.2, "oi_hold_flag": 1.0,
    "funding_rate": 2.0, "funding_extreme_short_flag": 2.0,
    "funding_extreme_long_flag": 2.0, "funding_flip_flag": 1.8,
    "funding_flip_negative_to_positive": 1.8, "funding_flip_positive_to_negative": 1.8,
    "funding_positive_flag": 1.2,
    "vol_zscore": 1.5, "volume_spike_flag": 1.5, "vol_ratio_3": 1.2,
    "volume_dryup_flag": 1.2, "low_volume_flag": 1.0,
    "higher_lows_sequence_flag": 1.5, "breakout_strength": 1.5,
    "fresh_low_break_flag": 1.5, "price_dump_flag": 1.3, "price_spike_flag": 1.3,
    "range_high_break": 1.3, "price_change_1h": 1.2, "price_change_4h": 1.2,
    "higher_low_count": 1.2, "higher_high_count": 1.2, "compression_ratio": 1.1,
    "range_width_pct": 1.0, "short_to_long_switch_flag": 1.8,
    "long_short_ratio": 1.5, "short_build_up_flag": 1.5, "long_build_up_flag": 1.5,
    "close_return_pct": 1.5, "realized_volatility_pct": 1.2, "volume_ratio": 1.2,
}
_DEFAULT_WEIGHT = 1.0


def _extract_reference_sig(pattern_draft: dict[str, Any]) -> dict[str, float]:
    """Pull numeric reference fields from a PatternDraft.

    Priority:
    1. feature_snapshot — full 40+ signal set from capture time (W-0162).
       When a capture is saved, the feature_snapshot carries the exact signal
       state at that bar, giving Layer A the richest possible reference.
    2. search_hints — legacy 3-field fallback for older pattern drafts.
    """
    ref: dict[str, float] = {}

    # 1. feature_snapshot: use all numeric values as-is
    snapshot = pattern_draft.get("feature_snapshot")
    if isinstance(snapshot, dict):
        for k, v in snapshot.items():
            if isinstance(v, (int, float)):
                try:
                    ref[k] = float(v)
                except (TypeError, ValueError):
                    pass

    # 2. search_hints: fill in fields not already covered by the snapshot
    hints = pattern_draft.get("search_hints") or {}

    trp = hints.get("target_return_pct")
    if trp is not None and "close_return_pct" not in ref:
        try:
            ref["close_return_pct"] = float(trp)
        except (TypeError, ValueError):
            pass

    vol = hints.get("volatility_range")
    if "realized_volatility_pct" not in ref:
        if isinstance(vol, dict):
            lo = vol.get("min") or vol.get("low")
            hi = vol.get("max") or vol.get("high")
            try:
                ref["realized_volatility_pct"] = (float(lo) + float(hi)) / 2.0
            except (TypeError, ValueError):
                pass
        elif vol is not None:
            try:
                ref["realized_volatility_pct"] = float(vol)
            except (TypeError, ValueError):
                pass

    vbt = hints.get("volume_breakout_threshold")
    if vbt is not None and "volume_ratio" not in ref:
        try:
            ref["volume_ratio"] = float(vbt)
        except (TypeError, ValueError):
            pass

    return ref


def _layer_a(candidate_sig: dict[str, Any], reference_sig: dict[str, float]) -> float:
    """Weighted L1 distance between candidate and reference signal vectors.

    Higher-importance signals (OI, funding, positioning) contribute more to the
    score than lower-importance ones (price structure, misc flags).
    """
    keys = [
        k for k, v in reference_sig.items()
        if isinstance(v, (int, float)) and isinstance(candidate_sig.get(k), (int, float))
    ]
    if not keys:
        return 0.5  # neutral — no overlap to score
    total_weight = sum(_SIGNAL_WEIGHTS.get(k, _DEFAULT_WEIGHT) for k in keys)
    weighted_dist = sum(
        _SIGNAL_WEIGHTS.get(k, _DEFAULT_WEIGHT) * abs(float(candidate_sig[k]) - float(reference_sig[k]))
        for k in keys
    )
    avg_dist = weighted_dist / total_weight if total_weight > 0 else 0.0
    return 1.0 / (1.0 + avg_dist)


# ── Layer B: phase path sequence similarity ───────────────────────────────────

def _lcs(a: list[str], b: list[str]) -> int:
    """1-D DP LCS length — O(min(m,n)) space."""
    if len(a) < len(b):
        a, b = b, a
    prev = [0] * (len(b) + 1)
    for ai in a:
        curr = [0] * (len(b) + 1)
        for j, bj in enumerate(b, 1):
            curr[j] = prev[j - 1] + 1 if ai == bj else max(curr[j - 1], prev[j])
        prev = curr
    return prev[len(b)]


def _layer_b(query_path: list[str], candidate_path: list[str]) -> float:
    if not query_path or not candidate_path:
        return 0.0
    return _lcs(query_path, candidate_path) / max(len(query_path), len(candidate_path))


def _phase_path_for_symbol(symbol: str, pattern_slug: str | None, timeframe: str) -> list[str]:
    try:
        from patterns.state_store import PatternStateStore
        store = PatternStateStore()
        transitions = store.list_transitions_for_symbol(
            symbol=symbol,
            pattern_slug=pattern_slug,
            timeframe=timeframe,
        )
        return [t.to_phase for t in transitions]
    except Exception:
        return []


def _latest_feature_snapshot_for_symbol(symbol: str, pattern_slug: str | None) -> dict | None:
    """Return the most recent feature_snapshot from phase transitions for this symbol."""
    try:
        from patterns.state_store import PatternStateStore
        store = PatternStateStore()
        transitions = store.list_transitions_for_symbol(
            symbol=symbol,
            pattern_slug=pattern_slug,
            timeframe=None,  # all timeframes
        )
        for t in reversed(transitions):
            if isinstance(t.feature_snapshot, dict) and t.feature_snapshot:
                return t.feature_snapshot
    except Exception:
        pass
    return None


# ── Layer C: ML p_win ─────────────────────────────────────────────────────────

def _layer_c(feature_snapshot: dict[str, Any] | None) -> float | None:
    if not feature_snapshot:
        return None
    try:
        from scoring.lightgbm_engine import get_engine
        engine = get_engine()
        if not engine.is_trained:
            return None
        score = engine.predict_feature_row(feature_snapshot)
        return float(score) if score is not None else None
    except Exception:
        return None


# ── blending ──────────────────────────────────────────────────────────────────

def _blend(a: float, b: float | None, c: float | None) -> float:
    if b is not None and c is not None:
        wa, wb, wc = _W_ABC
        return wa * a + wb * b + wc * c  # type: ignore[operator]
    if b is not None:
        wa, wb = _W_AB
        return wa * a + wb * b  # type: ignore[operator]
    if c is not None:
        wa, wc = _W_AC
        return wa * a + wc * c  # type: ignore[operator]
    return a


# ── public API ─────────────────────────────────────────────────────────────────

def run_similar_search(
    request: dict[str, Any],
    *,
    db_path: Path | str = DEFAULT_DB_PATH,
) -> dict[str, Any]:
    """Score corpus windows against a PatternDraft using 3-layer similarity.

    request keys:
        pattern_draft         dict      PatternDraft with phases + search_hints
        observed_phase_paths  list[str] activates Layer B scoring
        symbol                str       optional corpus filter
        timeframe             str       default "4h"
        top_k                 int       default 10, max 50
    """
    db_path = Path(db_path)

    pattern_draft: dict = request.get("pattern_draft") or {}
    observed: list[str] = request.get("observed_phase_paths") or []
    sym_filter: str | None = request.get("symbol") or None
    timeframe: str = str(request.get("timeframe") or "4h").strip()
    top_k: int = max(1, min(int(request.get("top_k") or 10), 50))
    pattern_slug: str | None = (
        pattern_draft.get("pattern_slug")
        or pattern_draft.get("pattern_family")
        or None
    )

    # Load quality-adjusted weights (falls back to defaults if insufficient data)
    global _W_ABC, _W_AB, _W_AC
    try:
        from search.quality_ledger import compute_weights
        w = compute_weights()
        wa, wb, wc = w.get("layer_a", 0.45), w.get("layer_b", 0.30), w.get("layer_c", 0.25)
        # Re-derive derived tuples from ledger weights
        ab_sum = wa + wb
        ac_sum = wa + wc
        _W_ABC = (wa, wb, wc)
        _W_AB  = (wa / ab_sum if ab_sum > 0 else 0.60, wb / ab_sum if ab_sum > 0 else 0.40)
        _W_AC  = (wa / ac_sum if ac_sum > 0 else 0.70, wc / ac_sum if ac_sum > 0 else 0.30)
    except Exception:
        pass  # keep defaults

    from search.corpus import SearchCorpusStore
    windows = SearchCorpusStore().list_windows(
        symbol=sym_filter,
        timeframe=timeframe,
        limit=min(top_k * 5, 200),
    )

    ref_sig = _extract_reference_sig(pattern_draft)
    has_query_path = bool(observed)

    # W-0162: enrich window signatures with full feature signals when available
    fw_enrichment = _fetch_feature_signals_batch(windows, _FW_DB_PATH)

    candidates: list[dict[str, Any]] = []
    for w in windows:
        # Merge feature signals (40+ dims) on top of corpus signature (6 dims)
        cand_sig = dict(w.signature)
        if w.window_id in fw_enrichment:
            cand_sig.update(fw_enrichment[w.window_id])
        la = _layer_a(cand_sig, ref_sig)

        # Layer B — phase path
        lb: float | None = None
        cand_path: list[str] = []
        if has_query_path:
            cand_path = _phase_path_for_symbol(w.symbol, pattern_slug, w.timeframe)
            lb = _layer_b(observed, cand_path)

        # Layer C — ML: fw_enrichment signals > stored snapshot > transitions
        snap = fw_enrichment.get(w.window_id)
        if not isinstance(snap, dict):
            snap = w.signature.get("feature_snapshot")
        if not isinstance(snap, dict):
            snap = _latest_feature_snapshot_for_symbol(w.symbol, pattern_slug)
        lc = _layer_c(snap)

        final = _blend(la, lb, lc)

        candidates.append({
            "candidate_id": _candidate_id(w.window_id, pattern_draft),
            "window_id": w.window_id,
            "symbol": w.symbol,
            "timeframe": w.timeframe,
            "start_ts": w.start_ts,
            "end_ts": w.end_ts,
            "bars": w.bars,
            "final_score": round(min(max(final, 0.0), 1.0), 6),
            "layer_a_score": round(la, 6),
            "layer_b_score": round(lb, 6) if lb is not None else None,
            "layer_c_score": round(lc, 6) if lc is not None else None,
            "candidate_phase_path": cand_path,
            "signature": w.signature,
            "close_return_pct": w.signature.get("close_return_pct"),
        })

    candidates.sort(key=lambda c: c["final_score"], reverse=True)
    run_id = uuid.uuid4().hex[:24]
    status = "live" if candidates else "degraded"
    return _save_run(
        db_path,
        run_id=run_id,
        request={**request, "mode": "3layer"},
        candidates=candidates[:top_k],
        status=status,
    )


def get_similar_search(
    run_id: str,
    *,
    db_path: Path | str = DEFAULT_DB_PATH,
) -> dict[str, Any] | None:
    return _load_run(Path(db_path), run_id)


def _candidate_id(window_id: str, pattern_draft: dict[str, Any]) -> str:
    family = str(pattern_draft.get("pattern_family") or pattern_draft.get("pattern_slug") or "")
    return hashlib.sha1(f"{window_id}|{family}".encode()).hexdigest()[:20]
