# backward-compat shim: research.event_tracker.pack_builder → research.discovery.event_tracker.pack_builder
import importlib as _il
_target = _il.import_module("research.discovery.event_tracker.pack_builder")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.event_tracker.pack_builder' has no attribute {name!r}")

from research.discovery.event_tracker.pack_builder import *  # noqa: F401, F403
