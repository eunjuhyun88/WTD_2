# backward-compat shim: research.pattern_scan.scanner → research.discovery.pattern_scan.scanner
import sys as _sys
import importlib as _il

_canonical = "research.discovery.pattern_scan.scanner"
_alias = "research.pattern_scan.scanner"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.pattern_scan.scanner import *  # noqa: F401, F403
