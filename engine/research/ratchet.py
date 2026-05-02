# backward-compat shim: research.ratchet → research.validation.ratchet
import importlib as _il
_target = _il.import_module("research.validation.ratchet")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.ratchet' has no attribute {name!r}")

from research.validation.ratchet import *  # noqa: F401, F403
