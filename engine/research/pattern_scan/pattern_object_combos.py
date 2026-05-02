# backward-compat shim: research.pattern_scan.pattern_object_combos → research.discovery.pattern_scan.pattern_object_combos
import sys as _sys
import importlib as _il

_canonical = "research.discovery.pattern_scan.pattern_object_combos"
_alias = "research.pattern_scan.pattern_object_combos"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.pattern_scan.pattern_object_combos import *  # noqa: F401, F403
