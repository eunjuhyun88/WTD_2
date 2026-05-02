# backward-compat shim: research.ratchet → research.validation.ratchet
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.validation.ratchet"
_alias = "research.ratchet"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.ratchet" or "from research import ratchet"
# will get the SAME object as "import research.validation.ratchet"
_sys.modules[_alias] = _target

# Still export everything for "from research.ratchet import ..." style
from research.validation.ratchet import *  # noqa: F401, F403
