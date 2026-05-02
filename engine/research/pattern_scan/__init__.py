# backward-compat shim package: research.pattern_scan → research.discovery.pattern_scan
import sys as _sys
import importlib as _il

_canonical = "research.discovery.pattern_scan"
_alias = "research.pattern_scan"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.pattern_scan import *  # noqa: F401, F403
