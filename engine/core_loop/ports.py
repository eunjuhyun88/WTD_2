from __future__ import annotations
from pathlib import Path
from typing import Protocol, runtime_checkable


@runtime_checkable
class DataPort(Protocol):
    async def refresh(self, symbols: list[str]) -> None: ...


@runtime_checkable
class SignalStorePort(Protocol):
    def upsert_events(self, events: list[dict]) -> None: ...
    def resolve_outcome(self, signal_id: str, pnl_bps: float) -> None: ...


@runtime_checkable
class OutcomeStorePort(Protocol):
    def write_outcomes(self, outcomes: list[dict]) -> None: ...


@runtime_checkable
class LedgerPort(Protocol):
    def append(self, records: list[dict]) -> None: ...
    def latest_path(self) -> Path | None: ...
