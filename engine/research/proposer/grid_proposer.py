# backward-compat shim: research.proposer.grid_proposer → research.discovery.proposer.grid_proposer
import importlib as _il
_target = _il.import_module("research.discovery.proposer.grid_proposer")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.proposer.grid_proposer' has no attribute {name!r}")

from research.discovery.proposer.grid_proposer import *  # noqa: F401, F403
