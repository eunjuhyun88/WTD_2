"""Tier configuration — maps tier name to model + quota limits."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class TierConfig:
    tier: str
    model_override: str | None       # None = use env LLM_MODEL default
    max_tool_calls: int
    allowed_tools: list[str]         # empty list = all tools allowed
    msgs_per_day: int                # quota (enforced in BFF)


# ── Tier matrix (from design doc W-0404) ────────────────────────────────────
_TIER_CONFIGS: dict[str, TierConfig] = {
    "free": TierConfig(
        tier="free",
        model_override=None,          # env default: Ollama qwen3.5 or claude-haiku
        max_tool_calls=4,
        allowed_tools=["explain", "similar", "live_snapshot"],
        msgs_per_day=20,
    ),
    "pro": TierConfig(
        tier="pro",
        model_override=os.getenv("AGENT_MODEL_PRO", "claude-haiku-4-5"),
        max_tool_calls=6,
        allowed_tools=[],             # all tools
        msgs_per_day=500,
    ),
    "team": TierConfig(
        tier="team",
        model_override=os.getenv("AGENT_MODEL_TEAM", "claude-sonnet-4-7"),
        max_tool_calls=6,
        allowed_tools=[],             # all tools
        msgs_per_day=2000,
    ),
}


def get_tier_config(tier: str) -> TierConfig:
    """Return TierConfig for the given tier name (default: free)."""
    return _TIER_CONFIGS.get(tier, _TIER_CONFIGS["free"])
