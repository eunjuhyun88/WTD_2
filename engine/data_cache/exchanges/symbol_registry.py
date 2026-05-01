"""Symbol conversion: canonical (BTCUSDT) ↔ exchange-native format.

Canonical format: Binance perp style, e.g. "BTCUSDT", "ETHUSDT".
"""
from __future__ import annotations

_REGISTRY: dict[str, dict[str, str]] = {}  # {exchange_id: {canonical: native}}


def to_native(canonical: str, exchange_id: str) -> str:
    """Convert BTCUSDT → exchange-native. Returns canonical if no mapping needed."""
    mapping: dict[str, object] = {
        "binance_spot": lambda s: s,
        "okx_spot": lambda s: s[:-4] + "/" + s[-4:] if s.endswith("USDT") else s,
        "okx_swap": lambda s: (s[:-4] + "/" + s[-4:] + ":" + s[-4:]) if s.endswith("USDT") else s,
        "bybit_spot": lambda s: s,
        "bybit_linear": lambda s: s,
        "coinbase_spot": lambda s: s[:-4] + "/" + s[-4:] if s.endswith("USDT") else s,
        "kraken_spot": lambda s: s[:-4] + "/" + s[-4:] if s.endswith("USDT") else s,
    }
    fn = mapping.get(exchange_id)
    return fn(canonical) if fn else canonical  # type: ignore[operator]


def to_canonical(native: str, exchange_id: str) -> str:
    """Convert exchange-native → BTCUSDT canonical.

    Examples:
        "BTC/USDT"       → "BTCUSDT"
        "BTC/USDT:USDT"  → "BTCUSDT"
        "BTCUSDT"        → "BTCUSDT"
    """
    # Strip swap suffix (e.g. :USDT)
    s = native.split(":")[0]
    return s.replace("/", "")
