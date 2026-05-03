from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from api.routes import captures as capture_routes
from api.schemas_runtime import (
    RuntimeCaptureResponse,
    RuntimeCaptureListResponse,
    RuntimeLedgerResponse,
    RuntimeLedgerListResponse,
    RuntimePatternDefinitionListResponse,
    RuntimePatternDefinitionResponse,
    RuntimeResearchContextCreate,
    RuntimeResearchContextResponse,
    RuntimeSetupCreate,
    RuntimeSetupResponse,
    RuntimeWorkspacePinCreate,
    RuntimeWorkspaceResponse,
)
from capture.store import CaptureStore, now_ms
from capture.types import CaptureRecord
from patterns.definitions import PatternDefinitionService
from runtime.store import RuntimeStateStore

router = APIRouter()

_capture_store: CaptureStore | None = None
_runtime_store: RuntimeStateStore | None = None
_definition_service: PatternDefinitionService | None = None


def get_capture_store() -> CaptureStore:
    global _capture_store
    if _capture_store is None:
        _capture_store = CaptureStore()
    return _capture_store


def get_runtime_store() -> RuntimeStateStore:
    global _runtime_store
    if _runtime_store is None:
        _runtime_store = RuntimeStateStore()
    return _runtime_store


def get_definition_service() -> PatternDefinitionService:
    global _definition_service
    if _definition_service is None:
        _definition_service = PatternDefinitionService(capture_store=get_capture_store())
    return _definition_service


def _generated_at() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_capture(capture: CaptureRecord, definition_cache: dict[tuple[str, int | None], dict] | None = None) -> dict[str, Any]:
    """Serialize capture with optional definition ref cache for batch loading.

    Args:
        capture: The capture record to serialize
        definition_cache: Pre-loaded cache of {(pattern_slug, version): definition_ref}
                         Avoids N+1 queries when serializing multiple captures
    """
    payload = capture.to_dict()
    if isinstance(capture.definition_ref, dict) and capture.definition_ref:
        payload["definition_ref"] = dict(capture.definition_ref)
    elif capture.pattern_slug:
        # Try to use cache first, then fall back to direct lookup
        cache_key = (capture.pattern_slug, capture.pattern_version)
        if definition_cache is not None and cache_key in definition_cache:
            definition_ref = definition_cache[cache_key]
        else:
            definition_ref = get_definition_service().get_definition_ref(
                pattern_slug=capture.pattern_slug,
                pattern_version=capture.pattern_version,
            )
        if definition_ref is not None:
            payload["definition_ref"] = definition_ref
    return payload


def _serialize_ledger_entry(entry: dict[str, Any]) -> dict[str, Any]:
    payload = entry.get("payload")
    payload = payload if isinstance(payload, dict) else {}
    definition_ref = entry.get("definition_ref")
    if not isinstance(definition_ref, dict) or not definition_ref:
        definition_ref = payload.get("definition_ref")
    if not isinstance(definition_ref, dict) or not definition_ref:
        training_result = payload.get("training_result")
        if isinstance(training_result, dict):
            nested_ref = training_result.get("definition_ref")
            if isinstance(nested_ref, dict) and nested_ref:
                definition_ref = nested_ref
    if not isinstance(definition_ref, dict) or not definition_ref:
        definition_id = payload.get("definition_id")
        if isinstance(definition_id, str) and definition_id:
            try:
                parsed = get_definition_service().parse_definition_id(definition_id)
            except (ValueError, KeyError):
                parsed = None
            if parsed is not None:
                definition_ref = (
                    get_definition_service().get_definition_ref(
                        pattern_slug=parsed["pattern_slug"],
                        pattern_version=parsed["pattern_version"],
                    )
                    or parsed
                )
    if not isinstance(definition_ref, dict) or not definition_ref:
        pattern_slug = payload.get("pattern_slug")
        pattern_version = payload.get("pattern_version")
        if isinstance(pattern_slug, str) and pattern_slug:
            version = pattern_version if isinstance(pattern_version, int) else None
            definition_ref = get_definition_service().get_definition_ref(
                pattern_slug=pattern_slug,
                pattern_version=version,
            )
    serialized = dict(entry)
    if isinstance(definition_ref, dict) and definition_ref:
        serialized["definition_ref"] = definition_ref
    return serialized


