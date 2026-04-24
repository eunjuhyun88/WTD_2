from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

RuntimePlaneState = Literal["durable", "fallback_local", "read_only"]


class RuntimeEnvelope(BaseModel):
    ok: bool = True
    owner: Literal["engine"] = "engine"
    plane: Literal["runtime"] = "runtime"
    status: RuntimePlaneState = "fallback_local"
    generated_at: str


class RuntimeCaptureResponse(RuntimeEnvelope):
    capture: dict[str, Any]


class RuntimeCaptureListResponse(RuntimeEnvelope):
    captures: list[dict[str, Any]]
    count: int


class RuntimePatternDefinitionResponse(RuntimeEnvelope):
    definition: dict[str, Any]


class RuntimePatternDefinitionListResponse(RuntimeEnvelope):
    definitions: list[dict[str, Any]]
    count: int


class RuntimeWorkspacePinCreate(BaseModel):
    symbol: str
    timeframe: str | None = None
    user_id: str | None = None
    kind: str = "pin"
    summary: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    pin_id: str | None = None


class RuntimeWorkspaceResponse(RuntimeEnvelope):
    workspace: dict[str, Any]


class RuntimeSetupCreate(BaseModel):
    symbol: str | None = None
    timeframe: str | None = None
    user_id: str | None = None
    title: str | None = None
    summary: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class RuntimeSetupResponse(RuntimeEnvelope):
    setup: dict[str, Any]


class RuntimeResearchContextCreate(BaseModel):
    symbol: str | None = None
    pattern_slug: str | None = None
    user_id: str | None = None
    title: str | None = None
    summary: str | None = None
    fact_refs: list[str] = Field(default_factory=list)
    search_refs: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class RuntimeResearchContextResponse(RuntimeEnvelope):
    research_context: dict[str, Any]


class RuntimeLedgerResponse(RuntimeEnvelope):
    ledger: dict[str, Any]


class RuntimeLedgerListResponse(RuntimeEnvelope):
    ledgers: list[dict[str, Any]]
    count: int
