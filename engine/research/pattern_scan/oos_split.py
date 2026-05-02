# backward-compat shim: research.pattern_scan.oos_split → research.discovery.pattern_scan.oos_split
import sys as _sys
import importlib as _il

_canonical = "research.discovery.pattern_scan.oos_split"
_alias = "research.pattern_scan.oos_split"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.pattern_scan.oos_split import *  # noqa: F401, F403
