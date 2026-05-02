# backward-compat shim: research.dlq_replay → research.artifacts.dlq_replay
import importlib as _il
_target = _il.import_module("research.artifacts.dlq_replay")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.dlq_replay' has no attribute {name!r}")

from research.artifacts.dlq_replay import *  # noqa: F401, F403
