# backward-compat shim: research.feature_catalog → research.artifacts.feature_catalog
import importlib as _il
_target = _il.import_module("research.artifacts.feature_catalog")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.feature_catalog' has no attribute {name!r}")

from research.artifacts.feature_catalog import *  # noqa: F401, F403
