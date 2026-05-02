# backward-compat shim: research.autoresearch_runner → research.discovery.autoresearch_runner
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.autoresearch_runner"
_alias = "research.autoresearch_runner"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.autoresearch_runner" or "from research import autoresearch_runner"
# will get the SAME object as "import research.discovery.autoresearch_runner"
_sys.modules[_alias] = _target

# Still export everything for "from research.autoresearch_runner import ..." style
from research.discovery.autoresearch_runner import *  # noqa: F401, F403
