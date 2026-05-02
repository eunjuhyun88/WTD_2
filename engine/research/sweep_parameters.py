# backward-compat shim: research.sweep_parameters → research.discovery.sweep_parameters
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.sweep_parameters"
_alias = "research.sweep_parameters"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.sweep_parameters" or "from research import sweep_parameters"
# will get the SAME object as "import research.discovery.sweep_parameters"
_sys.modules[_alias] = _target

# Still export everything for "from research.sweep_parameters import ..." style
from research.discovery.sweep_parameters import *  # noqa: F401, F403
