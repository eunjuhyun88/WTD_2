# backward-compat shim: research.event_tracker.pack_builder → research.discovery.event_tracker.pack_builder
import sys as _sys
import importlib as _il

_canonical = "research.discovery.event_tracker.pack_builder"
_alias = "research.event_tracker.pack_builder"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.event_tracker.pack_builder import *  # noqa: F401, F403
