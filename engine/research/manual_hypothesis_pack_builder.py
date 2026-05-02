# backward-compat shim: research.manual_hypothesis_pack_builder → research.discovery.manual_hypothesis_pack_builder
# Uses sys.modules alias for full transparency (monkeypatch/mock compatibility)
import sys as _sys
import importlib as _il

_canonical = "research.discovery.manual_hypothesis_pack_builder"
_alias = "research.manual_hypothesis_pack_builder"

# Ensure the canonical module is loaded
_target = _il.import_module(_canonical)

# Replace this module in sys.modules with the canonical one
# This means "import research.manual_hypothesis_pack_builder" or "from research import manual_hypothesis_pack_builder"
# will get the SAME object as "import research.discovery.manual_hypothesis_pack_builder"
_sys.modules[_alias] = _target

# Still export everything for "from research.manual_hypothesis_pack_builder import ..." style
from research.discovery.manual_hypothesis_pack_builder import *  # noqa: F401, F403
