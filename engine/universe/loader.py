"""Named-universe dispatcher.

String-based dispatch (rather than `from universe.binance_30 import SYMBOLS`)
so wizard-generated challenges can reference a universe by name in
answers.yaml and stay decoupled from module paths. Phase F extends this
to dynamic loaders (Coinalyze, top-100 by volume, user-supplied lists).
"""
from __future__ import annotations

from universe.binance_30 import SYMBOLS as _BINANCE_30


def load_universe(name: str) -> list[str]:
    """Return the list of symbols for a named universe.

    Supported names:
        "binance_30"      — tier-balanced 10 large + 10 mid + 10 small
                            Binance spot pairs. See universe/binance_30.py.
        "binance_dynamic" — active USDT-M perps filtered by 24h volume.
        "binance_all"     — broader dynamic set with a looser cap/filter.

    Raises:
        KeyError: if name is unknown.
    """
    if name == "binance_30":
        return list(_BINANCE_30)
    if name == "binance_dynamic":
        from universe.dynamic import load_dynamic_universe
        return load_dynamic_universe()
    if name == "binance_all":
        from universe.dynamic import load_dynamic_universe
        return load_dynamic_universe(min_volume_usd=0, max_symbols=500)
    raise KeyError(
        f"unknown universe {name!r} (available: 'binance_30', 'binance_dynamic', 'binance_all')"
    )


async def load_universe_async(name: str) -> list[str]:
    """Async variant for callers that want the shared token-universe dataset."""
    if name in {"binance_30", ""}:
        return load_universe("binance_30")
    if name == "binance_dynamic":
        from universe.dynamic import load_dynamic_universe_async
        return await load_dynamic_universe_async()
    if name == "binance_all":
        from universe.dynamic import load_dynamic_universe_async
        return await load_dynamic_universe_async(min_volume_usd=0, max_symbols=500)
    raise KeyError(
        f"unknown universe {name!r} (available: 'binance_30', 'binance_dynamic', 'binance_all')"
    )
