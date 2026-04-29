"""LLM runtime adapters for engine-side agent calls.

The engine owns structured outputs and validation. This module only normalizes
provider calls into plain text so routes can keep provider details out of their
business logic.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

import httpx

Provider = Literal["anthropic", "ollama", "openai-compatible"]


class LLMRuntimeError(RuntimeError):
    """Provider error that can be mapped to an HTTP response."""

    def __init__(self, detail: str, status_code: int = 503) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class LLMRuntimeSettings:
    provider: Provider
    model: str
    base_url: str | None = None
    api_key: str | None = None
    timeout_seconds: float = 30.0


_OPENAI_COMPAT_ALIASES = {
    "openai",
    "openai-compatible",
    "openai_compatible",
    "llama.cpp",
    "llamacpp",
    "vllm",
    "sglang",
    "mlx",
    "mlx-lm",
    "mlx_lm",
}


def _clean_env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _normalise_provider(raw: str | None) -> Provider:
    provider = (raw or "").strip().lower()
    if provider in ("anthropic", "claude"):
        return "anthropic"
    if provider == "ollama":
        return "ollama"
    if provider in _OPENAI_COMPAT_ALIASES:
        return "openai-compatible"
    if provider:
        raise LLMRuntimeError(
            "Unsupported ENGINE_LLM_PROVIDER "
            f"{provider!r}. Use anthropic, ollama, or openai-compatible.",
            status_code=500,
        )
    return "anthropic" if _clean_env("ANTHROPIC_API_KEY") else "ollama"


def resolve_llm_settings() -> LLMRuntimeSettings:
    """Resolve engine LLM settings from environment.

    Local-first setup:
      ENGINE_LLM_PROVIDER=ollama
      OLLAMA_BASE_URL=http://localhost:11434
      OLLAMA_MODEL=qwen3:8b

    OpenAI-compatible setup for llama.cpp/vLLM/SGLang/MLX servers:
      ENGINE_LLM_PROVIDER=openai-compatible
      ENGINE_LLM_BASE_URL=http://localhost:8080/v1
      ENGINE_LLM_MODEL=local-model
    """
    provider = _normalise_provider(_clean_env("ENGINE_LLM_PROVIDER"))

    timeout_raw = _clean_env("ENGINE_LLM_TIMEOUT_SECONDS")
    try:
        timeout_seconds = float(timeout_raw) if timeout_raw else 30.0
    except ValueError as exc:
        raise LLMRuntimeError("ENGINE_LLM_TIMEOUT_SECONDS must be numeric", status_code=500) from exc

    if provider == "anthropic":
        return LLMRuntimeSettings(
            provider=provider,
            model=_clean_env("ENGINE_LLM_MODEL") or "claude-sonnet-4-5",
            api_key=_clean_env("ANTHROPIC_API_KEY"),
            timeout_seconds=timeout_seconds,
        )

    if provider == "ollama":
        return LLMRuntimeSettings(
            provider=provider,
            model=_clean_env("ENGINE_LLM_MODEL") or _clean_env("OLLAMA_MODEL") or "qwen3:1.7b",
            base_url=_clean_env("ENGINE_LLM_BASE_URL")
            or _clean_env("OLLAMA_BASE_URL")
            or "http://localhost:11434",
            timeout_seconds=timeout_seconds,
        )

    return LLMRuntimeSettings(
        provider=provider,
        model=_clean_env("ENGINE_LLM_MODEL") or "local-model",
        base_url=_clean_env("ENGINE_LLM_BASE_URL") or "http://localhost:8080/v1",
        api_key=_clean_env("ENGINE_LLM_API_KEY"),
        timeout_seconds=timeout_seconds,
    )


def _messages_to_prompt(system_prompt: str, user_text: str) -> str:
    # Qwen/DeepSeek-style thinking models may otherwise return only a
    # provider-specific thinking field and leave the final response empty.
    return f"/no_think\n[System]\n{system_prompt}\n\n[User]\n{user_text}"


def _join_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


async def generate_llm_text(
    system_prompt: str,
    user_text: str,
    *,
    max_tokens: int = 4096,
    temperature: float = 0.1,
    settings: LLMRuntimeSettings | None = None,
) -> str:
    """Generate text from the configured engine LLM provider."""
    cfg = settings or resolve_llm_settings()
    if cfg.provider == "anthropic":
        return await _generate_anthropic(system_prompt, user_text, max_tokens, temperature, cfg)
    if cfg.provider == "ollama":
        return await _generate_ollama(system_prompt, user_text, max_tokens, temperature, cfg)
    return await _generate_openai_compatible(system_prompt, user_text, max_tokens, temperature, cfg)


async def _generate_anthropic(
    system_prompt: str,
    user_text: str,
    max_tokens: int,
    temperature: float,
    cfg: LLMRuntimeSettings,
) -> str:
    if not cfg.api_key:
        raise LLMRuntimeError("ANTHROPIC_API_KEY not configured")

    try:
        import anthropic  # lazy import — optional for local-only users
    except ImportError as exc:
        raise LLMRuntimeError("anthropic package not installed", status_code=500) from exc

    try:
        client = anthropic.AsyncAnthropic(api_key=cfg.api_key)
        message = await client.messages.create(
            model=cfg.model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_text}],
        )
        text = message.content[0].text
    except anthropic.APIError as exc:
        raise LLMRuntimeError(f"Anthropic API error: {exc}", status_code=502) from exc
    except Exception as exc:
        raise LLMRuntimeError(f"Anthropic runtime error: {exc}", status_code=502) from exc

    if not text:
        raise LLMRuntimeError("Anthropic returned empty response", status_code=502)
    return text.strip()


async def _generate_ollama(
    system_prompt: str,
    user_text: str,
    max_tokens: int,
    temperature: float,
    cfg: LLMRuntimeSettings,
) -> str:
    if not cfg.base_url:
        raise LLMRuntimeError("OLLAMA_BASE_URL not configured", status_code=500)

    payload = {
        "model": cfg.model,
        "prompt": _messages_to_prompt(system_prompt, user_text),
        "format": "json",
        "stream": False,
        "think": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=cfg.timeout_seconds) as client:
            res = await client.post(_join_url(cfg.base_url, "/api/generate"), json=payload)
        if res.status_code == 404:
            raise LLMRuntimeError(
                f"Ollama model {cfg.model!r} not found. Run `ollama pull {cfg.model}`.",
                status_code=503,
            )
        if res.status_code >= 400:
            raise LLMRuntimeError(
                f"Ollama HTTP {res.status_code}: {res.text[:200]}",
                status_code=502,
            )
        data = res.json()
    except LLMRuntimeError:
        raise
    except httpx.HTTPError as exc:
        raise LLMRuntimeError(
            f"Ollama unavailable at {cfg.base_url}. Start it with `ollama serve`.",
            status_code=503,
        ) from exc

    text = data.get("response")
    if not isinstance(text, str) or not text.strip():
        raise LLMRuntimeError("Ollama returned empty response", status_code=502)
    return text.strip()


async def _generate_openai_compatible(
    system_prompt: str,
    user_text: str,
    max_tokens: int,
    temperature: float,
    cfg: LLMRuntimeSettings,
) -> str:
    if not cfg.base_url:
        raise LLMRuntimeError("ENGINE_LLM_BASE_URL not configured", status_code=500)

    headers = {"Content-Type": "application/json"}
    if cfg.api_key:
        headers["Authorization"] = f"Bearer {cfg.api_key}"
    payload = {
        "model": cfg.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=cfg.timeout_seconds) as client:
            res = await client.post(
                _join_url(cfg.base_url, "/chat/completions"),
                json=payload,
                headers=headers,
            )
            if res.status_code in (400, 422):
                # Some local OpenAI-compatible servers do not implement
                # response_format yet. The prompt still demands JSON, so retry
                # once without that optional hint before failing the request.
                fallback_payload = dict(payload)
                fallback_payload.pop("response_format", None)
                res = await client.post(
                    _join_url(cfg.base_url, "/chat/completions"),
                    json=fallback_payload,
                    headers=headers,
                )
        if res.status_code >= 400:
            raise LLMRuntimeError(
                f"OpenAI-compatible LLM HTTP {res.status_code}: {res.text[:200]}",
                status_code=502,
            )
        data = res.json()
    except LLMRuntimeError:
        raise
    except httpx.HTTPError as exc:
        raise LLMRuntimeError(
            f"OpenAI-compatible LLM unavailable at {cfg.base_url}",
            status_code=503,
        ) from exc

    text = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not isinstance(text, str) or not text.strip():
        raise LLMRuntimeError("OpenAI-compatible LLM returned empty response", status_code=502)
    return text.strip()
