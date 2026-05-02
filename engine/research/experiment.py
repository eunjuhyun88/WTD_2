# backward-compat shim: research.experiment → research.ensemble.experiment
import importlib as _il
_target = _il.import_module("research.ensemble.experiment")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.experiment' has no attribute {name!r}")

from research.ensemble.experiment import *  # noqa: F401, F403
