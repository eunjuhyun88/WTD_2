# backward-compat shim: research.feature_windows_builder → research.artifacts.feature_windows_builder
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.feature_windows_builder"
_alias = "research.feature_windows_builder"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.feature_windows_builder" or "from research import feature_windows_builder"
# will get the SAME object as "import research.artifacts.feature_windows_builder"
_sys.modules[_alias] = _target

# Still export everything for "from research.feature_windows_builder import ..." style
from research.artifacts.feature_windows_builder import *  # noqa: F401, F403
