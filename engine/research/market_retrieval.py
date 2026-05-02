# backward-compat shim: research.market_retrieval → research.ensemble.market_retrieval
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.ensemble.market_retrieval"
_alias = "research.market_retrieval"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.market_retrieval" or "from research import market_retrieval"
# will get the SAME object as "import research.ensemble.market_retrieval"
_sys.modules[_alias] = _target

# Still export everything for "from research.market_retrieval import ..." style
from research.ensemble.market_retrieval import *  # noqa: F401, F403
