# backward-compat shim: research.event_tracker.models → research.discovery.event_tracker.models
import importlib as _il
_target = _il.import_module("research.discovery.event_tracker.models")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.event_tracker.models' has no attribute {name!r}")

from research.discovery.event_tracker.models import *  # noqa: F401, F403
