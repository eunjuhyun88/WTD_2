# backward-compat shim package: research.pattern_scan → research.discovery.pattern_scan
import importlib as _il

def __getattr__(name):
    _target = _il.import_module("research.discovery.pattern_scan")
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.pattern_scan' has no attribute {name!r}")

from research.discovery.pattern_scan import *  # noqa: F401, F403
