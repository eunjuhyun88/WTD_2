"""Result Ledger types — records outcomes of PatternObject instances.

v2 improvements:
- feature_snapshot: 92-dim vector at entry for reproducibility
- evaluation_window_hours: configurable verdict evaluation period
- Expected value calculation in PatternStats
- BTC-conditional stats in PatternStats
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Literal
import uuid

Outcome = Literal["success", "failure", "timeout", "pending"]

@dataclass
class PatternOutcome:
    """One instance of a pattern playing out."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    pattern_slug: str = ""
    symbol: str = ""
    user_id: str | None = None

    # Timeline
    phase2_at: datetime | None = None        # REAL_DUMP detected
    accumulation_at: datetime | None = None  # ACCUMULATION entered (entry signal)
    breakout_at: datetime | None = None      # BREAKOUT detected (success)
    invalidated_at: datetime | None = None

    # Prices
    phase2_price: float | None = None
    entry_price: float | None = None         # price at ACCUMULATION entry
    peak_price: float | None = None          # highest after entry
    exit_price: float | None = None          # price at evaluation window close
    invalidation_price: float | None = None

    # Result
    outcome: Outcome = "pending"
    max_gain_pct: float | None = None        # (peak - entry) / entry
    exit_return_pct: float | None = None     # (exit - entry) / entry
    duration_hours: float | None = None

    # Market context
    btc_trend_at_entry: str = "unknown"      # "bullish" | "bearish" | "sideways"

    # User feedback
    user_verdict: Literal["valid", "invalid", "missed"] | None = None
    user_note: str | None = None

    # v2: Feature snapshot for reproducibility
    feature_snapshot: dict | None = None     # 92-dim features at entry
    entry_transition_id: str | None = None   # durable phase_transitions.transition_id
    entry_scan_id: str | None = None
    entry_block_scores: dict | None = None

    # v3: Entry-scoring shadow metadata
    entry_block_coverage: float | None = None
    entry_p_win: float | None = None
    entry_ml_state: Literal["scored", "untrained", "missing_snapshot", "error"] | None = None
    entry_model_version: str | None = None
    entry_threshold: float | None = None
    entry_threshold_passed: bool | None = None
    entry_ml_error: str | None = None

    # v2: Evaluation config
    evaluation_window_hours: float = 72.0    # configurable per pattern

    created_at: datetime = field(default_factory=lambda: datetime.now())
    updated_at: datetime = field(default_factory=lambda: datetime.now())

    def to_dict(self) -> dict:
        d = asdict(self)
        for k, v in d.items():
            if isinstance(v, datetime):
                d[k] = v.isoformat()
        return d


@dataclass
class PatternStats:
    """Aggregated stats for a pattern.

    v2: includes expected_value, avg_loss, btc-conditional rates, decay analysis.
    """
    pattern_slug: str
    total_instances: int
    pending_count: int
    success_count: int
    failure_count: int
    success_rate: float             # success / (success + failure)
    avg_gain_pct: float | None      # avg of successful max_gain_pct
    avg_loss_pct: float | None      # avg of failure exit_return_pct (negative)
    expected_value: float | None    # success_rate * avg_gain + failure_rate * avg_loss
    avg_duration_hours: float | None
    recent_30d_count: int
    recent_30d_success_rate: float | None
    # v2: BTC-conditional stats
    btc_bullish_rate: float | None
    btc_bearish_rate: float | None
    btc_sideways_rate: float | None
    # v2: Edge decay — is the pattern losing effectiveness?
    decay_direction: str | None     # "improving" | "stable" | "decaying" | None
