# backward-compat shim: research.alpha_quality → research.validation.alpha_quality
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.validation.alpha_quality"
_alias = "research.alpha_quality"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.alpha_quality" or "from research import alpha_quality"
# will get the SAME object as "import research.validation.alpha_quality"
_sys.modules[_alias] = _target

# Still export everything for "from research.alpha_quality import ..." style
from research.validation.alpha_quality import *  # noqa: F401, F403
