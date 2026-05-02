# backward-compat shim: research.pattern_discovery_agent → research.discovery.pattern_discovery_agent
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.pattern_discovery_agent"
_alias = "research.pattern_discovery_agent"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.pattern_discovery_agent" or "from research import pattern_discovery_agent"
# will get the SAME object as "import research.discovery.pattern_discovery_agent"
_sys.modules[_alias] = _target

# Still export everything for "from research.pattern_discovery_agent import ..." style
from research.discovery.pattern_discovery_agent import *  # noqa: F401, F403
