# backward-compat shim: research.query_transformer → research.discovery.query_transformer
import importlib as _il
_target = _il.import_module("research.discovery.query_transformer")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.query_transformer' has no attribute {name!r}")

from research.discovery.query_transformer import *  # noqa: F401, F403
