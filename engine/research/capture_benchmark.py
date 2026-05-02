# backward-compat shim: research.capture_benchmark → research.artifacts.capture_benchmark
import importlib as _il
_target = _il.import_module("research.artifacts.capture_benchmark")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.capture_benchmark' has no attribute {name!r}")

from research.artifacts.capture_benchmark import *  # noqa: F401, F403
