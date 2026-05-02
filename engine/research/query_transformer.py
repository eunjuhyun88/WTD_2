# backward-compat shim: research.query_transformer → research.discovery.query_transformer
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.query_transformer"
_alias = "research.query_transformer"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.query_transformer" or "from research import query_transformer"
# will get the SAME object as "import research.discovery.query_transformer"
_sys.modules[_alias] = _target

# Still export everything for "from research.query_transformer import ..." style
from research.discovery.query_transformer import *  # noqa: F401, F403
