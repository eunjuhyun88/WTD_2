# backward-compat shim: research.autoresearch_ledger_store → research.artifacts.autoresearch_ledger_store
import importlib as _il
_target = _il.import_module("research.artifacts.autoresearch_ledger_store")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.autoresearch_ledger_store' has no attribute {name!r}")

from research.artifacts.autoresearch_ledger_store import *  # noqa: F401, F403
