# backward-compat shim: research.state_store → research.artifacts.state_store
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.state_store"
_alias = "research.state_store"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.state_store" or "from research import state_store"
# will get the SAME object as "import research.artifacts.state_store"
_sys.modules[_alias] = _target

# Still export everything for "from research.state_store import ..." style
from research.artifacts.state_store import *  # noqa: F401, F403
