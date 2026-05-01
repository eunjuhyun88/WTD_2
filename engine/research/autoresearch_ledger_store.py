"""Autoresearch ledger persistence — cycle results to Supabase.

Stores cycle execution results and ensemble strategy performance for analytics UI.
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Optional

try:
    from supabase import Client
except ImportError:
    Client = None

log = logging.getLogger("engine.research.autoresearch_ledger_store")


@dataclass
class LedgerEntry:
    """Single autoresearch cycle result."""

    cycle_id: int
    status: str  # "committed", "rejected", "error"
    strategy: str
    candidates_proposed: Optional[int] = None
    candidates_after_l2: Optional[int] = None
    best_proposal_ratio: Optional[str] = None
    rejected_reason: Optional[str] = None
    dsr_delta: Optional[float] = None
    latency_sec: Optional[float] = None
    cost_usd: Optional[float] = None
    budget_seconds: Optional[int] = None
    commit_sha: Optional[str] = None
    rules_snapshot_json: Optional[dict] = None
    sandbox_mode: bool = False


@dataclass
class EnsembleRound:
    """Single ensemble strategy performance in a cycle."""

    cycle_id: int
    strategy_name: str
    ensemble_group: str
    outcome: str  # "accepted", "rejected", "timeout", "error"
    proposal_score: Optional[float] = None
    dsr_delta_predicted: Optional[float] = None
    dsr_delta_actual: Optional[float] = None
    cost_usd: Optional[float] = None
    latency_sec: Optional[float] = None
    budget_seconds: Optional[int] = None
    error_message: Optional[str] = None
    proposer_tracks: Optional[list[str]] = None


class AutoresearchLedgerStore:
    """Persist autoresearch results to Supabase."""

    def __init__(self, client: Optional[Client] = None) -> None:
        self.client = client

    async def save_cycle_result(self, entry: LedgerEntry) -> Optional[str]:
        """Save cycle result to autoresearch_ledger table.

        Args:
            entry: LedgerEntry with cycle results

        Returns:
            UUID of inserted row, or None if save failed
        """
        if not self.client:
            log.warning("No Supabase client, skipping ledger save")
            return None

        try:
            data = asdict(entry)
            data["cycle_date"] = datetime.now(timezone.utc).isoformat()
            data["created_at"] = datetime.now(timezone.utc).isoformat()

            response = self.client.table("autoresearch_ledger").insert(data).execute()
            if response.data and len(response.data) > 0:
                return response.data[0].get("id")
            return None
        except Exception as exc:
            log.error(f"Failed to save cycle result: {exc}")
            return None

    async def save_ensemble_round(
        self, round_entry: EnsembleRound, ledger_id: Optional[str] = None
    ) -> Optional[str]:
        """Save ensemble strategy performance to ensemble_rounds table.

        Args:
            round_entry: EnsembleRound with strategy performance
            ledger_id: UUID of parent ledger entry (optional)

        Returns:
            UUID of inserted row, or None if save failed
        """
        if not self.client:
            log.warning("No Supabase client, skipping ensemble round save")
            return None

        try:
            data = asdict(round_entry)
            data["created_at"] = datetime.now(timezone.utc).isoformat()
            if ledger_id:
                data["ledger_id"] = ledger_id

            response = self.client.table("ensemble_rounds").insert(data).execute()
            if response.data and len(response.data) > 0:
                return response.data[0].get("id")
            return None
        except Exception as exc:
            log.error(f"Failed to save ensemble round: {exc}")
            return None

    async def get_cycle_ledger(self, cycle_id: int) -> Optional[dict]:
        """Retrieve cycle result from ledger.

        Args:
            cycle_id: Cycle ID to fetch

        Returns:
            Ledger entry dict, or None if not found
        """
        if not self.client:
            return None

        try:
            response = (
                self.client.table("autoresearch_ledger")
                .select("*")
                .eq("cycle_id", cycle_id)
                .execute()
            )
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as exc:
            log.error(f"Failed to fetch cycle ledger: {exc}")
            return None

    async def get_ensemble_results(self, cycle_id: int) -> Optional[list[dict]]:
        """Retrieve ensemble strategy results for a cycle.

        Args:
            cycle_id: Cycle ID to fetch

        Returns:
            List of ensemble round dicts, or None on error
        """
        if not self.client:
            return None

        try:
            response = (
                self.client.table("ensemble_rounds")
                .select("*")
                .eq("cycle_id", cycle_id)
                .execute()
            )
            return response.data if response.data else []
        except Exception as exc:
            log.error(f"Failed to fetch ensemble results: {exc}")
            return None
