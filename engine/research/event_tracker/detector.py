# backward-compat shim: research.event_tracker.detector → research.discovery.event_tracker.detector
import sys as _sys
import importlib as _il

_canonical = "research.discovery.event_tracker.detector"
_alias = "research.event_tracker.detector"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.event_tracker.detector import *  # noqa: F401, F403
