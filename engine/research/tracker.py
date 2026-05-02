# backward-compat shim: research.tracker → research.artifacts.tracker
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.tracker"
_alias = "research.tracker"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.tracker" or "from research import tracker"
# will get the SAME object as "import research.artifacts.tracker"
_sys.modules[_alias] = _target

# Still export everything for "from research.tracker import ..." style
from research.artifacts.tracker import *  # noqa: F401, F403
