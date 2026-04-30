"""Exchange adapter ABC."""
from __future__ import annotations
from abc import ABC, abstractmethod
import pandas as pd

OHLCV_COLS = ["ts", "open", "high", "low", "close", "volume"]


class ExchangeAdapter(ABC):
    exchange_id: str   # "binance_spot", "okx_spot", etc.
    market_type: str   # "spot" | "futures"

    @abstractmethod
    async def fetch_ohlcv(
        self,
        symbol: str,          # canonical Binance perp format: "BTCUSDT"
        tf: str,              # "1h"
        since_ms: int,        # unix ms
        limit: int = 1000,
    ) -> pd.DataFrame:
        """Return DataFrame with columns: ts(ms int), open, high, low, close, volume.
        Return empty DataFrame if symbol not listed on this exchange."""
        ...

    @abstractmethod
    def list_symbols(self) -> list[str]:
        """Return canonical symbols available on this exchange."""
        ...
