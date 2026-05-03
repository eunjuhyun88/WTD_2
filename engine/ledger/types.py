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

from patterns.definition_refs import build_definition_ref, definition_id_from_ref

Outcome = Literal["success", "failure", "timeout", "pending"]
LedgerRecordType = Literal["entry", "capture", "score", "outcome", "verdict", "training_run", "model", "phase_attempt"]

@dataclass
class PatternOutcome:
    """One instance of a pattern playing out."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    pattern_slug: str = ""
    pattern_version: int | None = None
    definition_id: str | None = None
    definition_ref: dict | None = None
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
    user_verdict: Literal["valid", "invalid", "near_miss", "too_early", "too_late"] | None = None
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
    entry_model_key: str | None = None
    entry_model_version: str | None = None
    entry_rollout_state: Literal["candidate", "active"] | None = None
    entry_threshold: float | None = None
    entry_threshold_passed: bool | None = None
    entry_ml_error: str | None = None

    # v4: Verdict-provided entry/stop/target (W-0392)
    verdict_entry: float | None = None       # AI verdict entry price (overrides pattern)
    verdict_stop: float | None = None        # AI verdict stop loss price
    verdict_target: float | None = None      # AI verdict target price

    # v2: Evaluation config
    evaluation_window_hours: float = 72.0    # configurable per pattern

    created_at: datetime = field(default_factory=lambda: datetime.now())
    updated_at: datetime = field(default_factory=lambda: datetime.now())

    def __post_init__(self) -> None:
        if (
            self.pattern_version is None
            and not isinstance(self.definition_ref, dict)
            and self.definition_id is None
        ):
            return
        resolved_ref = build_definition_ref(
            self.pattern_slug,
            self.pattern_version,
            existing=self.definition_ref if isinstance(self.definition_ref, dict) else None,
        )
        resolved_id = self.definition_id or definition_id_from_ref(resolved_ref)
        if self.pattern_version is None and isinstance(resolved_ref.get("pattern_version"), int):
            self.pattern_version = int(resolved_ref["pattern_version"])
        if resolved_id is not None:
            self.definition_id = resolved_id
        if resolved_ref:
            self.definition_ref = resolved_ref

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


@dataclass
class PatternLedgerRecord:
    """Append-only record family for the pattern core loop."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    record_type: LedgerRecordType = "entry"
    pattern_slug: str = ""
    symbol: str | None = None
    user_id: str | None = None
    outcome_id: str | None = None
    capture_id: str | None = None
    transition_id: str | None = None
    scan_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now())
    payload: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        if isinstance(d["created_at"], datetime):
            d["created_at"] = d["created_at"].isoformat()
        return d


# ── Typed ledger planes (W-0118 Slice 5) ────────────────────────────────────
# One typed dataclass per record_type. PatternOutcome remains the canonical
# in-memory aggregate; these are typed read-models for each plane.

@dataclass
class EntryPayload:
    """Typed payload for record_type='entry'."""
    accumulation_at: str | None = None
    entry_price: float | None = None
    btc_trend_at_entry: str | None = None
    entry_block_coverage: float | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "EntryPayload":
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass
class ScorePayload:
    """Typed payload for record_type='score'."""
    entry_p_win: float | None = None
    entry_ml_state: str | None = None
    entry_model_key: str | None = None
    entry_model_version: str | None = None
    entry_rollout_state: str | None = None
    entry_threshold: float | None = None
    entry_threshold_passed: bool | None = None
    entry_ml_error: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "ScorePayload":
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass
class OutcomePayload:
    """Typed payload for record_type='outcome'."""
    outcome: str | None = None
    previous_outcome: str | None = None
    breakout_at: str | None = None
    invalidated_at: str | None = None
    peak_price: float | None = None
    exit_price: float | None = None
    max_gain_pct: float | None = None
    exit_return_pct: float | None = None
    duration_hours: float | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "OutcomePayload":
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass
class VerdictPayload:
    """Typed payload for record_type='verdict'."""
    user_verdict: str | None = None
    user_note: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "VerdictPayload":
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass
class ModelPayload:
    """Typed payload for record_type='model'."""
    model_version: str | None = None
    model_key: str | None = None
    timeframe: str | None = None
    target_name: str | None = None
    feature_schema_version: int | None = None
    label_policy_version: int | None = None
    threshold_policy_version: int | None = None
    rollout_state: str | None = None
    promotion_event: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "ModelPayload":
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass
class TrainingRunPayload:
    """Typed payload for record_type='training_run'."""
    model_key: str | None = None
    auc: float | None = None
    n_records: int | None = None
    target_name: str | None = None
    feature_schema_version: int | None = None
    label_policy_version: int | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "TrainingRunPayload":
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass
class PatternLedgerFamilyStats:
    pattern_slug: str
    entry_count: int
    capture_count: int
    score_count: int
    outcome_count: int
    verdict_count: int
    phase_attempt_count: int
    training_run_count: int
    model_count: int
    capture_to_entry_rate: float | None
    verdict_to_entry_rate: float | None
