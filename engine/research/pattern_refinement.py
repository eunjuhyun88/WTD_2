# backward-compat shim: research.pattern_refinement → research.ensemble.pattern_refinement
import importlib as _il
_target = _il.import_module("research.ensemble.pattern_refinement")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.pattern_refinement' has no attribute {name!r}")

from research.ensemble.pattern_refinement import *  # noqa: F401, F403
