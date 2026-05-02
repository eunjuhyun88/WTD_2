# backward-compat shim: research.pattern_refinement → research.ensemble.pattern_refinement
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.ensemble.pattern_refinement"
_alias = "research.pattern_refinement"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.pattern_refinement" or "from research import pattern_refinement"
# will get the SAME object as "import research.ensemble.pattern_refinement"
_sys.modules[_alias] = _target

# Still export everything for "from research.pattern_refinement import ..." style
from research.ensemble.pattern_refinement import *  # noqa: F401, F403
