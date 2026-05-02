# backward-compat shim: research.state_store → research.artifacts.state_store
import importlib as _il
_target = _il.import_module("research.artifacts.state_store")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.state_store' has no attribute {name!r}")

from research.artifacts.state_store import *  # noqa: F401, F403
