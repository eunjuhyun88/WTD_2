# backward-compat shim: research.discovery_agent → research.discovery.discovery_agent
import importlib as _il
_target = _il.import_module("research.discovery.discovery_agent")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.discovery_agent' has no attribute {name!r}")

from research.discovery.discovery_agent import *  # noqa: F401, F403
