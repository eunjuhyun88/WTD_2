# backward-compat shim: research.similarity_ranker → research.ensemble.similarity_ranker
import importlib as _il
_target = _il.import_module("research.ensemble.similarity_ranker")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.similarity_ranker' has no attribute {name!r}")

from research.ensemble.similarity_ranker import *  # noqa: F401, F403
