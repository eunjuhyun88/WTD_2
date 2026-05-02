# backward-compat shim: research.objectives → research.validation.objectives
import importlib as _il
_target = _il.import_module("research.validation.objectives")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.objectives' has no attribute {name!r}")

from research.validation.objectives import *  # noqa: F401, F403
