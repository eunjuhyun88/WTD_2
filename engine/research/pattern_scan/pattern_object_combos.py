# backward-compat shim: research.pattern_scan.pattern_object_combos → research.discovery.pattern_scan.pattern_object_combos
import importlib as _il
_target = _il.import_module("research.discovery.pattern_scan.pattern_object_combos")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.pattern_scan.pattern_object_combos' has no attribute {name!r}")

from research.discovery.pattern_scan.pattern_object_combos import *  # noqa: F401, F403
