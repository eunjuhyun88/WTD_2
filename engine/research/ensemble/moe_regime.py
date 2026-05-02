"""Mixture of Experts by regime."""
from __future__ import annotations
from research.discovery.proposer.schemas import ChangeProposal

class MoERegimeStrategy:
    """MoE routing by market regime."""
    async def propose(self, rules_before: dict) -> list[ChangeProposal]:
        """TODO: Phase 6 implementation."""
        return []
