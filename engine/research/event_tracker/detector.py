# backward-compat shim: research.event_tracker.detector → research.discovery.event_tracker.detector
import importlib as _il
_target = _il.import_module("research.discovery.event_tracker.detector")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.event_tracker.detector' has no attribute {name!r}")

from research.discovery.event_tracker.detector import *  # noqa: F401, F403
