"""
Cogochi Skill Registry
Skills 병렬 호출 + 타임아웃 fallback + 응답 정규화
2026-03-31
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# 레지스트리 정의
# ──────────────────────────────────────────────

SKILL_REGISTRY: dict[str, dict] = {
    "coingecko_price": {
        "type":        "rest",
        "base_url":    "https://api.coingecko.com/api/v3",
        "timeout_ms":  2000,
        "phase":       1,
        "auth":        "api_key",
        "env_key":     "COINGECKO_API_KEY",
        "header_name": "x-cg-demo-api-key",   # free tier
    },
    "binance_market": {
        "type":       "rest",
        "base_url":   "https://fapi.binance.com",
        "timeout_ms": 1500,
        "phase":      1,
        "auth":       "none",
    },
    "coinglass_liquidation": {
        "type":        "rest",
        "base_url":    "https://open-api.coinglass.com/public/v2",
        "timeout_ms":  2000,
        "phase":       1,
        "auth":        "api_key",
        "env_key":     "COINGLASS_API_KEY",
        "header_name": "coinglassSecret",
    },
    "nansen_smartmoney": {
        "type":        "rest",
        "base_url":    "https://api.nansen.ai/v1",
        "timeout_ms":  3000,
        "phase":       1,
        "auth":        "api_key",
        "env_key":     "NANSEN_API_KEY",
        "header_name": "Authorization",
        "requires":    "pro_subscription",
    },
}


# ──────────────────────────────────────────────
# 단일 Skills 호출 (각 Skills별 로직)
# ──────────────────────────────────────────────

async def _call_coingecko(client: httpx.AsyncClient, snapshot: dict) -> dict:
    symbol = snapshot.get("symbol", "bitcoin").lower()
    r = await client.get(
        "/simple/price",
        params={
            "ids": symbol,
            "vs_currencies": "usd",
            "include_market_cap": "true",
            "include_24hr_change": "true",
        }
    )
    r.raise_for_status()
    data = r.json()

    # BTC dominance
    global_r = await client.get("/global")
    global_r.raise_for_status()
    global_data = global_r.json().get("data", {})

    return {
        "btc_price":      data.get(symbol, {}).get("usd"),
        "btc_24h_change": data.get(symbol, {}).get("usd_24h_change"),
        "btc_dominance":  round(
            global_data.get("market_cap_percentage", {}).get("btc", 0), 1
        ),
        "total_market_cap_usd": global_data.get("total_market_cap", {}).get("usd"),
    }


async def _call_binance_market(client: httpx.AsyncClient, snapshot: dict) -> dict:
    symbol = snapshot.get("symbol", "BTCUSDT")

    # 오더북 뎁스
    depth_r = await client.get(
        "/fapi/v1/depth",
        params={"symbol": symbol, "limit": 20}
    )
    depth_r.raise_for_status()
    depth = depth_r.json()

    bids = [[float(p), float(q)] for p, q in depth.get("bids", [])[:5]]
    asks = [[float(p), float(q)] for p, q in depth.get("asks", [])[:5]]

    bid_vol = sum(q for _, q in bids)
    ask_vol = sum(q for _, q in asks)
    depth_ratio = round(bid_vol / ask_vol, 3) if ask_vol > 0 else 1.0

    top_ask = asks[0][0] if asks else None

    return {
        "top_bid_price":  bids[0][0] if bids else None,
        "top_ask_price":  top_ask,
        "depth_ratio":    depth_ratio,    # >1 = bid 우세, <1 = ask 우세
        "bid_volume_5":   round(bid_vol, 2),
        "ask_volume_5":   round(ask_vol, 2),
    }


async def _call_coinglass(client: httpx.AsyncClient, snapshot: dict) -> dict:
    symbol = snapshot.get("symbol", "BTC").replace("USDT", "")
    price  = snapshot.get("currentPrice", 0)

    r = await client.get(
        "/liquidation_map",
        params={"symbol": symbol, "range": "3"}    # ±3% 범위
    )
    r.raise_for_status()
    data = r.json().get("data", {})

    liq_24h = data.get("liquidation24H", {})
    liq_map = data.get("liquidationMap", [])

    # 현재가 ±1.5% 이내 가장 큰 청산 클러스터
    nearest_pct = 99.0
    if price and liq_map:
        for item in liq_map:
            item_price = float(item.get("price", 0))
            if item_price > 0:
                dist_pct = abs(item_price - price) / price * 100
                if dist_pct < nearest_pct:
                    nearest_pct = round(dist_pct, 2)

    return {
        "liq_24h_long_usd":    liq_24h.get("longLiquidationUsd", 0),
        "liq_24h_short_usd":   liq_24h.get("shortLiquidationUsd", 0),
        "nearest_cluster_pct": nearest_pct,
    }


async def _call_nansen(client: httpx.AsyncClient, snapshot: dict) -> dict:
    symbol = snapshot.get("symbol", "BTC").replace("USDT", "")

    r = await client.get(
        f"/smart-money/flow",
        params={"token": symbol, "hours": 24}
    )
    r.raise_for_status()
    data = r.json().get("data", {})

    net_flow = data.get("netFlowUsd", 0)
    return {
        "net_flow_usd":    net_flow,
        "inflow_usd":      data.get("inflowUsd", 0),
        "outflow_usd":     data.get("outflowUsd", 0),
        "whale_wallets":   data.get("activeWhaleCount", 0),
        "direction":       "inflow" if net_flow > 0 else "outflow",
    }


# ──────────────────────────────────────────────
# 디스패처
# ──────────────────────────────────────────────

_CALLERS = {
    "coingecko_price":       _call_coingecko,
    "binance_market":        _call_binance_market,
    "coinglass_liquidation": _call_coinglass,
    "nansen_smartmoney":     _call_nansen,
}


def _build_client(config: dict) -> httpx.AsyncClient:
    headers = {}
    if config["auth"] == "api_key":
        key = os.getenv(config.get("env_key", ""), "")
        if key:
            header_name = config.get("header_name", "Authorization")
            headers[header_name] = f"Bearer {key}" if header_name == "Authorization" else key

    return httpx.AsyncClient(
        base_url=config["base_url"],
        headers=headers,
        timeout=config["timeout_ms"] / 1000,
    )


# ──────────────────────────────────────────────
# 단일 호출 (safe — 실패 시 None)
# ──────────────────────────────────────────────

async def call_skill_safe(
    skill_id:   str,
    snapshot:   dict,
    timeout_ms: int | None = None,
) -> dict | None:
    config = SKILL_REGISTRY.get(skill_id)
    if not config:
        logger.warning(f"skill '{skill_id}' not in registry")
        return None

    caller = _CALLERS.get(skill_id)
    if not caller:
        logger.warning(f"no caller for skill '{skill_id}'")
        return None

    effective_timeout = (timeout_ms or config["timeout_ms"]) / 1000
    t0 = time.monotonic()

    try:
        async with _build_client(config) as client:
            result = await asyncio.wait_for(
                caller(client, snapshot),
                timeout=effective_timeout,
            )
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.debug(f"skill '{skill_id}' ok ({latency_ms}ms)")
        return result

    except asyncio.TimeoutError:
        logger.warning(f"skill '{skill_id}' timeout ({effective_timeout*1000:.0f}ms)")
        return None

    except httpx.HTTPStatusError as e:
        logger.warning(f"skill '{skill_id}' HTTP {e.response.status_code}")
        return None

    except Exception as e:
        logger.error(f"skill '{skill_id}' error: {e}")
        return None


# ──────────────────────────────────────────────
# 병렬 호출 (배틀 REASON 상태)
# ──────────────────────────────────────────────

async def call_all_parallel(
    loadout:    dict,       # SkillLoadout
    snapshot:   dict,
    budget_ms:  int = 6000,
) -> dict[str, dict | None]:
    """
    SkillLoadout에서 활성화된 Skills를 병렬 호출.
    전체 예산(budget_ms) 초과 시 완료된 것만 반환.
    maxSkillCallsPerTick 제한 적용.
    """
    enabled = _enabled_skill_ids(loadout)
    max_calls = loadout.get("maxSkillCallsPerTick", 3)
    selected = enabled[:max_calls]

    if not selected:
        return {}

    tasks: dict[str, asyncio.Task] = {
        skill_id: asyncio.create_task(
            call_skill_safe(skill_id, snapshot,
                            SKILL_REGISTRY[skill_id]["timeout_ms"])
        )
        for skill_id in selected
        if skill_id in SKILL_REGISTRY
    }

    try:
        await asyncio.wait_for(
            asyncio.gather(*tasks.values(), return_exceptions=True),
            timeout=budget_ms / 1000,
        )
    except asyncio.TimeoutError:
        # 예산 초과 — 완료된 것만 수집, 나머지 취소
        for t in tasks.values():
            if not t.done():
                t.cancel()

    results: dict[str, dict | None] = {}
    for skill_id, task in tasks.items():
        if task.done() and not task.cancelled():
            exc = task.exception()
            results[skill_id] = None if exc else task.result()
        else:
            results[skill_id] = None

    return results


def _enabled_skill_ids(loadout: dict) -> list[str]:
    data_skills = loadout.get("dataSkills", {})
    result = []
    if data_skills.get("binanceMarket"):        result.append("binance_market")
    if data_skills.get("coingecko"):            result.append("coingecko_price")
    if data_skills.get("coinglassLiquidation"): result.append("coinglass_liquidation")
    if data_skills.get("nansenSmartMoney"):     result.append("nansen_smartmoney")
    return result


# ──────────────────────────────────────────────
# 카탈로그 조회 (API 응답용)
# ──────────────────────────────────────────────

def get_catalog() -> list[dict]:
    return [
        {
            "id":          skill_id,
            "name":        _NAMES.get(skill_id, skill_id),
            "description": _DESCRIPTIONS.get(skill_id, ""),
            "layer":       "DATA",
            "phase":       config["phase"],
            "timeout_ms":  config["timeout_ms"],
            "auth_type":   config["auth"].upper(),
            "cost_per_call": None,
        }
        for skill_id, config in SKILL_REGISTRY.items()
    ]


_NAMES = {
    "coingecko_price":       "CoinGecko Price & Dominance",
    "binance_market":        "Binance Market Intelligence",
    "coinglass_liquidation": "Coinglass Liquidation Heatmap",
    "nansen_smartmoney":     "Nansen Smart Money Flow",
}

_DESCRIPTIONS = {
    "coingecko_price":       "BTC/ETH price, 24h change, market dominance",
    "binance_market":        "Real-time orderbook depth, bid/ask ratio",
    "coinglass_liquidation": "Liquidation clusters, nearest level distance",
    "nansen_smartmoney":     "Whale wallet flows, net inflow/outflow last 24h",
}
