"""GET/POST /alpha/* — Alpha Universe observation API (W-0116).

Endpoints:
    GET  /alpha/world-model              — 37 symbols × phase + confidence + evidence
    GET  /alpha/token/{symbol}           — detailed token state
    GET  /alpha/token/{symbol}/history   — phase transition history
    GET  /alpha/anomalies                — anomaly queue
    POST /alpha/watch                    — register user watch
    POST /alpha/find                     — ad-hoc multi-condition token filter
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

log = logging.getLogger("engine.api.routes.alpha")

router = APIRouter()

ALPHA_PATTERN_SLUG = "alpha-presurge-v1"


# ── Request / Response Models ─────────────────────────────────────────────────

class _WatchBody(BaseModel):
    user_id: str
    symbol: str
    target_phase: str
    min_confidence: float = Field(default=0.70, ge=0.0, le=1.0)
    notify_channels: list[str] = Field(default_factory=lambda: ["cogochi"])
    expires_hours: int = Field(default=168, ge=1, le=720)  # max 30 days


class _FindCondition(BaseModel):
    block: str | None = None            # block name from _BLOCKS registry
    feature: str | None = None          # raw feature comparison
    op: str | None = None               # 'gte' | 'lte' | 'eq' | 'neg' | 'pos'
    value: float | None = None
    persist_bars: int | None = None     # minimum consecutive bars condition held


class _FindBody(BaseModel):
    conditions: list[_FindCondition]
    min_match: int = Field(default=1, ge=1)
    universe: str = "alpha"             # "alpha" | "all"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_state_store():
    from patterns.scanner import STATE_STORE
    return STATE_STORE


def _load_phase_summary(symbol: str, slug: str = ALPHA_PATTERN_SLUG) -> dict[str, Any]:
    """Return compact phase summary dict for one symbol."""
    store = _get_state_store()
    states = store.list_states(pattern_slug=slug)
    for s in states:
        if s.symbol == symbol:
            return {
                "symbol": s.symbol,
                "phase": s.current_phase,
                "bars_in_phase": s.bars_in_phase,
                "entered_at": s.entered_at.isoformat() if s.entered_at else None,
                "last_eval_at": s.last_eval_at.isoformat() if s.last_eval_at else None,
                "active": s.active,
                "invalidated": s.invalidated,
            }
    return {"symbol": symbol, "phase": "IDLE", "bars_in_phase": 0}


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/alpha/world-model")
async def get_alpha_world_model(grade: str | None = Query(None)) -> dict:
    """Return current phase state for all Alpha Universe symbols.

    Optionally filter by watchlist grade (A / B / all).
    """
    from data_cache.fetch_alpha_universe import get_watchlist_symbols, ALPHA_WATCHLIST

    if grade and grade.upper() in ("A", "B"):
        symbols = get_watchlist_symbols(grade_filter=grade.upper())
    else:
        symbols = get_watchlist_symbols()

    store = _get_state_store()
    states = {s.symbol: s for s in store.list_states(pattern_slug=ALPHA_PATTERN_SLUG)}

    phase_data = []
    for sym in symbols:
        meta = ALPHA_WATCHLIST.get(sym, {})
        state = states.get(sym)
        phase_data.append({
            "symbol": sym,
            "grade": meta.get("grade", "?"),
            "phase": state.current_phase if state else "IDLE",
            "bars_in_phase": state.bars_in_phase if state else 0,
            "entered_at": state.entered_at.isoformat() if (state and state.entered_at) else None,
            "active": state.active if state else False,
        })

    phase_counts: dict[str, int] = {}
    for item in phase_data:
        p = item["phase"]
        phase_counts[p] = phase_counts.get(p, 0) + 1

    return {
        "pattern_slug": ALPHA_PATTERN_SLUG,
        "n_symbols": len(symbols),
        "phases": phase_data,
        "phase_counts": phase_counts,
    }


@router.get("/alpha/token/{symbol}")
async def get_alpha_token_detail(symbol: str) -> dict:
    """Return detailed state for one Alpha Universe token."""
    symbol = symbol.upper()

    from data_cache.fetch_alpha_universe import ALPHA_WATCHLIST
    meta = ALPHA_WATCHLIST.get(symbol, {})
    if not meta:
        # Not in the watchlist — still show state if evaluated
        meta = {}

    store = _get_state_store()
    states = store.list_states(pattern_slug=ALPHA_PATTERN_SLUG)
    state = next((s for s in states if s.symbol == symbol), None)

    # Latest feature snapshot from transition history
    feature_snapshot = None
    recent_transitions = []
    try:
        transitions = store.list_transitions(
            symbol=symbol,
            pattern_slug=ALPHA_PATTERN_SLUG,
            limit=10,
        )
        recent_transitions = [
            {
                "from_phase": t.from_phase,
                "to_phase": t.to_phase,
                "occurred_at": t.occurred_at.isoformat() if hasattr(t, "occurred_at") else None,
                "confidence": getattr(t, "confidence", None),
            }
            for t in transitions
        ]
        if transitions and hasattr(transitions[0], "feature_snapshot_json"):
            import json as _json
            raw = transitions[0].feature_snapshot_json
            if raw:
                feature_snapshot = _json.loads(raw) if isinstance(raw, str) else raw
    except Exception as exc:
        log.debug("Failed to load transitions for %s: %s", symbol, exc)

    return {
        "symbol": symbol,
        "meta": meta,
        "state": {
            "phase": state.current_phase if state else "IDLE",
            "bars_in_phase": state.bars_in_phase if state else 0,
            "entered_at": state.entered_at.isoformat() if (state and state.entered_at) else None,
            "active": state.active if state else False,
            "invalidated": state.invalidated if state else False,
        },
        "recent_transitions": recent_transitions,
        "feature_snapshot": feature_snapshot,
    }


@router.get("/alpha/token/{symbol}/history")
async def get_alpha_token_history(
    symbol: str,
    since: str | None = Query(None),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    """Return phase transition history for one symbol."""
    symbol = symbol.upper()
    store = _get_state_store()
    try:
        transitions = store.list_transitions(
            symbol=symbol,
            pattern_slug=ALPHA_PATTERN_SLUG,
            limit=limit,
        )
    except AttributeError:
        transitions = []

    return {
        "symbol": symbol,
        "transitions": [
            {
                "transition_id": getattr(t, "transition_id", None),
                "from_phase": t.from_phase,
                "to_phase": t.to_phase,
                "occurred_at": getattr(t, "occurred_at", None),
                "confidence": getattr(t, "confidence", None),
            }
            for t in transitions
        ],
    }


@router.get("/alpha/anomalies")
async def get_alpha_anomalies(
    investigated: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    """Return anomaly queue. By default returns unreviewed anomalies."""
    import os
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not supabase_key:
        return {"anomalies": [], "note": "Supabase not configured — anomalies logged only"}

    import httpx
    url = f"{supabase_url}/rest/v1/alpha_anomalies"
    params = {
        "investigated": f"eq.{str(investigated).lower()}",
        "order": "observed_at.desc",
        "limit": str(limit),
    }
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    }
    try:
        resp = await asyncio.to_thread(
            lambda: httpx.get(url, params=params, headers=headers, timeout=10)
        )
        resp.raise_for_status()
        return {"anomalies": resp.json()}
    except Exception as exc:
        log.error("Failed to fetch anomalies: %s", exc)
        return {"anomalies": [], "error": str(exc)}


@router.post("/alpha/watch")
async def post_alpha_watch(body: _WatchBody) -> dict:
    """Register a user watch on a symbol/phase combination."""
    import json
    import os
    from datetime import datetime, timedelta, timezone

    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    expires_at = (
        datetime.now(tz=timezone.utc) + timedelta(hours=body.expires_hours)
    ).isoformat()

    row = {
        "user_id": body.user_id,
        "symbol": body.symbol.upper(),
        "target_phase": body.target_phase,
        "min_confidence": body.min_confidence,
        "notify_channels": body.notify_channels,
        "expires_at": expires_at,
    }

    import httpx
    url = f"{supabase_url}/rest/v1/alpha_user_watches"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    try:
        resp = await asyncio.to_thread(
            lambda: httpx.post(url, json=row, headers=headers, timeout=10)
        )
        resp.raise_for_status()
        return {"watch": resp.json()[0] if resp.json() else row}
    except Exception as exc:
        log.error("Failed to insert watch: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/alpha/find")
async def post_alpha_find(body: _FindBody) -> dict:
    """Ad-hoc multi-condition token filter across the Alpha Universe.

    Each condition can be:
      - block:  name of a block in _BLOCKS (fires True/False on latest bar)
      - feature: raw column + op + value comparison on the latest features row

    Returns symbols where at least min_match conditions are met.
    """
    from data_cache.fetch_alpha_universe import get_watchlist_symbols
    from data_cache.loader import load_klines, load_perp, load_dex_bundle, load_chain_bundle
    from exceptions import CacheMiss
    from scanner.feature_calc import compute_features_table, compute_snapshot
    from scoring.block_evaluator import _BLOCKS, evaluate_block_masks

    if body.universe == "alpha":
        symbols = get_watchlist_symbols()
    else:
        from universe.loader import load_universe
        symbols = load_universe("binance_dynamic")

    # Build a set of block names for fast lookup
    block_names = {name for name, _ in _BLOCKS}

    matches = []

    def _eval_feature_condition(cond: _FindCondition, features_df) -> bool:
        """Test a feature condition against the latest row."""
        if not features_df.empty and cond.feature in features_df.columns:
            val = float(features_df.iloc[-1][cond.feature])
            op = cond.op or "pos"
            cv = cond.value or 0.0
            if op == "gte":
                return val >= cv
            elif op == "lte":
                return val <= cv
            elif op == "eq":
                return abs(val - cv) < 1e-9
            elif op == "neg":
                return val < 0
            elif op == "pos":
                return val > 0
        return False

    for symbol in symbols:
        try:
            klines_df = load_klines(symbol, offline=True)
            if klines_df is None or klines_df.empty or len(klines_df) < 500:
                continue
        except CacheMiss:
            continue
        except Exception:
            continue

        try:
            perp_df = load_perp(symbol, offline=True)
        except Exception:
            perp_df = None

        dex_df = load_dex_bundle(symbol, offline=True)
        chain_df = load_chain_bundle(symbol, offline=True)

        try:
            features_df = compute_features_table(
                klines_df, symbol, perp=perp_df, dex=dex_df, chain=chain_df
            )
        except Exception:
            continue

        if features_df.empty:
            continue

        # Evaluate block masks for this symbol (only if block conditions requested)
        block_conditions = [c for c in body.conditions if c.block and c.block in block_names]
        masks: dict[str, bool] = {}
        if block_conditions:
            try:
                all_masks = evaluate_block_masks(features_df, klines_df, symbol)
                for c in block_conditions:
                    mask = all_masks.get(c.block)
                    if mask is not None and len(mask) > 0:
                        last_val = bool(mask.iloc[-1])
                        if c.persist_bars and c.persist_bars > 1:
                            last_val = last_val and bool(mask.tail(c.persist_bars).all())
                        masks[c.block] = last_val
                    else:
                        masks[c.block] = False
            except Exception:
                pass

        # Count how many conditions are satisfied
        n_match = 0
        evidence: dict[str, Any] = {}

        for cond in body.conditions:
            fired = False
            if cond.block and cond.block in block_names:
                fired = masks.get(cond.block, False)
                evidence[cond.block] = fired
            elif cond.feature:
                fired = _eval_feature_condition(cond, features_df)
                evidence[f"{cond.feature}_{cond.op}"] = fired
            if fired:
                n_match += 1

        if n_match >= body.min_match:
            matches.append({
                "symbol": symbol,
                "n_conditions_met": n_match,
                "evidence": evidence,
            })

    matches.sort(key=lambda x: -x["n_conditions_met"])
    return {
        "n_matches": len(matches),
        "conditions": [c.model_dump() for c in body.conditions],
        "matches": matches,
    }
