# backward-compat shim package: research.proposer → research.discovery.proposer
import sys as _sys
import importlib as _il

_canonical = "research.discovery.proposer"
_alias = "research.proposer"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.proposer import *  # noqa: F401, F403
