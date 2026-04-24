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

_W_ABC = (0.45, 0.30, 0.25)
_W_AB  = (0.60, 0.40)
_W_AC  = (0.70, 0.30)


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


# ── Layer A: feature signature similarity ─────────────────────────────────────

def _extract_reference_sig(pattern_draft: dict[str, Any]) -> dict[str, float]:
    """Pull numeric reference fields from PatternDraft.search_hints."""
    hints = pattern_draft.get("search_hints") or {}
    ref: dict[str, float] = {}

    # target_return_pct → close_return_pct
    trp = hints.get("target_return_pct")
    if trp is not None:
        try:
            ref["close_return_pct"] = float(trp)
        except (TypeError, ValueError):
            pass

    # volatility_range → realized_volatility_pct (midpoint of range, or scalar)
    vol = hints.get("volatility_range")
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

    # volume_breakout_threshold → volume_ratio
    vbt = hints.get("volume_breakout_threshold")
    if vbt is not None:
        try:
            ref["volume_ratio"] = float(vbt)
        except (TypeError, ValueError):
            pass

    return ref


def _layer_a(candidate_sig: dict[str, Any], reference_sig: dict[str, float]) -> float:
    keys = [
        k for k, v in reference_sig.items()
        if isinstance(v, (int, float)) and isinstance(candidate_sig.get(k), (int, float))
    ]
    if not keys:
        return 0.5  # neutral — no overlap to score
    dist = sum(abs(float(candidate_sig[k]) - float(reference_sig[k])) for k in keys) / len(keys)
    return 1.0 / (1.0 + dist)


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

    from search.corpus import SearchCorpusStore
    windows = SearchCorpusStore().list_windows(
        symbol=sym_filter,
        timeframe=timeframe,
        limit=min(top_k * 5, 200),
    )

    ref_sig = _extract_reference_sig(pattern_draft)
    has_query_path = bool(observed)

    candidates: list[dict[str, Any]] = []
    for w in windows:
        la = _layer_a(w.signature, ref_sig)

        # Layer B — phase path
        lb: float | None = None
        cand_path: list[str] = []
        if has_query_path:
            cand_path = _phase_path_for_symbol(w.symbol, pattern_slug, w.timeframe)
            lb = _layer_b(observed, cand_path)

        # Layer C — ML: prefer stored feature_snapshot in signature, then from transitions
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
