# backward-compat shim: research.blocked_candidate_store → research.artifacts.blocked_candidate_store
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.blocked_candidate_store"
_alias = "research.blocked_candidate_store"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.blocked_candidate_store" or "from research import blocked_candidate_store"
# will get the SAME object as "import research.artifacts.blocked_candidate_store"
_sys.modules[_alias] = _target

# Still export everything for "from research.blocked_candidate_store import ..." style
from research.artifacts.blocked_candidate_store import *  # noqa: F401, F403
