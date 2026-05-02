# backward-compat shim: research.blocked_candidate_store → research.artifacts.blocked_candidate_store
import importlib as _il
_target = _il.import_module("research.artifacts.blocked_candidate_store")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.blocked_candidate_store' has no attribute {name!r}")

from research.artifacts.blocked_candidate_store import *  # noqa: F401, F403
