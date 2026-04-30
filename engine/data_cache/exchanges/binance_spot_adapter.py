"""Binance Spot OHLCV adapter using direct REST (reuses existing fetch_binance pattern)."""
from __future__ import annotations

import logging

import httpx
import pandas as pd

from .base import ExchangeAdapter, OHLCV_COLS

log = logging.getLogger(__name__)

_BINANCE_SPOT = "https://api.binance.com"
_UA = "WTD-Engine/1.0"


class BinanceSpotAdapter(ExchangeAdapter):
    exchange_id = "binance_spot"
    market_type = "spot"

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    async def fetch_ohlcv(
        self,
        symbol: str,
        tf: str,
        since_ms: int,
        limit: int = 1000,
    ) -> pd.DataFrame:
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={"User-Agent": _UA},
                http2=True,
            )
        try:
            resp = await self._client.get(
                f"{_BINANCE_SPOT}/api/v3/klines",
                params={
                    "symbol": symbol,
                    "interval": tf,
                    "startTime": since_ms,
                    "limit": limit,
                },
                timeout=15,
            )
            resp.raise_for_status()
            raw = resp.json()
            if not raw:
                return pd.DataFrame(columns=OHLCV_COLS)
            df = pd.DataFrame(raw, columns=[
                "ts", "open", "high", "low", "close", "volume",
                "_ct", "_qv", "_nt", "_tbv", "_tqv", "_ig",
            ])
            df = df[["ts", "open", "high", "low", "close", "volume"]].astype(float)
            df["ts"] = df["ts"].astype(int)
            return df
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                log.debug("[binance_spot] %s not listed on spot", symbol)
            else:
                log.warning("[binance_spot] %s HTTP %s", symbol, e.response.status_code)
            return pd.DataFrame(columns=OHLCV_COLS)
        except Exception as e:
            log.warning("[binance_spot] %s failed: %s", symbol, e)
            return pd.DataFrame(columns=OHLCV_COLS)

    def list_symbols(self) -> list[str]:
        return []

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
