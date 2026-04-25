from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from api.schemas_pattern_draft import (
    PatternDraftTransformRequest,
    PatternDraftTransformResponse,
)
from api.schemas_search import (
    QualityJudgementRequest,
    QualityJudgementResponse,
    QualityStatsResponse,
    ScanRequest,
    ScanResponse,
    SearchCandidate,
    SearchCatalogResponse,
    SearchCorpusWindowSummary,
    SeedSearchRequest,
    SeedSearchResponse,
    SimilarCandidate,
    SimilarSearchRequest,
    SimilarSearchResponse,
)
from patterns.definitions import PatternDefinitionService
from research.query_transformer import transform_pattern_draft
from search.corpus import SearchCorpusStore
from search.runtime import get_scan, get_seed_search, run_scan, run_seed_search
from search.quality_ledger import append_judgement, compute_weights, layer_stats
from search.similar import get_similar_search, run_similar_search

router = APIRouter()
_definition_service: PatternDefinitionService | None = None


def get_definition_service() -> PatternDefinitionService:
    global _definition_service
    if _definition_service is None:
        _definition_service = PatternDefinitionService()
    return _definition_service


@router.get("/catalog", response_model=SearchCatalogResponse)
async def search_catalog(
    symbol: str | None = Query(None, min_length=3),
    timeframe: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
) -> SearchCatalogResponse:
    store = SearchCorpusStore()
    windows = store.list_windows(symbol=symbol, timeframe=timeframe, limit=limit)
    return SearchCatalogResponse(
        status="live" if windows else "empty",
        generated_at=datetime.now(timezone.utc).isoformat(),
        total_windows=store.count_windows(),
        windows=[
            SearchCorpusWindowSummary(
                window_id=window.window_id,
                symbol=window.symbol,
                timeframe=window.timeframe,
                start_ts=window.start_ts,
                end_ts=window.end_ts,
                bars=window.bars,
                source=window.source,
                signature=window.signature,
            )
            for window in windows
        ],
    )


@router.post("/seed", response_model=SeedSearchResponse)
async def search_seed(body: SeedSearchRequest) -> SeedSearchResponse:
    request = body.model_dump(mode="json")
    if body.definition_id:
        request["definition_ref"] = _resolve_definition_ref(body.definition_id)
    result = run_seed_search(request)
    return _seed_response(result)


@router.get("/seed/{run_id}", response_model=SeedSearchResponse)
async def search_seed_result(run_id: str) -> SeedSearchResponse:
    result = get_seed_search(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail={"code": "seed_run_not_found", "run_id": run_id})
    return _seed_response(result)


@router.post("/scan", response_model=ScanResponse)
async def search_scan(body: ScanRequest) -> ScanResponse:
    request = body.model_dump(mode="json")
    if body.definition_id:
        request["definition_ref"] = _resolve_definition_ref(body.definition_id)
    result = run_scan(request)
    return _scan_response(result)


@router.get("/scan/{scan_id}", response_model=ScanResponse)
async def search_scan_result(scan_id: str) -> ScanResponse:
    result = get_scan(scan_id)
    if result is None:
        raise HTTPException(status_code=404, detail={"code": "scan_not_found", "scan_id": scan_id})
    return _scan_response(result)


@router.post("/query-spec/transform", response_model=PatternDraftTransformResponse)
async def search_query_spec_transform(body: PatternDraftTransformRequest) -> PatternDraftTransformResponse:
    try:
        search_query_spec = transform_pattern_draft(
            body.pattern_draft.model_dump(mode="python", exclude_none=True)
        ).to_dict()
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "pattern_draft_invalid", "message": str(exc)},
        ) from exc

    transformer_meta = search_query_spec.get("transformer_meta")
    return PatternDraftTransformResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        search_query_spec=search_query_spec,
        transformer_meta=transformer_meta if isinstance(transformer_meta, dict) else {},
        parser_meta=body.parser_meta.model_dump(mode="json") if body.parser_meta is not None else None,
    )


@router.post("/similar", response_model=SimilarSearchResponse)
async def search_similar(body: SimilarSearchRequest) -> SimilarSearchResponse:
    """3-layer pattern similarity search.

    Layer A — feature signature distance (always active)
    Layer B — phase path LCS similarity (active when observed_phase_paths provided)
    Layer C — ML p_win from LightGBM (active when model is trained)
    """
    result = await asyncio.to_thread(run_similar_search, body.model_dump(mode="json"))
    return _similar_response(result)


@router.get("/similar/{run_id}", response_model=SimilarSearchResponse)
async def search_similar_result(run_id: str) -> SimilarSearchResponse:
    result = get_similar_search(run_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "similar_run_not_found", "run_id": run_id},
        )
    return _similar_response(result)


