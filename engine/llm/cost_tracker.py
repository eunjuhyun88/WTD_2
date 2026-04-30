"""W-0316: Per-cycle LLM cost tracking with hard cap.

Hard cap: $0.50/cycle (LLM_CYCLE_COST_CAP env). Exceeding → CostCapExceeded.
Storage: Supabase llm_cost_records (append-only).
Pricing: see llm/pricing.py — update there when rates change.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone

from llm.pricing import estimate_cost

log = logging.getLogger(__name__)

HARD_CAP_USD: float = float(os.environ.get("LLM_CYCLE_COST_CAP", "0.50"))


class CostCapExceeded(Exception):
    """Raised when per-cycle cost exceeds HARD_CAP_USD."""

    def __init__(self, cycle_id: str, current: float, cap: float):
        self.cycle_id = cycle_id
        self.current = current
        self.cap = cap
        super().__init__(
            f"cycle {cycle_id}: cost ${current:.4f} exceeded cap ${cap:.2f}"
        )


@dataclass
class CostTracker:
    """Tracks LLM cost for one discovery cycle."""

    cycle_id: str
    cap_usd: float = field(
        default_factory=lambda: float(os.environ.get("LLM_CYCLE_COST_CAP", "0.50"))
    )
    _total_usd: float = field(default=0.0, init=False)
    _records: list[dict] = field(default_factory=list, init=False)

    def record_call(
        self,
        task: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
    ) -> float:
        """Record one LLM call. Returns call cost. Raises CostCapExceeded if over cap."""
        cost = estimate_cost(model, input_tokens, output_tokens)
        self._total_usd += cost
        self._records.append({
            "cycle_id": self.cycle_id,
            "task": task,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost,
            "cumulative_usd": self._total_usd,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
        log.debug(
            "llm_call task=%s model=%s in=%d out=%d cost=$%.5f cumul=$%.4f cycle=%s",
            task, model, input_tokens, output_tokens, cost, self._total_usd,
            self.cycle_id,
        )

        if self._total_usd > self.cap_usd:
            raise CostCapExceeded(self.cycle_id, self._total_usd, self.cap_usd)

        return cost

    @property
    def total_usd(self) -> float:
        return self._total_usd

    def flush_to_supabase(self) -> None:
        """Write all records to Supabase. Best-effort — never raises."""
        if not self._records:
            return
        try:
            from llm._supabase import get_client
            get_client().table("llm_cost_records").insert(self._records).execute()
            log.debug("flushed %d cost records to Supabase", len(self._records))
        except Exception:
            log.warning("cost tracker Supabase flush failed", exc_info=True)


