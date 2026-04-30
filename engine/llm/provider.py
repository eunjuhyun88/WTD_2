"""W-0316: litellm unified LLM provider wrapper.

Two public functions:
  call_with_tools()  — tool_use loop (judge task)
  call_text()        — plain text completion (summary/scan task)

Both record cost to CostTracker and raise CostCapExceeded if over cap.
Both retry once on transient errors before raising.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import litellm  # type: ignore[import]

from llm.cost_tracker import CostTracker
from llm.router import resolve_model

log = logging.getLogger(__name__)

litellm.drop_params = True  # ignore unsupported params per-provider

# Groq 12-key rotation — litellm picks the next key on RateLimitError
_groq_keys = [k.strip() for k in os.environ.get("GROQ_API_KEYS", "").split(",") if k.strip()]
if _groq_keys:
    os.environ.setdefault("GROQ_API_KEY", _groq_keys[0])

# HuggingFace — litellm reads HUGGINGFACE_API_KEY
_hf_token = os.environ.get("HF_TOKEN", "")
if _hf_token:
    os.environ.setdefault("HUGGINGFACE_API_KEY", _hf_token)

# NVIDIA NIM — litellm reads NVIDIA_NIM_API_KEY
_nvidia_key = os.environ.get("NVIDIA_API_KEY", "")
if _nvidia_key:
    os.environ.setdefault("NVIDIA_NIM_API_KEY", _nvidia_key)

# Cerebras — litellm reads CEREBRAS_API_KEY directly


async def call_with_tools(
    messages: list[dict],
    tools: list[dict],
    tool_choice: dict,
    tracker: CostTracker,
    task: str = "judge",
    model: str | None = None,
    timeout: float = 30.0,
) -> litellm.ModelResponse:
    """Tool-use call. Raises on tool parse failure after 1 retry."""
    resolved = resolve_model(task, model)
    log.debug("call_with_tools task=%s model=%s", task, resolved)

    for attempt in range(2):
        try:
            resp = await asyncio.wait_for(
                litellm.acompletion(
                    model=resolved,
                    messages=messages,
                    tools=tools,
                    tool_choice=tool_choice,
                ),
                timeout=timeout,
            )
            _record(tracker, task, resolved, resp)
            return resp
        except litellm.exceptions.BadRequestError:
            raise
        except Exception as exc:
            if attempt == 1:
                raise
            log.warning("call_with_tools attempt 0 failed: %s — retrying", exc)

    raise RuntimeError("unreachable")


async def call_text(
    messages: list[dict],
    tracker: CostTracker,
    task: str = "summary",
    model: str | None = None,
    timeout: float = 30.0,
) -> str:
    """Plain text completion. Returns content string."""
    resolved = resolve_model(task, model)
    log.debug("call_text task=%s model=%s", task, resolved)

    for attempt in range(2):
        try:
            resp = await asyncio.wait_for(
                litellm.acompletion(
                    model=resolved,
                    messages=messages,
                ),
                timeout=timeout,
            )
            _record(tracker, task, resolved, resp)
            content = resp.choices[0].message.content or ""
            return content
        except Exception as exc:
            if attempt == 1:
                raise
            log.warning("call_text attempt 0 failed: %s — retrying", exc)

    raise RuntimeError("unreachable")


def _record(tracker: CostTracker, task: str, model: str, resp: Any) -> None:
    usage = getattr(resp, "usage", None)
    if usage is None:
        return
    tracker.record_call(
        task=task,
        model=model,
        input_tokens=getattr(usage, "prompt_tokens", 0),
        output_tokens=getattr(usage, "completion_tokens", 0),
    )
