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

Blending weights (W-0247: Layer C untrained → reduced from 0.25 → 0.10):
    - A + B + C:  0.60 / 0.30 / 0.10
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

from search._signals import (
    FW_DB_PATH as _FW_DB_PATH,
    fetch_feature_signals_batch as _fetch_feature_signals_batch,
    weighted_l1_score as _weighted_l1_score,
)

STATE_DIR = Path(__file__).resolve().parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "similar_runs.sqlite"

_W_ABC_DEFAULT = (0.60, 0.30, 0.10)  # Layer C is untrained — keep its influence minimal
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
                metadata    TEXT NOT NULL DEFAULT '{}',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_similar_runs_updated
                ON similar_runs(updated_at DESC);
        """)
        _ensure_column(conn, "similar_runs", "metadata", "TEXT NOT NULL DEFAULT '{}'")


def _ensure_column(
    conn: sqlite3.Connection,
    table_name: str,
    column_name: str,
    column_definition: str,
) -> None:
    columns = {
        str(row["name"])
        for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    if column_name in columns:
        return
    conn.execute(
        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
    )


def _save_run(
    db_path: Path,
    run_id: str,
    request: dict,
    candidates: list[dict],
    status: str,
    *,
    active_layers: dict[str, bool] | None = None,
    stage_counts: dict[str, int] | None = None,
    degraded_reason: str | None = None,
) -> dict:
    now = _utcnow()
    metadata = {
        "active_layers": active_layers or {},
        "stage_counts": stage_counts or {},
        "degraded_reason": degraded_reason,
    }
    _init_db(db_path)
    with _db_connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO similar_runs (run_id, request, candidates, status, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                candidates=excluded.candidates, status=excluded.status,
                metadata=excluded.metadata,
                updated_at=excluded.updated_at
            """,
            (run_id, _jdumps(request), _jdumps(candidates), status, _jdumps(metadata), now, now),
        )
    return {
        "run_id": run_id,
        "request": request,
        "candidates": candidates,
        "status": status,
        "updated_at": now,
        "active_layers": metadata["active_layers"],
        "stage_counts": metadata["stage_counts"],
        "degraded_reason": metadata["degraded_reason"],
    }


def _load_run(db_path: Path, run_id: str) -> dict | None:
    if not db_path.exists():
        return None
    with _db_connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM similar_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
    if row is None:
        return None
    metadata = _jloads(row["metadata"], {})
    return {
        "run_id": row["run_id"],
        "request": _jloads(row["request"], {}),
        "candidates": _jloads(row["candidates"], []),
        "status": row["status"],
        "updated_at": row["updated_at"],
        "active_layers": metadata.get("active_layers", {}) if isinstance(metadata, dict) else {},
        "stage_counts": metadata.get("stage_counts", {}) if isinstance(metadata, dict) else {},
        "degraded_reason": metadata.get("degraded_reason") if isinstance(metadata, dict) else None,
    }


# ── Layer A: feature signature similarity ─────────────────────────────────────


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
    """Weighted L1 distance between candidate and reference signal vectors."""
    return _weighted_l1_score(candidate_sig, reference_sig)


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
    corpus_db_path: Path | str | None = None,
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
        wa, wb, wc = w.get("layer_a", _W_ABC_DEFAULT[0]), w.get("layer_b", _W_ABC_DEFAULT[1]), w.get("layer_c", _W_ABC_DEFAULT[2])
        # Re-derive derived tuples from ledger weights
        ab_sum = wa + wb
        ac_sum = wa + wc
        _W_ABC = (wa, wb, wc)
        _W_AB  = (wa / ab_sum if ab_sum > 0 else 0.60, wb / ab_sum if ab_sum > 0 else 0.40)
        _W_AC  = (wa / ac_sum if ac_sum > 0 else 0.70, wc / ac_sum if ac_sum > 0 else 0.30)
    except Exception:
        pass  # keep defaults

    from search.corpus import SearchCorpusStore
    _corpus_store = SearchCorpusStore(corpus_db_path) if corpus_db_path is not None else SearchCorpusStore()
    windows = _corpus_store.list_windows(
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
    returned_candidates = candidates[:top_k]
    active_layers = {
        "layer_a": True,
        "layer_b": has_query_path,
        "layer_c": any(candidate.get("layer_c_score") is not None for candidate in candidates),
    }
    stage_counts = {
        "corpus_windows": len(windows),
        "ranked_candidates": len(candidates),
        "returned_candidates": len(returned_candidates),
    }
    degraded_reason = None if returned_candidates else "search_corpus_empty"
    run_id = uuid.uuid4().hex[:24]
    status = "live" if returned_candidates else "degraded"
    return _save_run(
        db_path,
        run_id=run_id,
        request={**request, "mode": "3layer"},
        candidates=returned_candidates,
        status=status,
        active_layers=active_layers,
        stage_counts=stage_counts,
        degraded_reason=degraded_reason,
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
