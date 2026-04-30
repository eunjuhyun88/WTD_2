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
    # judge: tool_use + reasoning → Groq Llama-3.3-70b (12키 로테이션)
    "judge":   os.environ.get("LLM_JUDGE_MODEL",   "groq/llama-3.3-70b-versatile"),
    # summary: 속도 최우선 → Cerebras (가장 빠른 추론)
    "summary": os.environ.get("LLM_SUMMARY_MODEL", "cerebras/qwen-3-235b-a22b-instruct-2507"),
    # scan: reasoning 최우선 → NVIDIA Nemotron-70b (무료 크레딧, 추론 특화)
    "scan":    os.environ.get("LLM_SCAN_MODEL",    "nvidia_nim/nvidia/llama-3.1-nemotron-70b-instruct"),
}

# judge fallback 우선순위: NVIDIA NIM → DeepSeek → HuggingFace
JUDGE_FALLBACK_MODEL: str = os.environ.get(
    "LLM_JUDGE_FALLBACK_MODEL", "nvidia_nim/meta/llama-3.3-70b-instruct"
)

# 전체 fallback 체인 (순서대로 시도)
FALLBACK_CHAIN: list[str] = [
    "groq/llama-3.3-70b-versatile",
    "nvidia_nim/meta/llama-3.3-70b-instruct",
    "deepseek/deepseek-chat",
    "huggingface/Qwen/Qwen2.5-72B-Instruct",
]


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
