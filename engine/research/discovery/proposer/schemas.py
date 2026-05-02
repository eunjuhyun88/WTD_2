"""Pydantic schemas for autoresearch proposals."""
from __future__ import annotations

import hashlib
import json
from typing import Optional

from pydantic import BaseModel, Field


class FilterRule(BaseModel):
    """Single filter rule in active.yaml."""

    name: str = Field(..., min_length=1, max_length=64)
    expr: str = Field(..., min_length=1, max_length=256)
    enabled: bool = True
    rationale: Optional[str] = None


class Thresholds(BaseModel):
    """Validation gate thresholds."""

    GATE_MIN_SIGNALS: int = Field(ge=5, le=1000)
    GATE_MIN_HIT_RATE: float = Field(ge=0, le=1)
    GATE_MIN_T_STAT: float = Field(ge=0)
    GATE_MIN_SHARPE: float = Field(ge=-2, le=5)
    GATE_MAX_DRAWDOWN: float = Field(ge=0, le=1)
    PROMOTE_SHARPE: float
    PROMOTE_DSR: float
    PROMOTE_DSR_DELTA: float = Field(ge=0)


class RegimeWeights(BaseModel):
    """Market regime weights for weighting results."""

    bull: float = Field(ge=0, le=2)
    bear: float = Field(ge=0, le=2)
    sideways: float = Field(ge=0, le=2)


class ActiveRules(BaseModel):
    """Full active.yaml structure."""

    schema_version: int = 1
    last_modified_at: str
    last_modified_by: str
    last_commit_sha: str
    filters: list[FilterRule]
    thresholds: Thresholds
    regime_weights: RegimeWeights


class ChangeProposal(BaseModel):
    """Single proposal for rule changes."""

    rationale: str = Field(..., min_length=10, max_length=500)
    rules_after: ActiveRules
    expected_dsr_delta: float = Field(ge=-1, le=1)

    proposer_track: Optional[str] = None
    score: Optional[float] = None
    dsr_delta: Optional[float] = None
    diff_summary: Optional[str] = None

    def signature(self) -> str:
        """Canonical hash of rules_after for deduplication."""
        canonical = json.dumps(
            self.rules_after.dict(),
            sort_keys=True,
        )
        return hashlib.sha256(canonical.encode()).hexdigest()[:16]


class ProposalBatch(BaseModel):
    """Batch of proposals from a single track."""

    proposals: list[ChangeProposal] = Field(..., min_length=1, max_length=20)
