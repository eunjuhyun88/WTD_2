# backward-compat shim: research.worker_control → research.discovery.worker_control
import importlib as _il
_target = _il.import_module("research.discovery.worker_control")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.worker_control' has no attribute {name!r}")

from research.discovery.worker_control import *  # noqa: F401, F403
