# backward-compat shim: research.paradigm_framework → research.discovery.paradigm_framework
import importlib as _il
_target = _il.import_module("research.discovery.paradigm_framework")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.paradigm_framework' has no attribute {name!r}")

from research.discovery.paradigm_framework import *  # noqa: F401, F403