@router.post("/captures", response_model=RuntimeCaptureResponse)
async def create_runtime_capture(request: Request, body: capture_routes.CaptureCreateBody) -> RuntimeCaptureResponse:
    """Create a canonical runtime capture.

    This route reuses the existing CaptureRecord schema while moving new
    runtime consumers to the `/runtime` plane.
    """
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    if body.capture_kind != "pattern_candidate" and body.pattern_slug:
        try:
            body.pattern_slug = capture_routes.validate_pattern_slug(body.pattern_slug)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    transition_snapshot, transition_defaults = capture_routes._validate_transition(body)
    record = CaptureRecord(
        capture_kind=body.capture_kind,
        user_id=user_id,
        symbol=body.symbol,
        pattern_slug=body.pattern_slug,
        pattern_version=body.pattern_version,
        phase=body.phase,
        timeframe=body.timeframe,
        captured_at_ms=now_ms(),
        candidate_transition_id=body.candidate_transition_id,
        candidate_id=body.candidate_id,
        scan_id=body.scan_id or transition_defaults.get("scan_id"),
        user_note=body.user_note,
        chart_context=body.chart_context,
        research_context=body.research_context.model_dump(mode="python") if body.research_context is not None else None,
        feature_snapshot=body.feature_snapshot if body.feature_snapshot is not None else transition_snapshot,
        block_scores=body.block_scores or transition_defaults.get("block_scores", {}),
        verdict_json=body.verdict_json,
        status=capture_routes._status_for_kind(body.capture_kind),
    )
    get_capture_store().save(record)
    capture_routes.LEDGER_RECORD_STORE.append_capture_record(record)
    return RuntimeCaptureResponse(generated_at=_generated_at(), capture=_serialize_capture(record))


@router.get("/captures", response_model=RuntimeCaptureListResponse)
async def list_runtime_captures(
    request: Request,
    definition_id: str | None = None,
    pattern_slug: str | None = None,
    symbol: str | None = None,
    status: str | None = None,
    watching: bool | None = None,
    limit: int = 100,
) -> RuntimeCaptureListResponse:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    definition_ref: dict[str, Any] | None = None
    if definition_id is not None:
        try:
            definition_ref = get_definition_service().parse_definition_id(definition_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": "runtime_definition_id_invalid", "definition_id": definition_id},
            ) from exc
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "runtime_definition_not_found", "definition_id": definition_id},
            ) from exc
        if pattern_slug is not None and pattern_slug != definition_ref["pattern_slug"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "runtime_definition_slug_mismatch",
                    "definition_id": definition_id,
                    "pattern_slug": pattern_slug,
                },
            )
        pattern_slug = definition_ref["pattern_slug"]
    captures = get_capture_store().list(
        user_id=user_id,
        pattern_slug=pattern_slug,
        definition_id=definition_ref["definition_id"] if definition_ref is not None else None,
        symbol=symbol,
        status=status,
        is_watching=watching,
        limit=max(1, min(limit, 500)),
    )

    # OPTIMIZATION: Batch-load all unique definition refs to avoid N+1 queries
    definition_cache: dict[tuple[str, int | None], dict] = {}
    unique_definitions = set()
    for capture in captures:
        if capture.pattern_slug:
            unique_definitions.add((capture.pattern_slug, capture.pattern_version))

    for pattern_slug_key, pattern_version_key in unique_definitions:
        ref = get_definition_service().get_definition_ref(
            pattern_slug=pattern_slug_key,
            pattern_version=pattern_version_key,
        )
        if ref is not None:
            definition_cache[(pattern_slug_key, pattern_version_key)] = ref

    # Serialize all captures using the pre-loaded cache
    rows = [_serialize_capture(capture, definition_cache=definition_cache) for capture in captures]
    return RuntimeCaptureListResponse(
        generated_at=_generated_at(),
        captures=rows,
        count=len(rows),
    )


@router.get("/captures/{capture_id}", response_model=RuntimeCaptureResponse)
async def get_runtime_capture(capture_id: str) -> RuntimeCaptureResponse:
    capture = get_capture_store().load(capture_id)
    if capture is None:
        raise HTTPException(status_code=404, detail={"code": "runtime_capture_not_found", "capture_id": capture_id})
    return RuntimeCaptureResponse(generated_at=_generated_at(), capture=_serialize_capture(capture))


@router.get("/definitions", response_model=RuntimePatternDefinitionListResponse)
async def list_runtime_definitions(limit: int = 100) -> RuntimePatternDefinitionListResponse:
    definitions = get_definition_service().list_definitions(limit=max(1, min(limit, 200)))
    return RuntimePatternDefinitionListResponse(
        generated_at=_generated_at(),
        definitions=definitions,
        count=len(definitions),
    )


