# backward-compat shim: research.feature_catalog → research.artifacts.feature_catalog
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.feature_catalog"
_alias = "research.feature_catalog"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.feature_catalog" or "from research import feature_catalog"
# will get the SAME object as "import research.artifacts.feature_catalog"
_sys.modules[_alias] = _target

# Still export everything for "from research.feature_catalog import ..." style
from research.artifacts.feature_catalog import *  # noqa: F401, F403
