"""External news enrichment via Exa semantic search (W-0378).

fetch_news_context() is the single public entry point.
All network errors degrade gracefully to empty list — never blocks the main LLM call.
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx

_EXA_BASE = "https://api.exa.ai"
_CACHE_TTL = 3600.0  # 1 hour
_cache: dict[str, tuple[float, list[str]]] = {}

_RISK_KEYWORDS = frozenset({"hack", "exploit", "sec", "ban", "lawsuit", "seized", "shutdown", "rug"})


def _exa_key() -> str | None:
    val = os.environ.get("EXA_API_KEY", "").strip()
    return val or None


async def fetch_news_context(symbol_base: str, num_results: int = 3) -> list[str]:
    """Return top N news headlines for symbol_base via Exa semantic search.

    symbol_base: 'ETH', 'BTC' — without USDT/USD suffix.
    Returns [] if EXA_API_KEY unset, request fails, or times out.
    """
    key = _exa_key()
    if not key:
        return []

    cache_key = f"news:{symbol_base}:{num_results}"
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < _CACHE_TTL:
        return cached[1]

    query = f"{symbol_base} cryptocurrency price news catalyst 2026"
    payload: dict[str, Any] = {
        "query": query,
        "type": "auto",
        "num_results": num_results,
        "contents": {"highlights": True},
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(
                f"{_EXA_BASE}/search",
                json=payload,
                headers={"x-api-key": key, "Content-Type": "application/json"},
            )
        if res.status_code != 200:
            return []
        data = res.json()
    except Exception:
        return []

    headlines: list[str] = []
    for r in data.get("results", []):
        title = r.get("title", "").strip()
        highlights = r.get("highlights", [])
        snippet = highlights[0][:100] if highlights else ""
        if title:
            headlines.append(f"{title}: {snippet}" if snippet else title)

    _cache[cache_key] = (time.monotonic(), headlines)
    return headlines


def extract_symbol_base(symbol: str) -> str:
    """'ETHUSDT' → 'ETH', 'ETH-USD' → 'ETH', 'ETH-USDC' → 'ETH'"""
    return symbol.replace("USDT", "").replace("-USDC", "").replace("-USD", "").upper()


def detect_risk_news(headlines: list[str]) -> bool:
    """True if any headline contains a major risk keyword."""
    for h in headlines:
        h_lower = h.lower()
        if any(kw in h_lower for kw in _RISK_KEYWORDS):
            return True
    return False
