# backward-compat shim: research.worker_control → research.discovery.worker_control
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.worker_control"
_alias = "research.worker_control"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.worker_control" or "from research import worker_control"
# will get the SAME object as "import research.discovery.worker_control"
_sys.modules[_alias] = _target

# Still export everything for "from research.worker_control import ..." style
from research.discovery.worker_control import *  # noqa: F401, F403
