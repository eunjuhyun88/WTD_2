# backward-compat shim: research.finding_store → research.artifacts.finding_store
import importlib as _il
_target = _il.import_module("research.artifacts.finding_store")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.finding_store' has no attribute {name!r}")

from research.artifacts.finding_store import *  # noqa: F401, F403
