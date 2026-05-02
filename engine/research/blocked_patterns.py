# backward-compat shim: research.blocked_patterns → research.artifacts.blocked_patterns
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.blocked_patterns"
_alias = "research.blocked_patterns"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.blocked_patterns" or "from research import blocked_patterns"
# will get the SAME object as "import research.artifacts.blocked_patterns"
_sys.modules[_alias] = _target

# Still export everything for "from research.blocked_patterns import ..." style
from research.artifacts.blocked_patterns import *  # noqa: F401, F403
