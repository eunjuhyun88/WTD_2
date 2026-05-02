# backward-compat shim: research.eval_protocol → research.validation.eval_protocol
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.validation.eval_protocol"
_alias = "research.eval_protocol"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.eval_protocol" or "from research import eval_protocol"
# will get the SAME object as "import research.validation.eval_protocol"
_sys.modules[_alias] = _target

# Still export everything for "from research.eval_protocol import ..." style
from research.validation.eval_protocol import *  # noqa: F401, F403
