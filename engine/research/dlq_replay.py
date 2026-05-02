# backward-compat shim: research.dlq_replay → research.artifacts.dlq_replay
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.dlq_replay"
_alias = "research.dlq_replay"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.dlq_replay" or "from research import dlq_replay"
# will get the SAME object as "import research.artifacts.dlq_replay"
_sys.modules[_alias] = _target

# Still export everything for "from research.dlq_replay import ..." style
from research.artifacts.dlq_replay import *  # noqa: F401, F403
