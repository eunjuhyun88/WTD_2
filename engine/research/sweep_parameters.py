# backward-compat shim: research.sweep_parameters → research.discovery.sweep_parameters
import importlib as _il
_target = _il.import_module("research.discovery.sweep_parameters")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.sweep_parameters' has no attribute {name!r}")

from research.discovery.sweep_parameters import *  # noqa: F401, F403
