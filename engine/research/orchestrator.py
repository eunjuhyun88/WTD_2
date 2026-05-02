# backward-compat shim: research.orchestrator → research.discovery.orchestrator
import importlib as _il
_target = _il.import_module("research.discovery.orchestrator")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.orchestrator' has no attribute {name!r}")

from research.discovery.orchestrator import *  # noqa: F401, F403
