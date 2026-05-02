# backward-compat shim: research.manual_hypothesis_pack_builder → research.discovery.manual_hypothesis_pack_builder
import importlib as _il
_target = _il.import_module("research.discovery.manual_hypothesis_pack_builder")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.manual_hypothesis_pack_builder' has no attribute {name!r}")

from research.discovery.manual_hypothesis_pack_builder import *  # noqa: F401, F403
