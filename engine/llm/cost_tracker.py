"""W-0316: Per-cycle LLM cost tracking with hard cap.

Hard cap: $0.50/cycle. Exceeding → CostCapExceeded raised.
Storage: Supabase llm_cost_records table (append-only).

Cost estimation:
  anthropic/claude-haiku-4-5-20251001:
    input  $0.80/M tokens  ($0.00000080/token)
    output $4.00/M tokens  ($0.00000400/token)
  openai/gpt-4o-mini:
    input  $0.15/M tokens
    output $0.60/M tokens
  groq/llama-3.1-70b-versatile: ~$0.001/M tokens
  ollama/*: $0.00
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone

log = logging.getLogger(__name__)

HARD_CAP_USD: float = float(os.environ.get("LLM_CYCLE_COST_CAP", "0.50"))

# Per-token cost table (USD per token). Approximate.
_TOKEN_COST: dict[str, tuple[float, float]] = {
    "anthropic/claude-haiku-4-5-20251001": (0.80e-6, 4.00e-6),
    "anthropic/claude-sonnet-4-6":         (3.00e-6, 15.00e-6),
    "anthropic/claude-opus-4-7":           (15.00e-6, 75.00e-6),
    "openai/gpt-4o-mini":                  (0.15e-6, 0.60e-6),
    "openai/gpt-4o":                       (5.00e-6, 15.00e-6),
    "groq/llama-3.1-70b-versatile":        (0.59e-6, 0.79e-6),
}


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
        cost = _estimate_cost(model, input_tokens, output_tokens)
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
        log.debug("llm call: task=%s model=%s cost=$%.5f cumulative=$%.4f",
                  task, model, cost, self._total_usd)

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


def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    if any(model.startswith(p) for p in ("ollama/", "ollama_chat/")):
        return 0.0
    # Try exact match first, then prefix match
    costs = _TOKEN_COST.get(model)
    if costs is None:
        for key, val in _TOKEN_COST.items():
            if model.startswith(key.split("/")[0]):
                costs = val
                break
    if costs is None:
        log.warning("unknown model cost for %r — assuming haiku rate", model)
        costs = _TOKEN_COST["anthropic/claude-haiku-4-5-20251001"]
    in_cost, out_cost = costs
    return in_cost * input_tokens + out_cost * output_tokens
