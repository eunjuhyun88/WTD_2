# backward-compat shim: research.live_monitor → research.discovery.live_monitor
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.live_monitor"
_alias = "research.live_monitor"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.live_monitor" or "from research import live_monitor"
# will get the SAME object as "import research.discovery.live_monitor"
_sys.modules[_alias] = _target

# Still export everything for "from research.live_monitor import ..." style
from research.discovery.live_monitor import *  # noqa: F401, F403
