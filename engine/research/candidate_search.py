# backward-compat shim: research.candidate_search → research.discovery.candidate_search
import importlib as _il
_target = _il.import_module("research.discovery.candidate_search")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.candidate_search' has no attribute {name!r}")

from research.discovery.candidate_search import *  # noqa: F401, F403