def _similar_response(result: dict) -> SimilarSearchResponse:
    candidates_raw = result.get("candidates", [])
    candidates = [
        SimilarCandidate(
            candidate_id=row["candidate_id"],
            window_id=row["window_id"],
            symbol=row["symbol"],
            timeframe=row["timeframe"],
            start_ts=row["start_ts"],
            end_ts=row["end_ts"],
            bars=int(row.get("bars", 0)),
            final_score=float(row.get("final_score", 0.0)),
            layer_a_score=float(row.get("layer_a_score", 0.0)),
            layer_b_score=row.get("layer_b_score"),
            layer_c_score=row.get("layer_c_score"),
            candidate_phase_path=row.get("candidate_phase_path") or [],
            signature=row.get("signature") or {},
            close_return_pct=row.get("close_return_pct"),
        )
        for row in candidates_raw
    ]
    # Report which layers were active in this run
    any_b = any(c.layer_b_score is not None for c in candidates)
    any_c = any(c.layer_c_score is not None for c in candidates)
    active_layers_raw = result.get("active_layers")
    active_layers = (
        active_layers_raw
        if isinstance(active_layers_raw, dict)
        else {"layer_a": True, "layer_b": any_b, "layer_c": any_c}
    )
    stage_counts_raw = result.get("stage_counts")
    stage_counts = (
        stage_counts_raw
        if isinstance(stage_counts_raw, dict)
        else {"returned_candidates": len(candidates)}
    )
    degraded_reason = result.get("degraded_reason")
    return SimilarSearchResponse(
        status=result["status"],
        generated_at=result["updated_at"],
        run_id=result["run_id"],
        request=result.get("request", {}),
        candidates=candidates,
        scoring_layers=active_layers,
        active_layers=active_layers,
        stage_counts=stage_counts,
        degraded_reason=degraded_reason if isinstance(degraded_reason, str) else None,
    )


@router.post("/quality/judge", response_model=QualityJudgementResponse)
async def search_quality_judge(body: QualityJudgementRequest) -> QualityJudgementResponse:
    """Record a user judgement (good/bad/neutral) on a search candidate.

    This feeds the weight recalibration loop: after _MIN_SAMPLES_FOR_RECALIBRATION
    judgements the blend weights for Layer A/B/C shift toward whichever layer
    has the higher user-validated accuracy.
    """
    judgement_id = await asyncio.to_thread(
        append_judgement,
        body.run_id,
        body.candidate_id,
        body.verdict,
        symbol=body.symbol,
        layer_a_score=body.layer_a_score,
        layer_b_score=body.layer_b_score,
        layer_c_score=body.layer_c_score,
        final_score=body.final_score,
        user_id=body.user_id,
    )
    return QualityJudgementResponse(judgement_id=judgement_id)


@router.get("/quality/stats", response_model=QualityStatsResponse)
async def search_quality_stats() -> QualityStatsResponse:
    """Return per-layer accuracy stats and the current active blend weights."""
    stats = await asyncio.to_thread(layer_stats)
    weights = await asyncio.to_thread(compute_weights)
    return QualityStatsResponse(
        total_judgements=stats["total_judgements"],
        layers=stats["layers"],
        active_weights=weights,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


def _seed_response(result: dict) -> SeedSearchResponse:
    return SeedSearchResponse(
        status=result["status"],
        generated_at=result["updated_at"],
        run_id=result["run_id"],
        request=result.get("request", {}),
        candidates=[_candidate(row, request=result.get("request", {})) for row in result.get("candidates", [])],
    )


def _scan_response(result: dict) -> ScanResponse:
    return ScanResponse(
        status=result["status"],
        generated_at=result["updated_at"],
        scan_id=result["scan_id"],
        request=result.get("request", {}),
        candidates=[_candidate(row, request=result.get("request", {})) for row in result.get("candidates", [])],
    )


def _candidate(row: dict, *, request: dict[str, object]) -> SearchCandidate:
    payload = row.get("payload", {})
    definition_ref = payload.get("definition_ref")
    if not isinstance(definition_ref, dict):
        request_definition_ref = request.get("definition_ref")
        definition_ref = request_definition_ref if isinstance(request_definition_ref, dict) else None
    return SearchCandidate(
        candidate_id=row["candidate_id"],
        window_id=row.get("window_id") or payload.get("window_id"),
        symbol=row.get("symbol") or payload.get("symbol"),
        timeframe=row.get("timeframe") or payload.get("timeframe"),
        score=float(row.get("score", 0.0)),
        definition_ref=definition_ref,
        payload=payload,
    )


def _resolve_definition_ref(definition_id: str) -> dict:
    try:
        parsed = get_definition_service().parse_definition_id(definition_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "search_definition_id_invalid", "definition_id": definition_id},
        ) from exc
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "search_definition_not_found", "definition_id": definition_id},
        ) from exc
    definition_ref = get_definition_service().get_definition_ref(
        pattern_slug=parsed["pattern_slug"],
        pattern_version=parsed["pattern_version"],
    )
    if definition_ref is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "search_definition_not_found", "definition_id": definition_id},
        )
    return definition_ref
