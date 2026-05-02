# backward-compat shim: research.autoresearch_runner → research.discovery.autoresearch_runner
import importlib as _il
_target = _il.import_module("research.discovery.autoresearch_runner")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.autoresearch_runner' has no attribute {name!r}")

from research.discovery.autoresearch_runner import *  # noqa: F401, F403
