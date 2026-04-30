"""LLM per-token pricing table (USD/token).

Separated from cost_tracker.py so pricing updates don't require touching
tracking logic. Update here when provider rates change.

Format: (input_cost_per_token, output_cost_per_token)
Unknown models → 0.0 with WARN log (not Haiku fallback — silent mis-billing).
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

# USD per token (approximate, updated 2026-04)
TOKEN_COST: dict[str, tuple[float, float]] = {
    # Anthropic
    "anthropic/claude-haiku-4-5-20251001": (0.80e-6,  4.00e-6),
    "anthropic/claude-sonnet-4-6":         (3.00e-6,  15.00e-6),
    "anthropic/claude-opus-4-7":           (15.00e-6, 75.00e-6),
    # OpenAI
    "openai/gpt-4o-mini":                  (0.15e-6, 0.60e-6),
    "openai/gpt-4o":                       (5.00e-6, 15.00e-6),
    # Groq
    "groq/llama-3.3-70b-versatile":        (0.59e-6, 0.79e-6),
    "groq/llama-3.1-70b-versatile":        (0.59e-6, 0.79e-6),
    "groq/llama-3.1-8b-instant":           (0.05e-6, 0.08e-6),
    # Cerebras (free tier)
    "cerebras/qwen-3-235b-a22b-instruct-2507": (0.0, 0.0),
    "cerebras/llama-3.3-70b":              (0.0, 0.0),
    # HuggingFace Inference (free tier)
    "huggingface/Qwen/Qwen2.5-72B-Instruct": (0.0, 0.0),
    # NVIDIA NIM
    "nvidia_nim/meta/llama-3.1-70b-instruct": (0.97e-6, 0.97e-6),
    "nvidia_nim/meta/llama-3.3-70b-instruct": (0.97e-6, 0.97e-6),
    # DeepSeek
    "deepseek/deepseek-chat":              (0.14e-6, 0.28e-6),
    # Mistral
    "mistral/mistral-small-latest":        (0.20e-6, 0.60e-6),
    # Gemini
    "gemini/gemini-1.5-flash":             (0.075e-6, 0.30e-6),
}

# Local models are always free
_LOCAL_PREFIXES = ("ollama/", "ollama_chat/")


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return estimated USD cost. Unknown model → 0.0 + WARN (not a silent Haiku fallback)."""
    if any(model.startswith(p) for p in _LOCAL_PREFIXES):
        return 0.0

    costs = TOKEN_COST.get(model)
    if costs is None:
        # Prefix match (e.g. groq/custom-model → groq rates)
        for key, val in TOKEN_COST.items():
            if model.startswith(key.rsplit("/", 1)[0] + "/"):
                costs = val
                break

    if costs is None:
        log.warning(
            "unknown_model_cost model=%r — cost recorded as $0.00 "
            "(add to llm/pricing.py if real spend)", model
        )
        return 0.0

    in_cost, out_cost = costs
    return in_cost * input_tokens + out_cost * output_tokens
