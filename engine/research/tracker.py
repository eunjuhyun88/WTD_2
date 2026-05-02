# backward-compat shim: research.tracker → research.artifacts.tracker
import importlib as _il
_target = _il.import_module("research.artifacts.tracker")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.tracker' has no attribute {name!r}")

from research.artifacts.tracker import *  # noqa: F401, F403
