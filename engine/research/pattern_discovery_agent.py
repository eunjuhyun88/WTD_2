# backward-compat shim: research.pattern_discovery_agent → research.discovery.pattern_discovery_agent
import importlib as _il
_target = _il.import_module("research.discovery.pattern_discovery_agent")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.pattern_discovery_agent' has no attribute {name!r}")

from research.discovery.pattern_discovery_agent import *  # noqa: F401, F403
