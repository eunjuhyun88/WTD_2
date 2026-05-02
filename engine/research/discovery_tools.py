# backward-compat shim: research.discovery_tools → research.discovery.discovery_tools
import importlib as _il
_target = _il.import_module("research.discovery.discovery_tools")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.discovery_tools' has no attribute {name!r}")

from research.discovery.discovery_tools import *  # noqa: F401, F403
