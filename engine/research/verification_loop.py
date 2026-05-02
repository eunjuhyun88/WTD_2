# backward-compat shim: research.verification_loop → research.validation.verification_loop
import importlib as _il
_target = _il.import_module("research.validation.verification_loop")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.verification_loop' has no attribute {name!r}")

from research.validation.verification_loop import *  # noqa: F401, F403
