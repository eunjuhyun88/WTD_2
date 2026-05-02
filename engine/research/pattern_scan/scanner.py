# backward-compat shim: research.pattern_scan.scanner → research.discovery.pattern_scan.scanner
import importlib as _il
_target = _il.import_module("research.discovery.pattern_scan.scanner")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.pattern_scan.scanner' has no attribute {name!r}")

from research.discovery.pattern_scan.scanner import *  # noqa: F401, F403
