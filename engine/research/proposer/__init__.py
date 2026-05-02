# backward-compat shim package: research.proposer → research.discovery.proposer
import importlib as _il

def __getattr__(name):
    _target = _il.import_module("research.discovery.proposer")
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.proposer' has no attribute {name!r}")

from research.discovery.proposer import *  # noqa: F401, F403
