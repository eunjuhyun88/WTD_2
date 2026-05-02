# backward-compat shim: research.capture_benchmark → research.artifacts.capture_benchmark
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.capture_benchmark"
_alias = "research.capture_benchmark"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.capture_benchmark" or "from research import capture_benchmark"
# will get the SAME object as "import research.artifacts.capture_benchmark"
_sys.modules[_alias] = _target

# Still export everything for "from research.capture_benchmark import ..." style
from research.artifacts.capture_benchmark import *  # noqa: F401, F403
