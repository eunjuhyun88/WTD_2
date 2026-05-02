# backward-compat shim: research.autoresearch_ledger_store → research.artifacts.autoresearch_ledger_store
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.autoresearch_ledger_store"
_alias = "research.autoresearch_ledger_store"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.autoresearch_ledger_store" or "from research import autoresearch_ledger_store"
# will get the SAME object as "import research.artifacts.autoresearch_ledger_store"
_sys.modules[_alias] = _target

# Still export everything for "from research.autoresearch_ledger_store import ..." style
from research.artifacts.autoresearch_ledger_store import *  # noqa: F401, F403
