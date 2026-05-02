# backward-compat shim: research.verification_loop → research.validation.verification_loop
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.validation.verification_loop"
_alias = "research.verification_loop"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.verification_loop" or "from research import verification_loop"
# will get the SAME object as "import research.validation.verification_loop"
_sys.modules[_alias] = _target

# Still export everything for "from research.verification_loop import ..." style
from research.validation.verification_loop import *  # noqa: F401, F403
