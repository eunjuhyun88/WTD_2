# backward-compat shim: research.blocked_patterns → research.artifacts.blocked_patterns
import importlib as _il
_target = _il.import_module("research.artifacts.blocked_patterns")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.blocked_patterns' has no attribute {name!r}")

from research.artifacts.blocked_patterns import *  # noqa: F401, F403
