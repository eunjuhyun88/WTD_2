"""W-0393: TradingView Import API routes.

POST /tv-import/preview    — URL → draft (parse + compile + estimate)
POST /tv-import/estimate   — re-estimate with different strictness
POST /tv-import/commit     — commit to scanner + idea_twin_links
GET  /tv-import/author/{username}
GET  /tv-import/twin/{import_id}
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

log = logging.getLogger("engine.api.tv_import")
router = APIRouter()

# In-process draft store — TTL 1h (production: Redis or Supabase)
_DRAFTS: dict[str, dict] = {}
_DRAFT_TTL = timedelta(hours=1)


def _prune_drafts() -> None:
    now = datetime.now(timezone.utc)
    stale = [k for k, v in _DRAFTS.items() if now - v.get("_created_at", now) > _DRAFT_TTL]
    for k in stale:
        del _DRAFTS[k]


class PreviewRequest(BaseModel):
    url: str


class EstimateRequest(BaseModel):
    draft_id: str
    strictness: str = "base"


class CommitRequest(BaseModel):
    draft_id: str
    selected_strictness: str = "base"
    symbol: str | None = None
    timeframe: str | None = None
    direction: str | None = None


def _spec_to_dict(spec: Any) -> dict:
    """Convert a dataclass to plain dict for JSON."""
    from dataclasses import asdict
    try:
        return asdict(spec)
    except Exception:
        return {}


@router.post("/preview")
async def preview(req: PreviewRequest) -> dict:
    """Fetch TV URL → cascade parse → compile → estimate."""
    _prune_drafts()

    try:
        from integrations.tradingview.pipeline import process_url
        draft = process_url(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error("preview error: %s", e)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")

    draft_id = draft.draft_id

    # Serialize vision_spec
    vs = draft.vision_spec
    vision_spec_dict = {
        "direction": vs.direction if vs else None,
        "pattern_family": vs.pattern_family if vs else "unknown",
        "visible_atoms": [
            {"kind": a.kind, "confidence": a.confidence, "source": a.source}
            for a in (vs.visible_atoms if vs else [])
        ],
        "confidence": vs.confidence if vs else 0.0,
        "parser_tier": vs.parser_tier if vs else "vision",
    } if vs else {}

    # Serialize compiler_spec
    cs = draft.compiler_spec
    compiler_spec_dict = {
        "base_pattern_slug": cs.base_pattern_slug if cs else "",
        "direction": cs.direction if cs else "long",
        "timeframe": cs.timeframe if cs else "4h",
        "trigger_block": cs.trigger_block if cs else "",
        "confirmation_blocks": cs.confirmation_blocks if cs else [],
        "indicator_filters": cs.indicator_filters if cs else [],
        "unsupported_atoms": cs.unsupported_atoms if cs else [],
        "compiler_confidence": cs.compiler_confidence if cs else 0.0,
        "strictness_variants": cs.strictness_variants if cs else {},
    } if cs else {}

    # Serialize diagnostics
    d = draft.diagnostics
    diagnostics_dict = {
        "estimated_signal_count": d.estimated_signal_count if d else 0,
        "filter_dropoff": d.filter_dropoff if d else [],
        "min_sample_pass": d.min_sample_pass if d else False,
        "warnings": d.warnings if d else [],
        "suggested_relaxations": d.suggested_relaxations if d else [],
        "selection_bias": d.selection_bias if d else 0.7,
    } if d else {}

    payload = {
        "draft_id": draft_id,
        "source_url": draft.source_url,
        "chart_id": draft.chart_id,
        "source_type": draft.source_type,
        "parser_tier": draft.parser_tier,
        "symbol": draft.symbol,
        "exchange": draft.exchange,
        "timeframe_raw": draft.timeframe_raw,
        "timeframe_engine": draft.timeframe_engine,
        "title": draft.title,
        "description": (draft.description or "")[:500] if draft.description else None,
        "author_username": draft.author_username,
        "author_display_name": draft.author_display_name,
        "snapshot_url": draft.snapshot_url,
        "vision_spec": vision_spec_dict,
        "compiler_spec": compiler_spec_dict,
        "diagnostics": diagnostics_dict,
    }
    _DRAFTS[draft_id] = {**payload, "_created_at": datetime.now(timezone.utc)}
    return payload


@router.post("/estimate")
async def estimate(req: EstimateRequest) -> dict:
    """Re-run estimate for a draft with a different strictness."""
    draft = _DRAFTS.get(req.draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found or expired")

    from integrations.tradingview.estimate import estimate_variant, MIN_SAMPLE
    from integrations.tradingview.models import CompiledHypothesisSpec

    cs_data = draft.get("compiler_spec", {})
    cspec = CompiledHypothesisSpec(
        base_pattern_slug=cs_data.get("base_pattern_slug", ""),
        variant_slug="",
        direction=cs_data.get("direction", "long"),
        timeframe=cs_data.get("timeframe", "4h"),
        trigger_block=cs_data.get("trigger_block", ""),
        confirmation_blocks=cs_data.get("confirmation_blocks", []),
        indicator_filters=cs_data.get("indicator_filters", []),
        unsupported_atoms=cs_data.get("unsupported_atoms", []),
        compiler_confidence=cs_data.get("compiler_confidence", 0.0),
        strictness_variants=cs_data.get("strictness_variants", {}),
    )

    diag = estimate_variant(cspec, req.strictness)
    return {
        "strictness": req.strictness,
        "estimated_signal_count": diag.estimated_signal_count,
        "min_sample_pass": diag.min_sample_pass,
        "filter_dropoff": diag.filter_dropoff,
        "warnings": diag.warnings,
        "suggested_relaxations": diag.suggested_relaxations,
    }


@router.post("/commit")
async def commit(req: CommitRequest) -> dict:
    """Commit draft → user_pattern_combos + idea_twin_links."""
    draft = _DRAFTS.get(req.draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found or expired")

    from integrations.tradingview.estimate import estimate_variant, MIN_SAMPLE
    from integrations.tradingview.models import CompiledHypothesisSpec
    from integrations.tradingview.idea_twin_store import create_twin_link, IdeaTwinLink
    from integrations.tradingview.author_reputation import refresh_matview

    cs_data = draft.get("compiler_spec", {})
    variants = cs_data.get("strictness_variants", {})
    selected = variants.get(req.selected_strictness) or variants.get("base") or {}
    filters = selected.get("indicator_filters", [])

    cspec = CompiledHypothesisSpec(
        base_pattern_slug=cs_data.get("base_pattern_slug", ""),
        variant_slug="",
        direction=req.direction or cs_data.get("direction", "long"),
        timeframe=req.timeframe or cs_data.get("timeframe", "4h"),
        trigger_block=cs_data.get("trigger_block", ""),
        confirmation_blocks=cs_data.get("confirmation_blocks", []),
        indicator_filters=filters,
        unsupported_atoms=cs_data.get("unsupported_atoms", []),
        compiler_confidence=cs_data.get("compiler_confidence", 0.0),
        strictness_variants=cs_data.get("strictness_variants", {}),
    )
    diag = estimate_variant(cspec, req.selected_strictness)

    if not diag.min_sample_pass and req.selected_strictness != "loose":
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient signals (~{diag.estimated_signal_count} < {MIN_SAMPLE}). "
                   f"Try 'loose' strictness.",
        )

    import_id = str(uuid.uuid4())
    combo_id = str(uuid.uuid4())
    variant_id = str(uuid.uuid4())

    try:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

        # 1. tv_imports
        sb.table("tv_imports").insert({
            "id": import_id,
            "source_url": draft["source_url"],
            "source_type": draft["source_type"],
            "parser_tier": draft["parser_tier"],
            "chart_id": draft["chart_id"],
            "snapshot_url": draft.get("snapshot_url"),
            "symbol": req.symbol or draft.get("symbol"),
            "exchange": draft.get("exchange"),
            "timeframe_raw": draft.get("timeframe_raw"),
            "timeframe_engine": req.timeframe or draft.get("timeframe_engine"),
            "title": draft.get("title"),
            "description": draft.get("description"),
            "author_username": draft.get("author_username"),
            "author_display_name": draft.get("author_display_name"),
            "vision_spec": draft.get("vision_spec", {}),
            "compiler_spec": cs_data,
            "diagnostics": draft.get("diagnostics", {}),
            "status": "committed",
        }).execute()

        # 2. user_pattern_combos
        sb.table("user_pattern_combos").insert({
            "id": combo_id,
            "import_id": import_id,
            "variant_id": variant_id,
            "source_url": draft["source_url"],
            "chart_id": draft["chart_id"],
            "snapshot_url": draft.get("snapshot_url"),
            "symbol": req.symbol or draft.get("symbol"),
            "timeframe": req.timeframe or cspec.timeframe,
            "direction": req.direction or cspec.direction,
            "pattern_family": cspec.base_pattern_slug,
            "trigger_block": cspec.trigger_block,
            "confirmation_blocks": cspec.confirmation_blocks,
            "indicator_filters": filters,
            "search_origin": "tv_import",
            "strictness": req.selected_strictness,
            "diagnostics": {
                "estimated_signal_count": diag.estimated_signal_count,
                "warnings": diag.warnings,
            },
            "status": "active",
        }).execute()

        # 3. idea_twin_links (moat)
        create_twin_link(IdeaTwinLink(
            import_id=import_id,
            combo_id=combo_id,
            author_username=draft.get("author_username") or "unknown",
            author_display_name=draft.get("author_display_name"),
        ))

        # 4. Refresh author_reputation matview (best-effort)
        refresh_matview()

    except HTTPException:
        raise
    except Exception as e:
        log.error("commit DB write failed: %s", e)
        raise HTTPException(status_code=500, detail=f"DB commit failed: {e}")

    _DRAFTS.pop(req.draft_id, None)
    return {
        "ok": True,
        "import_id": import_id,
        "combo_id": combo_id,
        "variant_id": variant_id,
        "estimated_signal_count": diag.estimated_signal_count,
        "min_sample_pass": diag.min_sample_pass,
        "strictness": req.selected_strictness,
    }


@router.get("/author/{username}")
async def get_author(username: str) -> dict:
    from integrations.tradingview.author_reputation import get_author_reputation
    rep = get_author_reputation(username)
    return {"author_username": username, "reputation": rep}


@router.get("/twin/{import_id}")
async def get_twin(import_id: str) -> dict:
    try:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        rows = (
            sb.table("idea_twin_links")
            .select("*")
            .eq("import_id", import_id)
            .execute()
        ).data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Twin link not found")
        r = rows[0]
        return {
            "import_id": import_id,
            "author_username": r.get("author_username"),
            "engine_alpha_score_at_import": r.get("engine_alpha_score_at_import"),
            "actual_outcome": r.get("actual_outcome"),
            "actual_outcome_pct": r.get("actual_outcome_pct"),
            "outcome_resolved_at": r.get("outcome_resolved_at"),
            "horizon_bars": r.get("horizon_bars", 30),
            "pending": r.get("actual_outcome") is None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
