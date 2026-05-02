# backward-compat shim: research.backtest_cache → research.ensemble.backtest_cache
import importlib as _il
_target = _il.import_module("research.ensemble.backtest_cache")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.backtest_cache' has no attribute {name!r}")

from research.ensemble.backtest_cache import *  # noqa: F401, F403
