from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from api.routes import captures as capture_routes
from api.schemas_runtime import (
    RuntimeCaptureResponse,
    RuntimeCaptureListResponse,
    RuntimeLedgerResponse,
    RuntimeResearchContextCreate,
    RuntimeResearchContextResponse,
    RuntimeSetupCreate,
    RuntimeSetupResponse,
    RuntimeWorkspacePinCreate,
    RuntimeWorkspaceResponse,
)
from capture.store import CaptureStore, now_ms
from capture.types import CaptureRecord
from runtime.store import RuntimeStateStore

router = APIRouter()

_capture_store: CaptureStore | None = None
_runtime_store: RuntimeStateStore | None = None


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


def _generated_at() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/captures", response_model=RuntimeCaptureResponse)
async def create_runtime_capture(body: capture_routes.CaptureCreateBody) -> RuntimeCaptureResponse:
    """Create a canonical runtime capture.

    This route reuses the existing CaptureRecord schema while moving new
    runtime consumers to the `/runtime` plane.
    """
    if body.capture_kind != "pattern_candidate" and body.pattern_slug:
        try:
            body.pattern_slug = capture_routes.validate_pattern_slug(body.pattern_slug)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    transition_snapshot, transition_defaults = capture_routes._validate_transition(body)
    record = CaptureRecord(
        capture_kind=body.capture_kind,
        user_id=body.user_id,
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
        status=capture_routes._status_for_kind(body.capture_kind),
    )
    get_capture_store().save(record)
    capture_routes.LEDGER_RECORD_STORE.append_capture_record(record)
    return RuntimeCaptureResponse(generated_at=_generated_at(), capture=record.to_dict())


@router.get("/captures", response_model=RuntimeCaptureListResponse)
async def list_runtime_captures(
    user_id: str | None = None,
    pattern_slug: str | None = None,
    symbol: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> RuntimeCaptureListResponse:
    captures = get_capture_store().list(
        user_id=user_id,
        pattern_slug=pattern_slug,
        symbol=symbol,
        status=status,
        limit=max(1, min(limit, 500)),
    )
    rows = [capture.to_dict() for capture in captures]
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
    return RuntimeCaptureResponse(generated_at=_generated_at(), capture=capture.to_dict())


@router.post("/workspace/pins", response_model=RuntimeWorkspaceResponse)
async def create_workspace_pin(body: RuntimeWorkspacePinCreate) -> RuntimeWorkspaceResponse:
    workspace = get_runtime_store().save_workspace_pin(
        symbol=body.symbol,
        timeframe=body.timeframe,
        user_id=body.user_id,
        kind=body.kind,
        summary=body.summary,
        payload=body.payload,
        pin_id=body.pin_id,
    )
    return RuntimeWorkspaceResponse(generated_at=_generated_at(), workspace=workspace)


@router.get("/workspace/{symbol}", response_model=RuntimeWorkspaceResponse)
async def get_workspace(symbol: str, user_id: str | None = None) -> RuntimeWorkspaceResponse:
    workspace = get_runtime_store().get_workspace(symbol, user_id=user_id)
    return RuntimeWorkspaceResponse(generated_at=_generated_at(), workspace=workspace)


@router.post("/setups", response_model=RuntimeSetupResponse)
async def create_setup(body: RuntimeSetupCreate) -> RuntimeSetupResponse:
    payload: dict[str, Any] = {
        **body.payload,
        "symbol": body.symbol,
        "timeframe": body.timeframe,
        "user_id": body.user_id,
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
async def create_research_context(body: RuntimeResearchContextCreate) -> RuntimeResearchContextResponse:
    payload: dict[str, Any] = {
        **body.payload,
        "symbol": body.symbol,
        "pattern_slug": body.pattern_slug,
        "user_id": body.user_id,
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
    return RuntimeLedgerResponse(generated_at=_generated_at(), ledger=entry)
