"""GET/POST /patterns/* — pattern engine API.

Heavy read paths and train/evaluate/promote run in worker threads via
`asyncio.to_thread` so the event loop stays responsive.

Mutations that touch the same ledger instance synchronously (verdict,
alert-policy PUT, register) stay on the async route without offloading.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from pydantic import BaseModel, ValidationError

from agents.llm_runtime import LLMRuntimeError, generate_llm_text
from api.routes import patterns_thread
from api.schemas_pattern_draft import PatternDraftBody

log = logging.getLogger("engine.api.routes.patterns")
from capture.store import CaptureStore
from research.capture_benchmark import (
    build_benchmark_pack_from_capture,
    build_and_run_benchmark_search_from_capture,
    pattern_benchmark_search_payload,
)
from research.pattern_search import BenchmarkPackStore, NegativeSearchMemoryStore, PatternSearchArtifactStore
from capture.types import CaptureRecord
from ledger.store import LEDGER_RECORD_STORE, LedgerStore, get_ledger_store
from verification import run_paper_verification
from ledger.types import PatternOutcome
from patterns.alert_policy import ALERT_POLICY_STORE, PatternAlertPolicy
from patterns.active_variant_registry import (
    ACTIVE_PATTERN_VARIANT_STORE,
    ACTIVE_VARIANT_REGISTRY_DIR,
    ActivePatternVariantEntry,
    derive_watch_phases_from_pattern,
)
from patterns.library import PATTERN_LIBRARY, get_pattern
from patterns.lifecycle_store import get_lifecycle_store
from patterns.registry import PATTERN_REGISTRY_STORE
from patterns.scanner import run_pattern_scan
from patterns.state_store import PatternStateStore
from patterns.types import PatternObject, PhaseCondition
from research.live_monitor import search_pattern_state_similarity
from scoring.block_evaluator import _BLOCKS
from api.schemas_pattern_draft import PatternDraftBody, PatternDraftPhaseBody
from api.schemas_search import PnLStatsPoint, PnLStatsResponse
from features.materialization_store import FeatureMaterializationStore

router = APIRouter()
_ledger = get_ledger_store()
_capture_store = CaptureStore()
_benchmark_pack_store = BenchmarkPackStore()
_pattern_search_artifact_store = PatternSearchArtifactStore()
_negative_search_memory_store = NegativeSearchMemoryStore()


def _lifecycle_default_status(slug: str) -> str:
    """Legacy library patterns are already production objects unless explicitly changed."""
    return "object" if slug in PATTERN_LIBRARY else "draft"


def _sync_lifecycle_runtime(slug: str, to_status: str) -> None:
    """Keep lifecycle status aligned with the live scanner registry."""
    if to_status == "candidate":
        if ACTIVE_PATTERN_VARIANT_STORE.get(slug) is not None:
            return
        try:
            pattern = get_pattern(slug)
        except KeyError:
            return
        ACTIVE_PATTERN_VARIANT_STORE.upsert(
            ActivePatternVariantEntry(
                pattern_slug=slug,
                variant_slug=f"{slug}__canonical",
                timeframe=pattern.timeframe,
                watch_phases=derive_watch_phases_from_pattern(pattern),
                source_kind="operator",
            )
        )
    elif to_status == "archived":
        variant_file = ACTIVE_VARIANT_REGISTRY_DIR / f"{slug}.json"
        if variant_file.exists():
            variant_file.unlink()


# ── Request models ───────────────────────────────────────────────────────────

class _VerdictBody(BaseModel):
    symbol: str
    verdict: str  # "valid" | "invalid" | "missed"


class _RegisterPatternBody(BaseModel):
    slug: str
    name: str
    description: str
    phases: list[dict]  # [{phase_id, label, required_blocks, ...}]
    entry_phase: str
    target_phase: str
    timeframe: str = "1h"
    tags: list[str] = []


class _PatternTrainBody(BaseModel):
    definition_id: str | None = None
    target_name: str = "breakout"
    feature_schema_version: int = 1
    label_policy_version: int = 1
    threshold_policy_version: int = 1
    min_records: int | None = None


class _PromotePatternModelBody(BaseModel):
    definition_id: str | None = None
    model_key: str
    model_version: str
    threshold_policy_version: int = 1


class _PatternAlertPolicyBody(BaseModel):
    mode: str


class _PatternStatusBody(BaseModel):
    status: str
    reason: str = ""


class _CaptureBody(BaseModel):
    symbol: str
    phase: str = ""
    timeframe: str = "1h"
    capture_kind: str = "pattern_candidate"
    candidate_transition_id: str | None = None
    scan_id: str | None = None
    user_note: str | None = None
    chart_context: dict = {}
    feature_snapshot: dict | None = None
    block_scores: dict = {}
    outcome_id: str | None = None
    verdict_id: str | None = None


class _BenchmarkPackDraftBody(BaseModel):
    capture_id: str
    max_holdouts: int = 4


class _BenchmarkSearchBody(BaseModel):
    capture_id: str
    max_holdouts: int = 4


class ParseRequest(BaseModel):
    text: str
    symbol: str | None = None


class RangeRequest(BaseModel):
    symbol: str          # e.g. "BTCUSDT"
    start_ts: int        # unix timestamp (seconds)
    end_ts: int          # unix timestamp (seconds)
    timeframe: str = "1h"


# ── AI Parser ────────────────────────────────────────────────────────────────

def _validate_draft(data: dict) -> PatternDraftBody:
    """Validate a dict as PatternDraftBody; raises ValueError on failure."""
    try:
        draft = PatternDraftBody.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"draft validation failed: {exc}") from exc
    if not draft.phases:
        raise ValueError("draft must have at least one phase (phase_sequence empty)")
    return draft


def _strip_json_wrappers(raw: str) -> str:
    """Strip common model wrappers around a JSON object."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.rsplit("```", 1)[0].strip()

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return text


async def _call_pattern_parser_llm(system_prompt: str, user_text: str) -> PatternDraftBody:
    """Call the configured LLM runtime and validate PatternDraftBody output.

    Retries up to 2 times on JSON parse or validation failure.
    """
    last_error: Exception | None = None

    for attempt in range(3):  # 1 initial + 2 retries
        try:
            raw = await generate_llm_text(
                system_prompt,
                user_text,
                max_tokens=4096,
                temperature=0.1,
            )
            parsed = json.loads(_strip_json_wrappers(raw))
            return _validate_draft(parsed)

        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            log.warning("parse attempt %d failed: %s", attempt + 1, exc)
            if attempt < 2:
                continue
        except LLMRuntimeError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    raise HTTPException(
        status_code=422,
        detail=f"Failed to parse pattern after 3 attempts. Last error: {last_error}",
    )


@router.post("/parse", response_model=PatternDraftBody)
async def parse_pattern_text(body: ParseRequest) -> PatternDraftBody:
    """Parse free-text trading memo → PatternDraftBody JSON via configured LLM.

    AC: POST {"text": "OI가 급등하면서 가격이 하락했다"} → PatternDraftBody JSON
    """
    from agents.context import get_assembler

    ctx = await asyncio.to_thread(get_assembler().for_parse_text, body.symbol)
    return await _call_pattern_parser_llm(ctx.system_prompt, body.text)


# ── 12-feature extraction from feature_window dict ───────────────────────────

def _extract_12_features(fw: dict[str, Any]) -> dict[str, Any | None]:
    """Map feature_window dict → 12 canonical draft features.

    Accepts dicts from either compute_feature_window() or _aggregate_feature_windows().
    Pre-derived boolean keys (_higher_lows, _lower_highs, etc.) take precedence
    when present; otherwise the same derivation logic applies.
    All values are allowed to be None (partial extraction OK per spec).
    """
    # oi_change: OI change rate
    oi_change: float | None = fw.get("oi_change_pct")

    # funding: latest funding rate
    funding: float | None = fw.get("funding_rate_last")

    # cvd: cumulative volume delta (change over window)
    cvd: float | None = fw.get("cvd_delta")

    # liq_volume: derived from liq_imbalance (signed imbalance of long/short liq)
    liq_volume: float | None = fw.get("liq_imbalance")

    # price: window return pct (price change %)
    price: float | None = fw.get("return_pct")

    # volume: volume zscore relative to window mean
    volume: float | None = fw.get("volume_zscore")

    # btc_corr: requires cross-symbol BTC data — not available in single-symbol window
    btc_corr: None = None

    # higher_lows: use pre-derived value if available, else derive
    if "_higher_lows" in fw:
        higher_lows: bool | None = fw["_higher_lows"]
    else:
        hl_count = fw.get("higher_low_count")
        higher_lows = bool(hl_count > 0) if hl_count is not None else None

    # lower_highs: use pre-derived value if available, else derive
    if "_lower_highs" in fw:
        lower_highs: bool | None = fw["_lower_highs"]
    else:
        trend_regime = fw.get("trend_regime")
        hh_count = fw.get("higher_high_count")
        lower_highs = None
        if trend_regime is not None and hh_count is not None:
            lower_highs = trend_regime == "downtrend" and hh_count == 0

    # compression: use pre-derived value if available, else derive
    if "_compression" in fw:
        compression: bool | None = fw["_compression"]
    else:
        compression_ratio = fw.get("compression_ratio")
        compression = bool(compression_ratio <= 1.0) if compression_ratio is not None else None

    # smart_money: use pre-derived value if available, else derive
    if "_smart_money" in fw:
        smart_money: bool | None = fw["_smart_money"]
    else:
        absorption = fw.get("absorption_flag")
        smart_money = bool(absorption) if absorption is not None else None

    # venue_div: requires cross-venue data — not available in single-symbol window
    venue_div: None = None

    return {
        "oi_change": oi_change,
        "funding": funding,
        "cvd": cvd,
        "liq_volume": liq_volume,
        "price": price,
        "volume": volume,
        "btc_corr": btc_corr,
        "higher_lows": higher_lows,
        "lower_highs": lower_highs,
        "compression": compression,
        "smart_money": smart_money,
        "venue_div": venue_div,
    }


def _query_feature_windows_range(
    symbol: str,
    start_ts: int,
    end_ts: int,
    timeframe: str = "1h",
) -> list[dict[str, Any]]:
    """Query feature_windows SQLite cache for rows in [start_ts, end_ts].

    Converts Unix timestamps to ISO strings for comparison with stored TEXT values.
    Returns rows ordered by window_end_ts ASC.
    """
    start_iso = datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat()
    end_iso = datetime.fromtimestamp(end_ts, tz=timezone.utc).isoformat()
    store = FeatureMaterializationStore()
    with store._connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM feature_windows
            WHERE symbol = ? AND timeframe = ?
              AND window_end_ts BETWEEN ? AND ?
            ORDER BY window_end_ts ASC
            """,
            (symbol, timeframe, start_iso, end_iso),
        ).fetchall()
    return [dict(row) for row in rows]


def _aggregate_feature_windows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate a list of feature_window rows into a single feature dict.

    Uses averages for continuous metrics, logical OR for flags, and picks the
    last available value for categorical fields. Missing columns are None.
    """
    if not rows:
        return {}

    def _avg(key: str) -> float | None:
        vals = [r.get(key) for r in rows if r.get(key) is not None]
        return sum(vals) / len(vals) if vals else None

    def _sum(key: str) -> float | None:
        vals = [r.get(key) for r in rows if r.get(key) is not None]
        return sum(vals) if vals else None

    def _any_flag(key: str) -> bool | None:
        vals = [r.get(key) for r in rows if r.get(key) is not None]
        return any(bool(v) for v in vals) if vals else None

    def _last(key: str) -> Any:
        for r in reversed(rows):
            val = r.get(key)
            if val is not None:
                return val
        return None

    # Derive higher_lows: any window has higher_low_count > 0
    hl_count = _avg("higher_low_count")
    higher_lows: bool | None = bool(hl_count > 0) if hl_count is not None else None

    # Derive lower_highs: last trend_regime == downtrend and avg higher_high_count == 0
    trend_regime = _last("trend_regime")
    hh_count = _avg("higher_high_count")
    lower_highs: bool | None = None
    if trend_regime is not None and hh_count is not None:
        lower_highs = trend_regime == "downtrend" and hh_count == 0

    compression_ratio = _avg("compression_ratio")
    compression: bool | None = bool(compression_ratio <= 1.0) if compression_ratio is not None else None

    absorption = _any_flag("absorption_flag")
    smart_money: bool | None = bool(absorption) if absorption is not None else None

    return {
        "oi_change_pct": _avg("oi_change_pct"),
        "funding_rate_last": _last("funding_rate_last"),
        "cvd_delta": _sum("cvd_delta"),
        "liq_imbalance": _avg("liq_imbalance"),
        "return_pct": _sum("return_pct"),
        "volume_zscore": _avg("volume_zscore"),
        "btc_corr": None,
        "higher_low_count": hl_count,
        "higher_high_count": hh_count,
        "compression_ratio": compression_ratio,
        "absorption_flag": int(absorption) if absorption is not None else None,
        "trend_regime": trend_regime,
        "volatility_regime": _last("volatility_regime"),
        # Pre-derived booleans for _extract_12_features
        "_higher_lows": higher_lows,
        "_lower_highs": lower_highs,
        "_compression": compression,
        "_smart_money": smart_money,
    }


# ── Library & States ─────────────────────────────────────────────────────────

@router.get("/library")
async def list_patterns() -> dict:
    """List all patterns in the library."""
    return await asyncio.to_thread(patterns_thread.list_patterns_sync)


@router.get("/registry")
async def get_pattern_registry() -> dict:
    """Return the JSON-backed pattern registry (versioned metadata per slug)."""
    def _sync():
        entries = PATTERN_REGISTRY_STORE.list_all()
        return {
            "ok": True,
            "count": len(entries),
            "entries": [e.to_dict() for e in entries],
        }
    return await asyncio.to_thread(_sync)


@router.get("/active-variants")
async def get_active_variants() -> dict:
    """Return the effective active pattern variants used by live runtime."""

    def _sync():
        entries = ACTIVE_PATTERN_VARIANT_STORE.list_effective()
        return {
            "ok": True,
            "count": len(entries),
            "entries": [entry.to_dict() for entry in entries],
        }

    return await asyncio.to_thread(_sync)


@router.get("/states")
async def get_all_states() -> dict:
    """Current phase (rich) for all tracked symbols across all patterns."""
    return await asyncio.to_thread(patterns_thread.get_all_states_sync)


@router.get("/transitions")
async def get_recent_transitions(
    limit: int = Query(default=20, ge=1, le=500),
    symbol: str | None = Query(default=None),
    slug: str | None = Query(default=None),
) -> dict:
    """Recent phase transitions, optionally filtered by symbol or pattern slug.

    B4: Feeds the transitions panel on /patterns and /patterns/[slug] detail pages.
    """
    def _sync() -> dict:
        store = PatternStateStore()
        records = store.list_transitions(slug)
        if symbol:
            sym_lower = symbol.upper()
            records = [r for r in records if r.symbol == sym_lower]
        records.sort(key=lambda r: r.transitioned_at, reverse=True)
        records = records[:limit]
        return {
            "transitions": [
                {
                    "transition_id": r.transition_id,
                    "symbol": r.symbol,
                    "pattern_slug": r.pattern_slug,
                    "from_phase": r.from_phase,
                    "to_phase": r.to_phase,
                    "transition_kind": r.transition_kind,
                    "reason": r.reason,
                    "transitioned_at": r.transitioned_at.isoformat() if r.transitioned_at else None,
                    "trigger_bar_ts": r.trigger_bar_ts.isoformat() if r.trigger_bar_ts else None,
                    "confidence": r.confidence,
                    "scan_id": r.scan_id,
                }
                for r in records
            ]
        }
    return await asyncio.to_thread(_sync)


@router.get("/candidates")
async def get_all_candidates() -> dict:
    """Entry candidates across all patterns."""
    return await asyncio.to_thread(patterns_thread.get_all_candidates_sync)


# ── Draft from range ─────────────────────────────────────────────────────────

@router.post("/draft-from-range")
async def draft_from_range(body: RangeRequest) -> PatternDraftBody:
    """Extract 12 features from a chart range and return a PatternDraftBody.

    Accepts (symbol, start_ts, end_ts) and computes features over that window.
    Features unavailable from a single-symbol window (btc_corr, venue_div)
    are returned as null — this is not an error per spec.
    """
    def _sync() -> PatternDraftBody:
        if body.end_ts <= body.start_ts:
            raise ValueError("end_ts must be greater than start_ts")
        if (body.end_ts - body.start_ts) > 604800:
            raise ValueError("range exceeds 7 days (604800 seconds)")

        rows = _query_feature_windows_range(
            body.symbol,
            body.start_ts,
            body.end_ts,
            body.timeframe,
        )
        if not rows:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No feature_windows data for {body.symbol} {body.timeframe} "
                    f"in range [{body.start_ts}, {body.end_ts}]"
                ),
            )

        fw = _aggregate_feature_windows(rows)
        features = _extract_12_features(fw)

        # Build phase description from extracted features
        signals_required: list[str] = []
        signals_preferred: list[str] = []
        if features.get("higher_lows"):
            signals_required.append("higher_lows")
        if features.get("compression"):
            signals_required.append("compression")
        if features.get("smart_money"):
            signals_preferred.append("absorption")

        phase = PatternDraftPhaseBody(
            phase_id="PHASE_0",
            label="Range",
            sequence_order=0,
            description=(
                f"Chart drag selection: {body.symbol} "
                f"from {body.start_ts} to {body.end_ts}"
            ),
            timeframe=body.timeframe,
            signals_required=signals_required,
            signals_preferred=signals_preferred,
        )

        trend = fw.get("trend_regime") or "unknown"
        vol_regime = fw.get("volatility_regime") or "unknown"

        thesis_parts: list[str] = []
        if features.get("price") is not None:
            direction = "up" if (features["price"] or 0.0) >= 0 else "down"
            thesis_parts.append(f"Price moved {direction} {abs(features['price'] or 0.0):.2%} over range")
        if features.get("higher_lows"):
            thesis_parts.append("Higher lows detected — bullish structure")
        if features.get("lower_highs"):
            thesis_parts.append("Lower highs detected — bearish structure")
        if features.get("compression"):
            thesis_parts.append("Volatility compression detected")
        if not thesis_parts:
            thesis_parts.append(f"Trend: {trend}, volatility: {vol_regime}")

        return PatternDraftBody(
            schema_version=1,
            pattern_family="chart_drag",
            pattern_label=f"{body.symbol} range selection",
            source_type="chart_drag",
            source_text=(
                f"Chart drag: {body.symbol} {body.timeframe} "
                f"[{body.start_ts}, {body.end_ts}]"
            ),
            symbol_candidates=[body.symbol],
            timeframe=body.timeframe,
            thesis=thesis_parts,
            phases=[phase],
            trade_plan={"features": features},
            confidence=None,
            ambiguities=[
                k for k, v in features.items() if v is None
            ],
        )

    try:
        return await asyncio.to_thread(_sync)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Scan ─────────────────────────────────────────────────────────────────────

@router.post("/scan")
async def trigger_pattern_scan(background_tasks: BackgroundTasks) -> dict:
    """Trigger a pattern scan cycle in background."""
    background_tasks.add_task(run_pattern_scan)
    return {"status": "scan_started", "patterns": list(PATTERN_LIBRARY.keys())}


# ── Bulk read (static paths before parameterised routes) ────────────────────

@router.get("/stats/all")
async def get_all_stats(
    definition_scope: str = Query(default="current_definition"),
) -> dict:
    """Bulk ledger stats for all patterns — avoids N+1 fan-out from callers."""
    return await asyncio.to_thread(
        patterns_thread.get_all_stats_sync,
        _ledger,
        definition_scope=definition_scope,
    )


@router.get("/lifecycle")
async def get_lifecycle_statuses() -> dict:
    """Return lifecycle status for all known PatternObjects.

    File-backed lifecycle records are sparse. Existing library patterns are
    production objects by default; explicit draft/candidate/archive records
    override that default.
    """
    store = get_lifecycle_store()
    explicit_by_slug = {entry["slug"]: entry for entry in store.get_all()}

    entries: list[dict[str, Any]] = []
    for slug, pattern in sorted(PATTERN_LIBRARY.items()):
        explicit = explicit_by_slug.get(slug)
        status = explicit["status"] if explicit else _lifecycle_default_status(slug)
        entries.append({
            "slug": slug,
            "name": pattern.name,
            "status": status,
            "updated_at": explicit["updated_at"] if explicit else None,
            "updated_by": explicit["updated_by"] if explicit else None,
            "reason": explicit["reason"] if explicit else "",
            "timeframe": pattern.timeframe,
            "tags": list(pattern.tags),
        })

    return {"ok": True, "count": len(entries), "entries": entries}


# ── Per-pattern endpoints ────────────────────────────────────────────────────

@router.get("/{slug}/candidates")
async def get_candidates(slug: str) -> dict:
    """Entry candidates for a specific pattern."""
    return await asyncio.to_thread(patterns_thread.get_candidates_sync, slug)


@router.get("/{slug}/similar-live")
async def get_similar_live(
    slug: str,
    variant_slug: str | None = Query(default=None),
    timeframe: str | None = Query(default=None),
    top_k: int = Query(default=20, ge=1, le=100),
    min_similarity_score: float = Query(default=0.2, ge=0.0, le=1.0),
    window_bars: int = Query(default=120, ge=24, le=720),
    staleness_hours: int = Query(default=48, ge=1, le=168),
    warmup_bars: int = Query(default=240, ge=24, le=2000),
) -> dict:
    """Return current symbols ranked by pattern-state similarity for one family."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None

    def _sync() -> dict:
        results = search_pattern_state_similarity(
            slug,
            variant_slug=variant_slug,
            timeframe=timeframe,
            top_k=top_k,
            min_similarity_score=min_similarity_score,
            window_bars=window_bars,
            staleness_hours=staleness_hours,
            warmup_bars=warmup_bars,
        )
        active_entry = ACTIVE_PATTERN_VARIANT_STORE.get(slug)
        resolved_variant_slug = (
            results[0].variant_slug
            if results
            else variant_slug
            or (active_entry.variant_slug if active_entry is not None else f"{slug}__canonical")
        )
        resolved_timeframe = (
            results[0].timeframe
            if results
            else timeframe
            or (active_entry.timeframe if active_entry is not None else get_pattern(slug).timeframe)
        )
        return {
            "ok": True,
            "pattern_slug": slug,
            "variant_slug": resolved_variant_slug,
            "timeframe": resolved_timeframe,
            "count": len(results),
            "top_k": top_k,
            "min_similarity_score": min_similarity_score,
            "results": [result.to_dict() for result in results],
        }

    return await asyncio.to_thread(_sync)


@router.get("/{slug}/f60-status")
async def get_f60_gate_status(slug: str) -> dict:
    """F-60 multi-period acceptance gate (L-3, R-05).

    Returns:
        passed: bool — gate 통과 여부 (median≥0.55 AND floor≥0.40 AND count≥200)
        verdict_count: int — 누적 verdict 수 (all 5 cats included)
        remaining_to_threshold: int — 200까지 남은 수
        median_accuracy / floor_accuracy: float — W1/W2/W3 통계
        window_accuracies / window_counts: list — 30d 윈도우 3개 분포
        reason: "insufficient_data" | "insufficient_windows" | "failed_threshold" | "passed"

    근거: Ryan Li 16-seed validation + Kropiunig $32 variance on identical code.
    Single-period accuracy 0.60이 multi-period 0.45보다 나쁠 수 있음 → median+floor.
    """
    from stats.engine import get_stats_engine
    return await asyncio.to_thread(
        lambda: get_stats_engine().as_gate_dict(slug)
    )


@router.get("/{slug}/stats")
async def get_stats(
    slug: str,
    definition_id: str | None = None,
    definition_scope: str = Query(default="current_definition"),
) -> dict:
    """Ledger statistics for a pattern. v3: includes ML shadow readiness."""
    return await asyncio.to_thread(
        patterns_thread.get_stats_sync,
        slug,
        _ledger,
        definition_id=definition_id,
        definition_scope=definition_scope,
    )


@router.get("/{slug}/pnl-stats", response_model=PnLStatsResponse)
async def get_pnl_stats(slug: str) -> PnLStatsResponse:
    """W-0365: Realized P&L statistics for a pattern slug.

    Queries ledger_outcomes for pnl_bps_net + pnl_verdict.
    Returns preliminary=True if N < 30.
    """
    import numpy as np

    _empty = PnLStatsResponse(
        pattern_slug=slug, n=0,
        mean_pnl_bps=None, std_pnl_bps=None, sharpe_like=None,
        win_rate=None, loss_rate=None, indeterminate_rate=None,
        ci_low=None, ci_high=None, preliminary=True,
        btc_hold_return_pct=None, equity_curve=[],
    )

    try:
        from supabase import create_client
        c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        resp = (
            c.table("ledger_outcomes")
            .select("pnl_bps_net, pnl_verdict, created_at")
            .eq("pattern_slug", slug)
            .not_.is_("pnl_bps_net", "null")
            .order("created_at")
            .execute()
        )
        rows = resp.data
    except Exception:
        rows = []

    if not rows:
        return _empty

    pnl_arr = np.array([r["pnl_bps_net"] for r in rows], dtype=float)
    verdicts = [r["pnl_verdict"] for r in rows]
    n = len(pnl_arr)

    mean_v = float(np.mean(pnl_arr))
    std_v = float(np.std(pnl_arr, ddof=1)) if n > 1 else 0.0
    sharpe = mean_v / std_v if std_v > 0 else None

    win_rate = verdicts.count("WIN") / n
    loss_rate = verdicts.count("LOSS") / n
    ind_rate = verdicts.count("INDETERMINATE") / n

    ci_low = ci_high = None
    if n >= 30:
        se = std_v / (n ** 0.5)
        ci_low = mean_v - 1.96 * se
        ci_high = mean_v + 1.96 * se

    cum = 0.0
    equity_curve: list[PnLStatsPoint] = []
    for r in rows:
        cum += r["pnl_bps_net"]
        equity_curve.append(PnLStatsPoint(ts=str(r["created_at"]), cumulative_pnl_bps=cum))

    return PnLStatsResponse(
        pattern_slug=slug, n=n,
        mean_pnl_bps=mean_v, std_pnl_bps=std_v, sharpe_like=sharpe,
        win_rate=win_rate, loss_rate=loss_rate, indeterminate_rate=ind_rate,
        ci_low=ci_low, ci_high=ci_high,
        preliminary=(n < 30),
        btc_hold_return_pct=None,
        equity_curve=equity_curve,
    )


@router.get("/{slug}/training-records")
async def get_training_records(
    slug: str,
    limit: int = Query(default=25, ge=1, le=200),
    definition_id: str | None = None,
) -> dict:
    """Preview canonical training rows derived from the ledger."""
    return await asyncio.to_thread(
        patterns_thread.get_training_records_sync,
        slug,
        limit,
        _ledger,
        definition_id=definition_id,
    )


@router.get("/{slug}/alert-policy")
async def get_alert_policy(slug: str) -> dict:
    """Return current alert policy for a pattern."""
    return await asyncio.to_thread(patterns_thread.get_alert_policy_sync, slug)


@router.put("/{slug}/alert-policy")
async def set_alert_policy(slug: str, body: _PatternAlertPolicyBody) -> dict:
    """Update current alert policy for a pattern."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None
    if body.mode not in {"shadow", "visible", "gated"}:
        raise HTTPException(status_code=400, detail="mode must be one of shadow|visible|gated")
    policy = PatternAlertPolicy(pattern_slug=slug, mode=body.mode)  # type: ignore[arg-type]
    ALERT_POLICY_STORE.save(policy)
    return {
        "ok": True,
        "pattern_slug": slug,
        "policy": policy.to_dict(),
    }


@router.get("/{slug}/lifecycle-status")
async def get_lifecycle_status(slug: str) -> dict:
    """Return current lifecycle status for a pattern (draft/candidate/object/archived)."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None
    store = get_lifecycle_store()
    status = store.get_status(slug, default=_lifecycle_default_status(slug))
    return {"ok": True, "slug": slug, "status": status}


@router.patch("/{slug}/status")
async def patch_pattern_status(slug: str, body: _PatternStatusBody, request: Request) -> dict:
    """Transition pattern lifecycle status.

    Allowed: draft→candidate|archived, candidate→object|archived, object→archived.
    Returns { ok, slug, from_status, to_status, updated_at }.
    Raises 422 on invalid transition, 404 if pattern not in library.
    """
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None

    user_id = request.headers.get("x-user-id", "system")
    store = get_lifecycle_store()
    try:
        result = store.transition(
            slug=slug,
            to_status=body.status,
            user_id=user_id,
            reason=body.reason,
            default_from_status=_lifecycle_default_status(slug),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    _sync_lifecycle_runtime(slug, result["to_status"])

    log.info(
        "lifecycle transition: slug=%s %s→%s by=%s reason=%r",
        slug, result["from_status"], result["to_status"], user_id, body.reason,
    )
    return {"ok": True, **result}


@router.get("/{slug}/model-registry")
async def get_model_registry(slug: str, definition_id: str | None = None) -> dict:
    """Return the current registry snapshot for a pattern."""
    return await asyncio.to_thread(
        patterns_thread.get_model_registry_sync,
        slug,
        definition_id=definition_id,
    )


@router.get("/{slug}/model-history")
async def get_model_history(
    slug: str,
    limit: int = Query(default=25, ge=1, le=200),
    definition_id: str | None = None,
    record_type: str | None = None,
) -> dict:
    """Return training/model ledger history for a pattern."""
    return await asyncio.to_thread(
        patterns_thread.get_model_history_sync,
        slug,
        limit=limit,
        definition_id=definition_id,
        record_type=record_type,
    )


@router.get("/{slug}/library")
async def get_pattern_def(slug: str) -> dict:
    """Return the pattern definition."""
    return await asyncio.to_thread(patterns_thread.get_pattern_def_sync, slug)


# ── Verdict & Evaluation ────────────────────────────────────────────────────

@router.post("/{slug}/verdict")
async def set_user_verdict(slug: str, body: _VerdictBody) -> dict:
    """Set user_verdict on the most recent outcome for (slug, symbol)."""
    try:
        pattern = get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None

    pending = _ledger.list_pending(slug)
    matching = [o for o in pending if o.symbol == body.symbol]

    if not matching:
        all_outcomes = _ledger.list_all(slug)
        matching = [o for o in all_outcomes if o.symbol == body.symbol]

    if not matching:
        new_outcome = PatternOutcome(
            pattern_slug=slug,
            pattern_version=pattern.version,
            definition_ref=patterns_thread._resolve_definition_ref(slug),
            symbol=body.symbol,
            user_verdict=body.verdict,  # type: ignore[arg-type]
        )
        _ledger.save(new_outcome)
        LEDGER_RECORD_STORE.append_verdict_record(new_outcome)
        return {"ok": True, "created": True, "outcome_id": new_outcome.id}

    outcome = matching[0]
    if outcome.definition_id is None and outcome.definition_ref is None:
        outcome.pattern_version = outcome.pattern_version or pattern.version
        outcome.definition_ref = patterns_thread._resolve_definition_ref(slug)
    outcome.user_verdict = body.verdict  # type: ignore[assignment]
    _ledger.save(outcome)
    LEDGER_RECORD_STORE.append_verdict_record(outcome)
    return {"ok": True, "outcome_id": outcome.id}


# ── Capture Plane ────────────────────────────────────────────────────────────

@router.post("/{slug}/capture")
async def record_capture(request: Request, slug: str, body: _CaptureBody) -> dict:
    """Record a Save Setup capture event into the ledger capture plane.

    Links the capture to a durable phase transition via candidate_transition_id
    so the full chain capture_id → transition_id → outcome_id → verdict is traceable.
    """
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        pattern = get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None

    capture = CaptureRecord(
        capture_kind=body.capture_kind,  # type: ignore[arg-type]
        user_id=user_id,
        symbol=body.symbol,
        pattern_slug=slug,
        pattern_version=pattern.version,
        definition_ref=patterns_thread._resolve_definition_ref(slug),
        phase=body.phase,
        timeframe=body.timeframe,
        candidate_transition_id=body.candidate_transition_id,
        scan_id=body.scan_id,
        user_note=body.user_note,
        chart_context=body.chart_context,
        feature_snapshot=body.feature_snapshot,
        block_scores=body.block_scores,
        outcome_id=body.outcome_id,
        verdict_id=body.verdict_id,
    )
    LEDGER_RECORD_STORE.append_capture_record(capture)
    return {
        "ok": True,
        "capture_id": capture.capture_id,
        "pattern_slug": slug,
        "symbol": body.symbol,
        "status": capture.status,
    }


@router.post("/{slug}/evaluate")
async def auto_evaluate(slug: str) -> dict:
    """v2: Auto-evaluate pending outcomes past their evaluation window."""
    return await asyncio.to_thread(patterns_thread.auto_evaluate_sync, slug, _ledger)


@router.post("/{slug}/train-model")
async def train_pattern_model(request: Request, slug: str, body: _PatternTrainBody) -> dict:
    """Train a pattern-scoped model from durable ledger outcomes."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        body_dict = body.model_dump()
        body_dict["user_id"] = user_id
        return await asyncio.to_thread(
            patterns_thread.train_pattern_model_sync,
            slug,
            body_dict,
            _ledger,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{slug}/promote-model")
async def promote_pattern_model(slug: str, body: _PromotePatternModelBody) -> dict:
    """Promote a candidate model to active rollout state."""
    return await asyncio.to_thread(
        patterns_thread.promote_pattern_model_sync,
        slug,
        body.definition_id,
        body.model_key,
        body.model_version,
        body.threshold_policy_version,
    )


# ── v2: Pattern Registration ────────────────────────────────────────────────

@router.post("/register")
async def register_pattern(body: _RegisterPatternBody) -> dict:
    """Register a user-defined pattern into the library."""
    known_blocks = {name for name, _ in _BLOCKS}

    phases = []
    for i, ph in enumerate(body.phases):
        required = ph.get("required_blocks", [])
        optional = ph.get("optional_blocks", [])
        disqualifiers = ph.get("disqualifier_blocks", [])

        all_refs = required + optional + disqualifiers
        unknown = [b for b in all_refs if b not in known_blocks]
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Phase {i}: unknown blocks: {unknown}. Available: {sorted(known_blocks)}",
            )

        phases.append(
            PhaseCondition(
                phase_id=ph.get("phase_id", f"PHASE_{i}"),
                label=ph.get("label", f"Phase {i}"),
                required_blocks=required,
                optional_blocks=optional,
                disqualifier_blocks=disqualifiers,
                min_bars=ph.get("min_bars", 1),
                max_bars=ph.get("max_bars", 48),
                timeframe=ph.get("timeframe", body.timeframe),
            )
        )

    phase_ids = {p.phase_id for p in phases}
    if body.entry_phase not in phase_ids:
        raise HTTPException(400, f"entry_phase '{body.entry_phase}' not in phases: {phase_ids}")
    if body.target_phase not in phase_ids:
        raise HTTPException(400, f"target_phase '{body.target_phase}' not in phases: {phase_ids}")

    if body.slug in PATTERN_LIBRARY:
        raise HTTPException(409, f"Pattern '{body.slug}' already exists")

    pattern = PatternObject(
        slug=body.slug,
        name=body.name,
        description=body.description,
        phases=phases,
        entry_phase=body.entry_phase,
        target_phase=body.target_phase,
        timeframe=body.timeframe,
        tags=body.tags,
        created_by="user",
    )

    PATTERN_LIBRARY[body.slug] = pattern
    return {"ok": True, "slug": body.slug, "n_phases": len(phases)}


# ── Benchmark pack and search endpoints ──────────────────────────────────────

@router.post("/{slug}/benchmark-pack-draft")
async def create_benchmark_pack_draft(slug: str, body: _BenchmarkPackDraftBody) -> dict:
    """Build a benchmark pack from a capture and save it."""
    draft = await asyncio.to_thread(
        build_benchmark_pack_from_capture,
        capture_id=body.capture_id,
        pattern_slug=slug,
        max_holdouts=body.max_holdouts,
        capture_store=_capture_store,
        pack_store=_benchmark_pack_store,
    )
    return {
        "ok": True,
        "source_capture_id": draft.source_capture_id,
        "pack": draft.pack.to_dict(),
    }


@router.post("/{slug}/benchmark-search-from-capture")
async def run_benchmark_search_from_capture(slug: str, body: _BenchmarkSearchBody) -> dict:
    """Build benchmark pack and run a full benchmark search from a capture."""
    result = await asyncio.to_thread(
        build_and_run_benchmark_search_from_capture,
        capture_id=body.capture_id,
        capture_store=_capture_store,
        pack_store=_benchmark_pack_store,
        artifact_store=_pattern_search_artifact_store,
        negative_memory_store=_negative_search_memory_store,
    )
    return {
        "ok": True,
        **result.to_dict(),
    }


# ---------------------------------------------------------------------------
# W-0350: Pattern Object Store endpoints
# ---------------------------------------------------------------------------

class PatternObjectResponse(BaseModel):
    slug: str
    name: str
    description: str
    direction: str
    timeframe: str
    version: int
    entry_phase: str
    target_phase: str
    phase_ids: list[str]
    tags: list[str]
    universe_scope: str


@router.get("/objects", response_model=list[PatternObjectResponse])
async def list_pattern_objects(
    phase: str | None = None,
    tag: str | None = None,
    limit: int = 50,
) -> list[PatternObjectResponse]:
    """List all seeded PatternObjects from Supabase.

    ?phase=FAKE_DUMP  — filter by phase_id
    ?tag=oi_reversal  — filter by tag
    """
    from patterns.store import PatternStore
    rows = await asyncio.to_thread(PatternStore().list, phase, tag, limit)
    return [PatternObjectResponse(**r) for r in rows]


@router.get("/objects/{slug}", response_model=PatternObjectResponse)
async def get_pattern_object(slug: str) -> PatternObjectResponse:
    """Get one PatternObject by slug."""
    from patterns.store import PatternStore
    row = await asyncio.to_thread(PatternStore().get, slug)
    if row is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Pattern {slug!r} not found")
    return PatternObjectResponse(**row)


@router.post("/{slug}/verify-paper")
async def verify_paper(slug: str) -> dict:
    """Run paper-trading verification for a pattern using recorded outcome ledger."""
    result = await asyncio.to_thread(run_paper_verification, slug, LEDGER_RECORD_STORE)
    return {
        "ok": True,
        "pattern_slug": result.pattern_slug,
        "n_trades": result.n_trades,
        "n_hit": result.n_hit,
        "n_miss": result.n_miss,
        "n_expired": result.n_expired,
        "win_rate": result.win_rate,
        "avg_return_pct": result.avg_return_pct,
        "sharpe": None if result.sharpe != result.sharpe else result.sharpe,
        "max_drawdown_pct": result.max_drawdown_pct,
        "expectancy_pct": result.expectancy_pct,
        "avg_duration_hours": result.avg_duration_hours,
        "pass_gate": result.pass_gate,
        "gate_reasons": result.gate_reasons,
    }
