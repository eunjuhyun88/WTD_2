# backward-compat shim: research.backtest → research.ensemble.backtest
import importlib as _il
_target = _il.import_module("research.ensemble.backtest")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.backtest' has no attribute {name!r}")

from research.ensemble.backtest import *  # noqa: F401, F403
