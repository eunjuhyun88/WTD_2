# backward-compat shim: research.feature_windows_supabase → research.artifacts.feature_windows_supabase
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.artifacts.feature_windows_supabase"
_alias = "research.feature_windows_supabase"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.feature_windows_supabase" or "from research import feature_windows_supabase"
# will get the SAME object as "import research.artifacts.feature_windows_supabase"
_sys.modules[_alias] = _target

# Still export everything for "from research.feature_windows_supabase import ..." style
from research.artifacts.feature_windows_supabase import *  # noqa: F401, F403
