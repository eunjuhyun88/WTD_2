# backward-compat shim package: research.event_tracker → research.discovery.event_tracker
import sys as _sys
import importlib as _il

_canonical = "research.discovery.event_tracker"
_alias = "research.event_tracker"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.event_tracker import *  # noqa: F401, F403
