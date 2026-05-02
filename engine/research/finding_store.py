# backward-compat shim: research.finding_store → research.artifacts.finding_store
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.finding_store"
_alias = "research.finding_store"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.finding_store" or "from research import finding_store"
# will get the SAME object as "import research.artifacts.finding_store"
_sys.modules[_alias] = _target

# Still export everything for "from research.finding_store import ..." style
from research.artifacts.finding_store import *  # noqa: F401, F403
