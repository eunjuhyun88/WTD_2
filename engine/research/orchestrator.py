# backward-compat shim: research.orchestrator → research.discovery.orchestrator
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.orchestrator"
_alias = "research.orchestrator"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.orchestrator" or "from research import orchestrator"
# will get the SAME object as "import research.discovery.orchestrator"
_sys.modules[_alias] = _target

# Still export everything for "from research.orchestrator import ..." style
from research.discovery.orchestrator import *  # noqa: F401, F403
