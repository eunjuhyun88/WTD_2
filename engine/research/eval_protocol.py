# backward-compat shim: research.eval_protocol → research.validation.eval_protocol
import importlib as _il
_target = _il.import_module("research.validation.eval_protocol")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.eval_protocol' has no attribute {name!r}")

from research.validation.eval_protocol import *  # noqa: F401, F403
