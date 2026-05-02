# backward-compat shim: research.backtest_cache → research.ensemble.backtest_cache
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.ensemble.backtest_cache"
_alias = "research.backtest_cache"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.backtest_cache" or "from research import backtest_cache"
# will get the SAME object as "import research.ensemble.backtest_cache"
_sys.modules[_alias] = _target

# Still export everything for "from research.backtest_cache import ..." style
from research.ensemble.backtest_cache import *  # noqa: F401, F403
