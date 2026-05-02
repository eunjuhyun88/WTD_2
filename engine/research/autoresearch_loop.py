# backward-compat shim: research.autoresearch_loop → research.discovery.autoresearch_loop
import importlib as _il
_target = _il.import_module("research.discovery.autoresearch_loop")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.autoresearch_loop' has no attribute {name!r}")

from research.discovery.autoresearch_loop import *  # noqa: F401, F403
