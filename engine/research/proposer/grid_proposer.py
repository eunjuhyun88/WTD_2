# backward-compat shim: research.proposer.grid_proposer → research.discovery.proposer.grid_proposer
import sys as _sys
import importlib as _il

_canonical = "research.discovery.proposer.grid_proposer"
_alias = "research.proposer.grid_proposer"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.proposer.grid_proposer import *  # noqa: F401, F403
