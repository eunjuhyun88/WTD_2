"""Single best proposer selection."""
from __future__ import annotations
from engine.research.proposer.schemas import ChangeProposal

class SingleStrategy:
    """Select single best proposal."""
    async def propose(self, rules_before: dict) -> list[ChangeProposal]:
        """TODO: Phase 6 implementation."""
        return []
