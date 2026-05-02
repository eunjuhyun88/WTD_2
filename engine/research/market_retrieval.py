# backward-compat shim: research.market_retrieval → research.ensemble.market_retrieval
import importlib as _il
_target = _il.import_module("research.ensemble.market_retrieval")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.market_retrieval' has no attribute {name!r}")

from research.ensemble.market_retrieval import *  # noqa: F401, F403
