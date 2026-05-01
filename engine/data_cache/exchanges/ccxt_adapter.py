"""ccxt-based adapters for OKX, Bybit, Coinbase, Kraken."""
from __future__ import annotations

import logging

import pandas as pd
import ccxt.async_support as ccxt_async

from .base import ExchangeAdapter, OHLCV_COLS
from .symbol_registry import to_native

log = logging.getLogger(__name__)


class CcxtAdapter(ExchangeAdapter):
    def __init__(
        self,
        exchange_id: str,
        market_type: str,
        ccxt_id: str,
        rate_limit_rps: float = 5.0,
    ) -> None:
        self.exchange_id = exchange_id
        self.market_type = market_type
        self._ccxt_id = ccxt_id
        self._rps = rate_limit_rps
        self._exchange: ccxt_async.Exchange | None = None

    async def _get_exchange(self) -> ccxt_async.Exchange:
        if self._exchange is None:
            cls = getattr(ccxt_async, self._ccxt_id)
            self._exchange = cls({"enableRateLimit": True})
        return self._exchange

    async def fetch_ohlcv(
        self,
        symbol: str,
        tf: str,
        since_ms: int,
        limit: int = 1000,
    ) -> pd.DataFrame:
        native = to_native(symbol, self.exchange_id)
        ex = await self._get_exchange()
        try:
            raw = await ex.fetch_ohlcv(native, tf, since=since_ms, limit=limit)
            if not raw:
                return pd.DataFrame(columns=OHLCV_COLS)
            df = pd.DataFrame(raw, columns=["ts", "open", "high", "low", "close", "volume"])
            df = df.astype({
                "ts": int,
                "open": float,
                "high": float,
                "low": float,
                "close": float,
                "volume": float,
            })
            return df
        except (ccxt_async.BadSymbol, ccxt_async.ExchangeError) as e:
            log.debug("[%s] %s not available: %s", self.exchange_id, symbol, e)
            return pd.DataFrame(columns=OHLCV_COLS)
        except Exception as e:
            log.warning("[%s] fetch_ohlcv %s failed: %s", self.exchange_id, symbol, e)
            return pd.DataFrame(columns=OHLCV_COLS)

    def list_symbols(self) -> list[str]:
        # Symbols loaded lazily via fetch_ohlcv
        return []

    async def close(self) -> None:
        if self._exchange:
            await self._exchange.close()
            self._exchange = None


# Pre-built factory functions

def okx_spot() -> CcxtAdapter:
    return CcxtAdapter("okx_spot", "spot", "okx", rate_limit_rps=10.0)


def okx_swap() -> CcxtAdapter:
    return CcxtAdapter("okx_swap", "futures", "okx", rate_limit_rps=10.0)


def bybit_spot() -> CcxtAdapter:
    return CcxtAdapter("bybit_spot", "spot", "bybit", rate_limit_rps=5.0)


def bybit_linear() -> CcxtAdapter:
    return CcxtAdapter("bybit_linear", "futures", "bybit", rate_limit_rps=5.0)


def coinbase_spot() -> CcxtAdapter:
    return CcxtAdapter("coinbase_spot", "spot", "coinbaseadvanced", rate_limit_rps=2.0)


def kraken_spot() -> CcxtAdapter:
    return CcxtAdapter("kraken_spot", "spot", "kraken", rate_limit_rps=1.0)
