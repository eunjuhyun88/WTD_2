# backward-compat shim: research.similarity_ranker → research.ensemble.similarity_ranker
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.ensemble.similarity_ranker"
_alias = "research.similarity_ranker"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.similarity_ranker" or "from research import similarity_ranker"
# will get the SAME object as "import research.ensemble.similarity_ranker"
_sys.modules[_alias] = _target

# Still export everything for "from research.similarity_ranker import ..." style
from research.ensemble.similarity_ranker import *  # noqa: F401, F403
