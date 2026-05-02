# backward-compat shim: research.feature_windows_supabase → research.artifacts.feature_windows_supabase
import importlib as _il
_target = _il.import_module("research.artifacts.feature_windows_supabase")

def __getattr__(name):
    try:
        return getattr(_target, name)
    except AttributeError:
        raise AttributeError(f"module 'research.feature_windows_supabase' has no attribute {name!r}")

from research.artifacts.feature_windows_supabase import *  # noqa: F401, F403
