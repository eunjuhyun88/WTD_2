# backward-compat shim: research.pattern_scan.oos_split → research.discovery.pattern_scan.oos_split
import importlib as _il
_target = _il.import_module("research.discovery.pattern_scan.oos_split")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.pattern_scan.oos_split' has no attribute {name!r}")

from research.discovery.pattern_scan.oos_split import *  # noqa: F401, F403