@router.get("/definitions/{pattern_slug}", response_model=RuntimePatternDefinitionResponse)
async def get_runtime_definition(pattern_slug: str) -> RuntimePatternDefinitionResponse:
    try:
        definition = get_definition_service().get_definition(pattern_slug)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "runtime_definition_not_found", "pattern_slug": pattern_slug},
        ) from exc
    return RuntimePatternDefinitionResponse(generated_at=_generated_at(), definition=definition)


@router.post("/workspace/pins", response_model=RuntimeWorkspaceResponse)
async def create_workspace_pin(request: Request, body: RuntimeWorkspacePinCreate) -> RuntimeWorkspaceResponse:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    workspace = get_runtime_store().save_workspace_pin(
        symbol=body.symbol,
        timeframe=body.timeframe,
        user_id=user_id,
        kind=body.kind,
        summary=body.summary,
        payload=body.payload,
        pin_id=body.pin_id,
    )
    return RuntimeWorkspaceResponse(generated_at=_generated_at(), workspace=workspace)


@router.get("/workspace/{symbol}", response_model=RuntimeWorkspaceResponse)
async def get_workspace(request: Request, symbol: str) -> RuntimeWorkspaceResponse:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    workspace = get_runtime_store().get_workspace(symbol, user_id=user_id)
    return RuntimeWorkspaceResponse(generated_at=_generated_at(), workspace=workspace)


@router.post("/setups", response_model=RuntimeSetupResponse)
async def create_setup(request: Request, body: RuntimeSetupCreate) -> RuntimeSetupResponse:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    payload: dict[str, Any] = {
        **body.payload,
        "symbol": body.symbol,
        "timeframe": body.timeframe,
        "user_id": user_id,
        "title": body.title,
        "summary": body.summary,
    }
    setup = get_runtime_store().create_setup(payload)
    return RuntimeSetupResponse(generated_at=_generated_at(), setup=setup)


@router.get("/setups/{setup_id}", response_model=RuntimeSetupResponse)
async def get_setup(setup_id: str) -> RuntimeSetupResponse:
    setup = get_runtime_store().get_setup(setup_id)
    if setup is None:
        raise HTTPException(status_code=404, detail={"code": "runtime_setup_not_found", "setup_id": setup_id})
    return RuntimeSetupResponse(generated_at=_generated_at(), setup=setup)


@router.post("/research-contexts", response_model=RuntimeResearchContextResponse)
async def create_research_context(request: Request, body: RuntimeResearchContextCreate) -> RuntimeResearchContextResponse:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    payload: dict[str, Any] = {
        **body.payload,
        "symbol": body.symbol,
        "pattern_slug": body.pattern_slug,
        "user_id": user_id,
        "title": body.title,
        "summary": body.summary,
        "fact_refs": body.fact_refs,
        "search_refs": body.search_refs,
    }
    context = get_runtime_store().create_research_context(payload)
    return RuntimeResearchContextResponse(generated_at=_generated_at(), research_context=context)


@router.get("/research-contexts/{context_id}", response_model=RuntimeResearchContextResponse)
async def get_research_context(context_id: str) -> RuntimeResearchContextResponse:
    context = get_runtime_store().get_research_context(context_id)
    if context is None:
        raise HTTPException(status_code=404, detail={"code": "runtime_research_context_not_found", "context_id": context_id})
    return RuntimeResearchContextResponse(generated_at=_generated_at(), research_context=context)


@router.get("/ledger/{ledger_id}", response_model=RuntimeLedgerResponse)
async def get_ledger(ledger_id: str) -> RuntimeLedgerResponse:
    entry = get_runtime_store().get_ledger_entry(ledger_id)
    if entry is None:
        raise HTTPException(status_code=404, detail={"code": "runtime_ledger_not_found", "ledger_id": ledger_id})
    return RuntimeLedgerResponse(generated_at=_generated_at(), ledger=_serialize_ledger_entry(entry))


@router.get("/ledger", response_model=RuntimeLedgerListResponse)
async def list_ledger(
    definition_id: str | None = None,
    kind: str | None = None,
    subject_id: str | None = None,
    limit: int = 50,
) -> RuntimeLedgerListResponse:
    if definition_id is not None:
        try:
            get_definition_service().parse_definition_id(definition_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": "runtime_definition_id_invalid", "definition_id": definition_id},
            ) from exc
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "runtime_definition_not_found", "definition_id": definition_id},
            ) from exc
    entries = get_runtime_store().list_ledger_entries(
        definition_id=definition_id,
        kind=kind,
        subject_id=subject_id,
        limit=limit,
    )
    rows = [_serialize_ledger_entry(entry) for entry in entries]
    return RuntimeLedgerListResponse(
        generated_at=_generated_at(),
        ledgers=rows,
        count=len(rows),
    )
