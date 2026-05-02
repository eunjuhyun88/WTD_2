# backward-compat shim: research.candidate_search → research.discovery.candidate_search
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.candidate_search"
_alias = "research.candidate_search"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.candidate_search" or "from research import candidate_search"
# will get the SAME object as "import research.discovery.candidate_search"
_sys.modules[_alias] = _target

# Still export everything for "from research.candidate_search import ..." style
from research.discovery.candidate_search import *  # noqa: F401, F403
