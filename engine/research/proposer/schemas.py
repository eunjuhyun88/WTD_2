# backward-compat shim: research.proposer.schemas → research.discovery.proposer.schemas
import sys as _sys
import importlib as _il

_canonical = "research.discovery.proposer.schemas"
_alias = "research.proposer.schemas"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.proposer.schemas import *  # noqa: F401, F403
