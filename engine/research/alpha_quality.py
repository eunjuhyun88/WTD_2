# backward-compat shim: research.alpha_quality → research.validation.alpha_quality
import importlib as _il
_target = _il.import_module("research.validation.alpha_quality")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.alpha_quality' has no attribute {name!r}")

from research.validation.alpha_quality import *  # noqa: F401, F403
