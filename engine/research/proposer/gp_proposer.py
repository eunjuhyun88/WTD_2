# backward-compat shim: research.proposer.gp_proposer → research.discovery.proposer.gp_proposer
import sys as _sys
import importlib as _il

_canonical = "research.discovery.proposer.gp_proposer"
_alias = "research.proposer.gp_proposer"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.proposer.gp_proposer import *  # noqa: F401, F403
