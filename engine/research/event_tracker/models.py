# backward-compat shim: research.event_tracker.models → research.discovery.event_tracker.models
import sys as _sys
import importlib as _il

_canonical = "research.discovery.event_tracker.models"
_alias = "research.event_tracker.models"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.event_tracker.models import *  # noqa: F401, F403
