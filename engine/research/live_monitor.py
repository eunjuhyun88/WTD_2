# backward-compat shim: research.live_monitor → research.discovery.live_monitor
import importlib as _il
_target = _il.import_module("research.discovery.live_monitor")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.live_monitor' has no attribute {name!r}")

from research.discovery.live_monitor import *  # noqa: F401, F403
