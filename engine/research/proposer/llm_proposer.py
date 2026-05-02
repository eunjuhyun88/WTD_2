# backward-compat shim: research.proposer.llm_proposer → research.discovery.proposer.llm_proposer
import sys as _sys
import importlib as _il

_canonical = "research.discovery.proposer.llm_proposer"
_alias = "research.proposer.llm_proposer"

_target = _il.import_module(_canonical)
_sys.modules[_alias] = _target

from research.discovery.proposer.llm_proposer import *  # noqa: F401, F403
