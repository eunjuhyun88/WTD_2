# backward-compat shim: research.discovery_agent → research.discovery.discovery_agent
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.discovery_agent"
_alias = "research.discovery_agent"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.discovery_agent" or "from research import discovery_agent"
# will get the SAME object as "import research.discovery.discovery_agent"
_sys.modules[_alias] = _target

# Still export everything for "from research.discovery_agent import ..." style
from research.discovery.discovery_agent import *  # noqa: F401, F403
