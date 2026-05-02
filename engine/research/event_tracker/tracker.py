# backward-compat shim: research.event_tracker.tracker → research.discovery.event_tracker.tracker
import importlib as _il
_target = _il.import_module("research.discovery.event_tracker.tracker")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.event_tracker.tracker' has no attribute {name!r}")

from research.discovery.event_tracker.tracker import *  # noqa: F401, F403
