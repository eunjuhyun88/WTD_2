# backward-compat shim: research.backtest → research.ensemble.backtest
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.ensemble.backtest"
_alias = "research.backtest"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.backtest" or "from research import backtest"
# will get the SAME object as "import research.ensemble.backtest"
_sys.modules[_alias] = _target

# Still export everything for "from research.backtest import ..." style
from research.ensemble.backtest import *  # noqa: F401, F403
