# backward-compat shim: research.proposer.llm_proposer → research.discovery.proposer.llm_proposer
import importlib as _il
_target = _il.import_module("research.discovery.proposer.llm_proposer")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.proposer.llm_proposer' has no attribute {name!r}")

from research.discovery.proposer.llm_proposer import *  # noqa: F401, F403
