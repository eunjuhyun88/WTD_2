# backward-compat shim: research.event_tracker.tracker → research.discovery.event_tracker.tracker
import sys as _sys
import importlib as _il

_canonical = "research.discovery.event_tracker.tracker"
_alias = "research.event_tracker.tracker"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.event_tracker.tracker import *  # noqa: F401, F403
