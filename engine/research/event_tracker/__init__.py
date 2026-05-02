# backward-compat shim package: research.event_tracker → research.discovery.event_tracker
import importlib as _il

def __getattr__(name):
    _target = _il.import_module("research.discovery.event_tracker")
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.event_tracker' has no attribute {name!r}")

from research.discovery.event_tracker import *  # noqa: F401, F403
