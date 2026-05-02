# backward-compat shim: research.experiment → research.ensemble.experiment
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.ensemble.experiment"
_alias = "research.experiment"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.experiment" or "from research import experiment"
# will get the SAME object as "import research.ensemble.experiment"
_sys.modules[_alias] = _target

# Still export everything for "from research.experiment import ..." style
from research.ensemble.experiment import *  # noqa: F401, F403
