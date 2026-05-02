# backward-compat shim: research.objectives → research.validation.objectives
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.validation.objectives"
_alias = "research.objectives"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.objectives" or "from research import objectives"
# will get the SAME object as "import research.validation.objectives"
_sys.modules[_alias] = _target

# Still export everything for "from research.objectives import ..." style
from research.validation.objectives import *  # noqa: F401, F403
