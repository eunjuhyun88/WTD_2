# backward-compat shim: research.feature_windows → research.artifacts.feature_windows
import importlib as _il
_target = _il.import_module("research.artifacts.feature_windows")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.feature_windows' has no attribute {name!r}")

from research.artifacts.feature_windows import *  # noqa: F401, F403
