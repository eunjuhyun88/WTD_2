"""W-0316: Task → model mapping. Override via env.

Tasks:
  judge   — multi-axis statistical + market context evaluation.
            Requires reliable tool_use → API only (Anthropic or OpenAI).
  summary — trader-readable natural language summary.
            Local LLM allowed (Ollama qwen2.5:14b+ recommended).
  scan    — symbol priority / universe context interpretation.
            API preferred, local OK with quality caveat.

.env override examples:
  LLM_JUDGE_MODEL=anthropic/claude-haiku-4-5-20251001   (default)
  LLM_JUDGE_MODEL=openai/gpt-4o-mini
  LLM_SUMMARY_MODEL=ollama/qwen2.5:14b                   (zero cost)
  LLM_SCAN_MODEL=groq/llama-3.1-70b-versatile            (cheap)
"""
from __future__ import annotations

import os

_LOCAL_PREFIXES = ("ollama/", "ollama_chat/")
_API_ONLY_TASKS = {"judge"}

TASK_MODEL: dict[str, str] = {
    "judge":   os.environ.get("LLM_JUDGE_MODEL",   "anthropic/claude-haiku-4-5-20251001"),
    "summary": os.environ.get("LLM_SUMMARY_MODEL", "anthropic/claude-haiku-4-5-20251001"),
    "scan":    os.environ.get("LLM_SCAN_MODEL",    "anthropic/claude-haiku-4-5-20251001"),
}

JUDGE_FALLBACK_MODEL: str = os.environ.get(
    "LLM_JUDGE_FALLBACK_MODEL", "anthropic/claude-haiku-4-5-20251001"
)


def resolve_model(task: str, override: str | None = None) -> str:
    """Return the model string for a task, with safety enforcement.

    judge task: local LLM forbidden (tool_use accuracy requirement).
    """
    model = override or TASK_MODEL.get(task, TASK_MODEL["judge"])

    if task in _API_ONLY_TASKS and _is_local(model):
        import logging
        logging.getLogger(__name__).warning(
            "task=%s requires API model, but got local model %r — "
            "falling back to %s", task, model, JUDGE_FALLBACK_MODEL
        )
        return JUDGE_FALLBACK_MODEL

    return model


def _is_local(model: str) -> bool:
    return any(model.startswith(p) for p in _LOCAL_PREFIXES)


def is_local_model(task: str, override: str | None = None) -> bool:
    return _is_local(resolve_model(task, override))
