# backward-compat shim: research.paradigm_framework → research.discovery.paradigm_framework
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.paradigm_framework"
_alias = "research.paradigm_framework"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.paradigm_framework" or "from research import paradigm_framework"
# will get the SAME object as "import research.discovery.paradigm_framework"
_sys.modules[_alias] = _target

# Still export everything for "from research.paradigm_framework import ..." style
from research.discovery.paradigm_framework import *  # noqa: F401, F403
