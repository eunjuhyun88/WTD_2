# backward-compat shim: research.autoresearch_loop → research.discovery.autoresearch_loop
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.autoresearch_loop"
_alias = "research.autoresearch_loop"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.autoresearch_loop" or "from research import autoresearch_loop"
# will get the SAME object as "import research.discovery.autoresearch_loop"
_sys.modules[_alias] = _target

# Still export everything for "from research.autoresearch_loop import ..." style
from research.discovery.autoresearch_loop import *  # noqa: F401, F403
