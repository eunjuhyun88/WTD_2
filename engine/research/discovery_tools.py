# backward-compat shim: research.discovery_tools → research.discovery.discovery_tools
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.discovery_tools"
_alias = "research.discovery_tools"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.discovery_tools" or "from research import discovery_tools"
# will get the SAME object as "import research.discovery.discovery_tools"
_sys.modules[_alias] = _target

# Still export everything for "from research.discovery_tools import ..." style
from research.discovery.discovery_tools import *  # noqa: F401, F403
