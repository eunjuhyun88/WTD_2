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
        "binance_30" — tier-balanced 10 large + 10 mid + 10 small Binance
                       spot pairs. See universe/binance_30.py.

    Raises:
        KeyError: if name is unknown.
    """
    if name == "binance_30":
        return list(_BINANCE_30)
    raise KeyError(
        f"unknown universe {name!r} (available: 'binance_30')"
    )
