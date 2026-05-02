# backward-compat shim: research.proposer.schemas → research.discovery.proposer.schemas
import importlib as _il
_target = _il.import_module("research.discovery.proposer.schemas")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.proposer.schemas' has no attribute {name!r}")

from research.discovery.proposer.schemas import *  # noqa: F401, F403
