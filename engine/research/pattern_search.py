"""Replay-based benchmark-pack search for pattern variants."""
from __future__ import annotations

import copy
import json
import tempfile
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, pstdev
from typing import Literal

import pandas as pd

from data_cache.loader import load_klines, load_perp
from data_cache.resample import tf_string_to_minutes
from exceptions import CacheMiss
from ledger.store import LEDGER_RECORD_STORE, LedgerRecordStore
from ledger.types import PatternLedgerRecord
from patterns.active_variant_registry import (
    ACTIVE_PATTERN_VARIANT_STORE,
    ActivePatternVariantStore,
    ActivePatternVariantEntry,
    derive_watch_phases_from_pattern,
)
from patterns.library import get_pattern
from patterns.replay import replay_pattern_frames
from patterns.state_machine import PatternStateMachine
from patterns.types import PatternObject, PhaseAttemptRecord
from scanner.feature_calc import MIN_HISTORY_BARS, compute_features_table

from .state_store import ResearchRun
from .worker_control import (
    ResearchJobResult,
    ResearchJobSpec,
    ResearchMemoryInput,
    ResearchWorkerController,
    SelectionDecisionInput,
)

SEARCH_DIR = Path(__file__).resolve().parent / "pattern_search"
BENCHMARK_PACKS_DIR = SEARCH_DIR / "benchmark_packs"
SEARCH_RUNS_DIR = SEARCH_DIR / "search_runs"
NEGATIVE_MEMORY_DIR = SEARCH_DIR / "negative_memory"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _utcnow_iso() -> str:
    return _utcnow().isoformat()


def _dt(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _dt_to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _phase_path_in_order(expected: list[str], observed: list[str]) -> float:
    if not expected:
        return 0.0
    idx = 0
    matches = 0
    for phase in observed:
        while idx < len(expected) and expected[idx] != phase:
            idx += 1
        if idx < len(expected) and expected[idx] == phase:
            matches += 1
            idx += 1
    return matches / len(expected)


def _phase_depth_progress(expected: list[str], observed: list[str], current_phase: str) -> float:
    if not expected:
        return 0.0
    phase_to_idx = {phase: idx for idx, phase in enumerate(expected)}
    seen = [phase_to_idx[phase] for phase in observed if phase in phase_to_idx]
    if current_phase in phase_to_idx:
        seen.append(phase_to_idx[current_phase])
    if not seen:
        return 0.0
    return (max(seen) + 1) / len(expected)


def _dedupe_path(phases: list[str]) -> list[str]:
    deduped: list[str] = []
    for phase in phases:
        if not deduped or deduped[-1] != phase:
            deduped.append(phase)
    return deduped


def _normalized_expected_phase_path(
    expected: list[str],
    *,
    case_timeframe: str,
    variant_timeframe: str,
) -> list[str]:
    if not expected:
        return []
    case_minutes = tf_string_to_minutes(case_timeframe)
    variant_minutes = tf_string_to_minutes(variant_timeframe)
    if variant_minutes <= case_minutes:
        return list(expected)

    ratio = variant_minutes / case_minutes
    if ratio >= 4 and len(expected) >= 5:
        normalized = [expected[1], expected[3], expected[-1]]
    elif ratio >= 2 and len(expected) >= 4:
        normalized = [expected[1], expected[2], expected[3], expected[-1]]
    else:
        normalized = list(expected)

    deduped: list[str] = []
    for phase in normalized:
        if phase not in deduped:
            deduped.append(phase)
    return deduped


@dataclass(frozen=True)
class BenchmarkCase:
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    expected_phase_path: list[str]
    role: Literal["reference", "holdout"] = "reference"
    notes: list[str] = field(default_factory=list)
    case_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["start_at"] = self.start_at.isoformat()
        payload["end_at"] = self.end_at.isoformat()
        return payload

    @classmethod
    def from_dict(cls, payload: dict) -> "BenchmarkCase":
        return cls(
            symbol=payload["symbol"],
            timeframe=payload["timeframe"],
            start_at=_dt(payload["start_at"]),
            end_at=_dt(payload["end_at"]),
            expected_phase_path=list(payload["expected_phase_path"]),
            role=payload.get("role", "reference"),
            notes=list(payload.get("notes", [])),
            case_id=payload.get("case_id", str(uuid.uuid4())),
        )


@dataclass(frozen=True)
class ReplayBenchmarkPack:
    benchmark_pack_id: str
    pattern_slug: str
    candidate_timeframes: list[str]
    cases: list[BenchmarkCase]
    created_at: datetime = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        return {
            "benchmark_pack_id": self.benchmark_pack_id,
            "pattern_slug": self.pattern_slug,
            "candidate_timeframes": self.candidate_timeframes,
            "cases": [case.to_dict() for case in self.cases],
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, payload: dict) -> "ReplayBenchmarkPack":
        return cls(
            benchmark_pack_id=payload["benchmark_pack_id"],
            pattern_slug=payload["pattern_slug"],
            candidate_timeframes=list(payload.get("candidate_timeframes", [])),
            cases=[BenchmarkCase.from_dict(case) for case in payload.get("cases", [])],
            created_at=_dt(payload["created_at"]),
        )


@dataclass(frozen=True)
class PatternVariantSpec:
    pattern_slug: str
    variant_slug: str
    timeframe: str
    phase_overrides: dict[str, dict] = field(default_factory=dict)
    search_origin: str = "manual"
    selection_bias: float = 0.0
    hypotheses: list[str] = field(default_factory=list)
    variant_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    duration_scale: float = 1.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "PatternVariantSpec":
        return cls(
            pattern_slug=payload["pattern_slug"],
            variant_slug=payload["variant_slug"],
            timeframe=payload["timeframe"],
            phase_overrides=dict(payload.get("phase_overrides", {})),
            search_origin=payload.get("search_origin", "manual"),
            selection_bias=float(payload.get("selection_bias", 0.0)),
            hypotheses=list(payload.get("hypotheses", [])),
            variant_id=payload.get("variant_id", str(uuid.uuid4())),
            duration_scale=float(payload.get("duration_scale", 1.0)),
        )


@dataclass(frozen=True)
class VariantCaseResult:
    case_id: str
    symbol: str
    role: str
    observed_phase_path: list[str]
    current_phase: str
    phase_fidelity: float
    phase_depth_progress: float
    entry_hit: bool
    target_hit: bool
    lead_bars: int | None
    score: float
    failed_reason_counts: dict[str, int] = field(default_factory=dict)
    missing_block_counts: dict[str, int] = field(default_factory=dict)
    # Trading-edge measurement (W-0088). Populated when entry_hit and forward
    # bars beyond the case window are available. forward_peak_return_pct is the
    # max close-to-close return across `entry_profit_horizon_bars` after entry.
    entry_close: float | None = None
    forward_peak_return_pct: float | None = None
    # W-0086 slice #5: realistic entry price = open of bar after entry_ts,
    # with slippage applied. realistic_forward_peak_return_pct shows paper→real
    # delta; informational only (gate still uses forward_peak_return_pct).
    entry_next_open: float | None = None
    realistic_forward_peak_return_pct: float | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class VariantSearchResult:
    variant_id: str
    variant_slug: str
    reference_score: float
    holdout_score: float | None
    overall_score: float
    case_results: list[VariantCaseResult]

    def to_dict(self) -> dict:
        return {
            "variant_id": self.variant_id,
            "variant_slug": self.variant_slug,
            "reference_score": self.reference_score,
            "holdout_score": self.holdout_score,
            "overall_score": self.overall_score,
            "case_results": [case.to_dict() for case in self.case_results],
        }


@dataclass(frozen=True)
class VariantDeltaInsight:
    variant_slug: str
    base_variant_slug: str | None
    reference_delta: float
    holdout_delta: float | None
    overall_delta: float
    damage_adjusted_gain: float | None
    classification: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class MutationBranchInsight:
    anchor_variant_slug: str
    descendant_count: int
    productive_count: int
    damaging_count: int
    flat_count: int
    avg_damage_adjusted_gain: float
    best_damage_adjusted_gain: float
    best_overall_delta: float
    branch_score: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class SearchFamilyInsight:
    family_key: str
    family_type: str
    representative_variant_slug: str
    member_variant_slugs: list[str]
    best_reference_score: float
    best_holdout_score: float | None
    best_overall_score: float
    family_score: float
    classification: str

    def to_dict(self) -> dict:
        return asdict(self)


FAMILY_TYPE_PRIORITY = {
    "reset_lane": 4,
    "manual": 3,
    "auto_evidence": 2,
    "mutation_branch": 1,
    "timeframe_family": 0,
    "duration_family": 0,
}

TIMEFRAME_UPGRADE_THRESHOLD = 0.05
TIMEFRAME_AVOID_THRESHOLD = 0.05

DURATION_UPGRADE_THRESHOLD = 0.05
DURATION_AVOID_THRESHOLD = 0.05
DURATION_FAMILY_SCALES: dict[str, float] = {"short": 0.5, "long": 2.0}


@dataclass(frozen=True)
class TimeframeRecommendation:
    """Per-variant timeframe-family recommendation emitted by one search run."""

    base_variant_slug: str
    parent_timeframe: str
    recommended_timeframe: str
    parent_overall_score: float
    clone_overall_score: float
    clone_variant_slug: str
    score_delta: float
    classification: str  # "upgrade" | "keep" | "avoid"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class DurationRecommendation:
    """Per-variant duration-family recommendation emitted by one search run."""

    base_variant_slug: str
    parent_duration_scale: float
    recommended_duration_scale: float
    parent_overall_score: float
    clone_overall_score: float
    clone_variant_slug: str
    duration_label: str  # "short" | "long"
    score_delta: float
    classification: str  # "upgrade" | "keep" | "avoid"

    def to_dict(self) -> dict:
        return asdict(self)
ACTIVE_FAMILY_STICKINESS_BAND = 0.005


@dataclass(frozen=True)
class FamilySelectionPolicy:
    policy_id: str
    family_type_priority: dict[str, int]
    active_family_stickiness_band: float
    bias_mode: str = "selection_bias_v1"

    def to_dict(self) -> dict:
        return asdict(self)


DEFAULT_FAMILY_SELECTION_POLICY = FamilySelectionPolicy(
    policy_id="family-selection-v1",
    family_type_priority=dict(FAMILY_TYPE_PRIORITY),
    active_family_stickiness_band=ACTIVE_FAMILY_STICKINESS_BAND,
)


@dataclass(frozen=True)
class PromotionGatePolicy:
    """Thresholds used by ``build_promotion_report`` to decide candidate fate."""

    policy_id: str = "promotion-gate-v1"
    min_reference_recall: float = 0.5
    min_phase_fidelity: float = 0.5
    min_lead_time_bars: float = 0.0
    max_false_discovery_rate: float = 0.4
    max_robustness_spread: float = 0.3
    require_holdout_passed: bool = True
    # W-0088 trading-edge parallel path. Promotion accepts a candidate
    # whose forward return clears these thresholds even when strict
    # pattern-completion (FDR ceiling) fails. Set
    # ``min_entry_profitable_rate=None`` to disable the parallel path
    # and fall back to strict-only behaviour.
    min_entry_profit_pct: float = 5.0
    entry_profit_horizon_bars: int = 48
    min_entry_profitable_rate: float | None = 0.5

    def to_dict(self) -> dict:
        return asdict(self)


DEFAULT_PROMOTION_GATE_POLICY = PromotionGatePolicy()


@dataclass(frozen=True)
class PromotionReport:
    """Per-run promotion-gate record for the search winner.

    This is the explicit gate artifact the canonical loop needs between
    Refinement and Managed Default / User Overlay; without it, family
    promotion stays informational and nothing is ever "approved for active".
    """

    promotion_report_id: str
    pattern_slug: str
    variant_id: str
    variant_slug: str
    reference_recall: float
    phase_fidelity: float
    lead_time_bars: float
    false_discovery_rate: float
    robustness_spread: float
    holdout_passed: bool
    gate_policy: PromotionGatePolicy
    gate_results: dict[str, bool]
    decision: str  # "promote_candidate" | "reject"
    rejection_reasons: list[str]
    # W-0088 trading-edge fields. entry_profitable_rate is the fraction of
    # entered cases whose forward_peak_return_pct >= min_entry_profit_pct
    # (None when no entered cases produced measurable forward returns, i.e.
    # the metric is undefined for this winner). entry_profitable_gate is
    # True when the rate cleared min_entry_profitable_rate, False when it
    # didn't, and None when the parallel path is disabled or unmeasured.
    # decision_path is one of "strict" (all 6 original gates passed),
    # "trading_edge" (FDR waived, entry_profitable_gate True), or
    # "rejected". The 6-key gate_results dict is intentionally unchanged
    # so legacy ``all(gate_results.values())`` consumers stay correct.
    entry_profitable_rate: float | None = None
    entry_profitable_gate: bool | None = None
    decision_path: str = "rejected"
    created_at: datetime = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        return payload


@dataclass(frozen=True)
class PatternSearchRunArtifact:
    research_run_id: str
    pattern_slug: str
    benchmark_pack_id: str
    winner_variant_slug: str | None
    variant_results: list[VariantSearchResult]
    definition_ref: dict = field(default_factory=dict)
    search_query_spec: dict | None = None
    variant_specs: list[PatternVariantSpec] = field(default_factory=list)
    variant_deltas: list[VariantDeltaInsight] = field(default_factory=list)
    branch_insights: list[MutationBranchInsight] = field(default_factory=list)
    family_insights: list[SearchFamilyInsight] = field(default_factory=list)
    timeframe_recommendations: list[TimeframeRecommendation] = field(default_factory=list)
    duration_recommendations: list[DurationRecommendation] = field(default_factory=list)
    promotion_report: PromotionReport | None = None
    family_policy: FamilySelectionPolicy | None = None
    active_family_key: str | None = None
    active_family_type: str | None = None
    active_family_variant_slug: str | None = None
    created_at: datetime = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        return {
            "research_run_id": self.research_run_id,
            "pattern_slug": self.pattern_slug,
            "definition_ref": dict(self.definition_ref),
            "benchmark_pack_id": self.benchmark_pack_id,
            "winner_variant_slug": self.winner_variant_slug,
            "search_query_spec": self.search_query_spec,
            "variant_results": [result.to_dict() for result in self.variant_results],
            "variant_specs": [spec.to_dict() for spec in self.variant_specs],
            "variant_deltas": [delta.to_dict() for delta in self.variant_deltas],
            "branch_insights": [
                insight.to_dict() if hasattr(insight, "to_dict") else dict(insight)
                for insight in self.branch_insights
            ],
            "family_insights": [
                insight.to_dict() if hasattr(insight, "to_dict") else dict(insight)
                for insight in self.family_insights
            ],
            "timeframe_recommendations": [
                recommendation.to_dict() for recommendation in self.timeframe_recommendations
            ],
            "duration_recommendations": [
                recommendation.to_dict() for recommendation in self.duration_recommendations
            ],
            "promotion_report": self.promotion_report.to_dict() if self.promotion_report is not None else None,
            "family_policy": self.family_policy.to_dict() if self.family_policy is not None else None,
            "active_family_key": self.active_family_key,
            "active_family_type": self.active_family_type,
            "active_family_variant_slug": self.active_family_variant_slug,
            "created_at": self.created_at.isoformat(),
        }


@dataclass(frozen=True)
class NegativeSearchMemoryEntry:
    memory_id: str
    pattern_slug: str
    research_run_id: str
    benchmark_pack_id: str
    winner_variant_slug: str | None
    summary: str
    detail: str
    tags: list[str]
    variant_scores: list[dict[str, float | str | None]]
    family_scores: list[dict[str, float | str | None]] = field(default_factory=list)
    family_policy: dict = field(default_factory=dict)
    active_family_key: str | None = None
    active_family_type: str | None = None
    active_family_variant_slug: str | None = None
    baseline_family_ref: str | None = None
    created_at: datetime = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["created_at"] = self.created_at.isoformat()
        return payload


@dataclass(frozen=True)
class PatternBenchmarkSearchConfig:
    pattern_slug: str
    definition_id: str | None = None
    benchmark_pack_id: str | None = None
    objective_id: str | None = None
    variants: list[PatternVariantSpec] | None = None
    search_query_spec: dict | None = None
    warmup_bars: int = 240
    min_reference_score: float = 0.55
    min_holdout_score: float = 0.35


class BenchmarkPackStore:
    def __init__(self, base_dir: Path = BENCHMARK_PACKS_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, benchmark_pack_id: str) -> Path:
        return self.base_dir / f"{benchmark_pack_id}.json"

    def save(self, pack: ReplayBenchmarkPack) -> Path:
        path = self._path(pack.benchmark_pack_id)
        with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as handle:
            json.dump(pack.to_dict(), handle, indent=2)
            temp_path = Path(handle.name)
        temp_path.replace(path)
        return path

    def load(self, benchmark_pack_id: str) -> ReplayBenchmarkPack | None:
        path = self._path(benchmark_pack_id)
        if not path.exists():
            return None
        return ReplayBenchmarkPack.from_dict(json.loads(path.read_text()))

    def ensure_default_pack(self, pattern_slug: str) -> ReplayBenchmarkPack:
        default_id = f"{pattern_slug}__ptb-tradoor-v1"
        existing = self.load(default_id)
        if existing is not None:
            desired_timeframes = ["15m", "1h", "4h"]
            if existing.candidate_timeframes != desired_timeframes:
                existing = ReplayBenchmarkPack(
                    benchmark_pack_id=existing.benchmark_pack_id,
                    pattern_slug=existing.pattern_slug,
                    candidate_timeframes=desired_timeframes,
                    cases=existing.cases,
                    created_at=existing.created_at,
                )
                self.save(existing)
            return existing
        pack = ReplayBenchmarkPack(
            benchmark_pack_id=default_id,
            pattern_slug=pattern_slug,
            candidate_timeframes=["15m", "1h", "4h"],
            cases=[
                BenchmarkCase(
                    symbol="PTBUSDT",
                    timeframe="1h",
                    start_at=_dt("2026-04-13T00:00:00+00:00"),
                    end_at=_dt("2026-04-15T12:00:00+00:00"),
                    expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
                    role="reference",
                    notes=["reference PTB reversal window"],
                ),
                BenchmarkCase(
                    symbol="TRADOORUSDT",
                    timeframe="1h",
                    start_at=_dt("2026-04-11T00:00:00+00:00"),
                    end_at=_dt("2026-04-14T18:00:00+00:00"),
                    expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
                    role="holdout",
                    notes=["holdout TRADOOR replay window"],
                ),
            ],
        )
        self.save(pack)
        return pack


class PatternSearchArtifactStore:
    def __init__(self, base_dir: Path = SEARCH_RUNS_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, research_run_id: str) -> Path:
        return self.base_dir / f"{research_run_id}.json"

    def save(self, artifact: PatternSearchRunArtifact) -> Path:
        path = self._path(artifact.research_run_id)
        with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as handle:
            json.dump(artifact.to_dict(), handle, indent=2)
            temp_path = Path(handle.name)
        temp_path.replace(path)
        return path

    def load(self, research_run_id: str) -> dict | None:
        path = self._path(research_run_id)
        if not path.exists():
            return None
        return json.loads(path.read_text())

    def list(self, pattern_slug: str | None = None, limit: int | None = None) -> list[dict]:
        entries: list[dict] = []
        for path in self.base_dir.glob("*.json"):
            payload = json.loads(path.read_text())
            if pattern_slug is not None and payload.get("pattern_slug") != pattern_slug:
                continue
            entries.append(payload)
        entries.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return entries[:limit] if limit is not None else entries


class NegativeSearchMemoryStore:
    def __init__(self, base_dir: Path = NEGATIVE_MEMORY_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, memory_id: str) -> Path:
        return self.base_dir / f"{memory_id}.json"

    def save(self, entry: NegativeSearchMemoryEntry) -> Path:
        path = self._path(entry.memory_id)
        with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as handle:
            json.dump(entry.to_dict(), handle, indent=2)
            temp_path = Path(handle.name)
        temp_path.replace(path)
        return path

    def list(self, pattern_slug: str | None = None, limit: int | None = None) -> list[dict]:
        entries: list[dict] = []
        for path in self.base_dir.glob("*.json"):
            payload = json.loads(path.read_text())
            if pattern_slug is not None and payload.get("pattern_slug") != pattern_slug:
                continue
            entries.append(payload)
        entries.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return entries[:limit] if limit is not None else entries


@dataclass(frozen=True)
class PhaseAttemptSummary:
    failed_reason_counts: dict[str, int]
    missing_block_counts: dict[str, int]
    total_attempts: int


def _scale_bar_count(value: int | None, *, from_timeframe: str, to_timeframe: str) -> int | None:
    if value is None or from_timeframe == to_timeframe:
        return value
    from_minutes = tf_string_to_minutes(from_timeframe)
    to_minutes = tf_string_to_minutes(to_timeframe)
    scaled = int(round(value * (from_minutes / to_minutes)))
    if value <= 0:
        return scaled
    return max(1, scaled)


def _scale_phase_bar_windows(phase, *, from_timeframe: str, to_timeframe: str) -> None:
    if from_timeframe == to_timeframe:
        return
    phase.min_bars = _scale_bar_count(phase.min_bars, from_timeframe=from_timeframe, to_timeframe=to_timeframe)
    phase.max_bars = _scale_bar_count(phase.max_bars, from_timeframe=from_timeframe, to_timeframe=to_timeframe)
    phase.transition_window_bars = _scale_bar_count(
        phase.transition_window_bars,
        from_timeframe=from_timeframe,
        to_timeframe=to_timeframe,
    )


def _scale_phase_duration(phase, *, duration_scale: float) -> None:
    """Scale per-phase min/max bar windows and transition window by duration_scale.

    ``min_bars`` stays >= 1 to avoid zero-bar phases. ``None`` stays ``None``.
    """
    if duration_scale == 1.0:
        return

    def _scale(value: int | None, *, floor: int) -> int | None:
        if value is None:
            return value
        scaled = int(round(value * duration_scale))
        return max(floor, scaled)

    phase.min_bars = _scale(phase.min_bars, floor=1)
    phase.max_bars = _scale(phase.max_bars, floor=max(phase.min_bars or 1, 1))
    phase.transition_window_bars = _scale(phase.transition_window_bars, floor=1)


def _scale_warmup_bars(warmup_bars: int, *, from_timeframe: str, to_timeframe: str) -> int:
    scaled = _scale_bar_count(warmup_bars, from_timeframe=from_timeframe, to_timeframe=to_timeframe)
    return max(1, int(scaled or warmup_bars))


def _lead_score_from_minutes(
    lead_bars: int | None,
    *,
    variant_timeframe: str,
    case_timeframe: str,
) -> float:
    if lead_bars is None or lead_bars <= 0:
        return 0.0
    variant_minutes = tf_string_to_minutes(variant_timeframe)
    case_minutes = tf_string_to_minutes(case_timeframe)
    lead_minutes = lead_bars * variant_minutes
    return min(lead_minutes / float(case_minutes * 12), 1.0)


def build_variant_pattern(base_pattern_slug: str, spec: PatternVariantSpec) -> PatternObject:
    base = copy.deepcopy(get_pattern(base_pattern_slug))
    base_timeframe = base.timeframe
    base.slug = spec.variant_slug
    base.timeframe = spec.timeframe
    for phase in base.phases:
        phase.timeframe = spec.timeframe
        overrides = spec.phase_overrides.get(phase.phase_id)
        if overrides:
            for key, value in overrides.items():
                setattr(phase, key, copy.deepcopy(value))
        _scale_phase_bar_windows(phase, from_timeframe=base_timeframe, to_timeframe=spec.timeframe)
        _scale_phase_duration(phase, duration_scale=spec.duration_scale)
    return base


def build_seed_variants(pattern_slug: str) -> list[PatternVariantSpec]:
    base = get_pattern(pattern_slug)
    return [
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__canonical",
            timeframe=base.timeframe,
            hypotheses=["canonical runtime contract"],
        ),
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__funding-bias-window16",
            timeframe=base.timeframe,
            phase_overrides={
                "ACCUMULATION": {
                    "phase_score_threshold": 0.65,
                    "transition_window_bars": 16,
                }
            },
            hypotheses=["widen accumulation timing window", "slightly lower accumulation score floor"],
        ),
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__breakout-range-soft",
            timeframe=base.timeframe,
            phase_overrides={
                "BREAKOUT": {
                    "required_blocks": ["post_accumulation_range_breakout"],
                    "required_any_groups": [["oi_expansion_confirm", "oi_acceleration"]],
                    "optional_blocks": ["breakout_volume_confirm"],
                    "max_bars": 24,
                }
            },
            hypotheses=["make breakout local to accumulation range", "allow OI acceleration as OI expansion proxy"],
        ),
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__compression-emphasis",
            timeframe=base.timeframe,
            phase_overrides={
                "ACCUMULATION": {
                    "score_weights": {
                        "higher_lows_sequence": 0.35,
                        "oi_hold_after_spike": 0.30,
                        "funding_flip": 0.10,
                        "positive_funding_bias": 0.10,
                        "ls_ratio_recovery": 0.10,
                        "post_dump_compression": 0.15,
                        "volume_dryup": 0.05,
                        "bollinger_squeeze": 0.05,
                        "reclaim_after_dump": 0.10,
                    },
                    "phase_score_threshold": 0.68,
                }
            },
            hypotheses=["reward post-dump compression more strongly"],
        ),
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__arch-soft-real-loose",
            timeframe=base.timeframe,
            phase_overrides={
                "ARCH_ZONE": {
                    "required_blocks": [],
                    "required_any_groups": [["sideways_compression", "volume_dryup", "bollinger_squeeze"]],
                    "min_bars": 2,
                    "max_bars": 72,
                },
                "REAL_DUMP": {
                    "required_blocks": ["oi_spike_with_dump"],
                    "optional_blocks": ["volume_spike", "recent_decline", "funding_extreme"],
                    "max_bars": 8,
                },
            },
            hypotheses=["soften arch detection", "allow real dump without mandatory volume spike"],
        ),
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__real-patience-accum-early",
            timeframe=base.timeframe,
            phase_overrides={
                "REAL_DUMP": {
                    "max_bars": 12,
                },
                "ACCUMULATION": {
                    "required_blocks": ["oi_hold_after_spike"],
                    "required_any_groups": [
                        ["higher_lows_sequence", "reclaim_after_dump"],
                        ["funding_flip", "positive_funding_bias", "ls_ratio_recovery"],
                    ],
                    "phase_score_threshold": 0.6,
                    "transition_window_bars": 18,
                },
            },
            hypotheses=["let real dump breathe longer", "allow reclaim to stand in for higher lows"],
        ),
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__holdout-recovery-bias",
            timeframe=base.timeframe,
            phase_overrides={
                "FAKE_DUMP": {
                    "max_bars": 96,
                },
                "ARCH_ZONE": {
                    "required_blocks": ["sideways_compression"],
                    "optional_blocks": ["volume_dryup", "bollinger_squeeze"],
                    "min_bars": 2,
                    "max_bars": 96,
                },
                "ACCUMULATION": {
                    "score_weights": {
                        "higher_lows_sequence": 0.30,
                        "oi_hold_after_spike": 0.25,
                        "funding_flip": 0.10,
                        "positive_funding_bias": 0.15,
                        "ls_ratio_recovery": 0.15,
                        "post_dump_compression": 0.10,
                        "volume_dryup": 0.10,
                        "bollinger_squeeze": 0.10,
                        "reclaim_after_dump": 0.15,
                    },
                    "phase_score_threshold": 0.62,
                    "transition_window_bars": 24,
                },
            },
            hypotheses=["favor slower holdout recovery structure", "give reclaim and squeeze more weight"],
        ),
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__intraday-dump-cluster",
            timeframe=base.timeframe,
            phase_overrides={
                "REAL_DUMP": {
                    "required_blocks": ["oi_spike_with_dump", "volume_spike_cluster"],
                    "optional_blocks": ["volume_spike", "recent_decline", "funding_extreme"],
                },
            },
            hypotheses=[
                "allow intraday real-dump volume to lead the clearest oi spike by a short cluster window",
            ],
        ),
    ]


def _supported_candidate_timeframes(candidate_timeframes: list[str], *, base_timeframe: str) -> list[str]:
    supported: list[str] = []
    for timeframe in candidate_timeframes:
        tf_string_to_minutes(timeframe)
        if timeframe not in supported:
            supported.append(timeframe)
    if base_timeframe not in supported:
        supported.insert(0, base_timeframe)
    return supported


def _case_supports_timeframe(case: BenchmarkCase, timeframe: str) -> bool:
    try:
        klines = load_klines(case.symbol, timeframe, offline=True)
    except Exception:
        return False
    return klines is not None and not klines.empty


def _filter_candidate_timeframes_for_pack(
    pack: ReplayBenchmarkPack,
    *,
    base_timeframe: str,
) -> list[str]:
    requested = _supported_candidate_timeframes(
        pack.candidate_timeframes or [base_timeframe],
        base_timeframe=base_timeframe,
    )
    supported: list[str] = []
    for timeframe in requested:
        if all(_case_supports_timeframe(case, timeframe) for case in pack.cases):
            supported.append(timeframe)
    return supported


def _variant_timeframe_slug(variant_slug: str, timeframe: str, *, base_timeframe: str) -> str:
    if timeframe == base_timeframe:
        return variant_slug
    return f"{variant_slug}__tf-{timeframe}"


def _strip_timeframe_suffix(variant_slug: str) -> str:
    """Return the base slug of a timeframe-family clone (``foo__tf-4h`` -> ``foo``)."""
    marker = "__tf-"
    idx = variant_slug.find(marker)
    if idx == -1:
        return variant_slug
    return variant_slug[:idx]


def _variant_duration_slug(variant_slug: str, duration_label: str) -> str:
    return f"{variant_slug}__dur-{duration_label}"


def _strip_duration_suffix(variant_slug: str) -> str:
    """Return the base slug of a duration-family clone (``foo__dur-short`` -> ``foo``)."""
    marker = "__dur-"
    idx = variant_slug.find(marker)
    if idx == -1:
        return variant_slug
    return variant_slug[:idx]


def expand_variants_across_durations(
    variants: list[PatternVariantSpec],
    duration_scales: dict[str, float] | None = None,
) -> list[PatternVariantSpec]:
    """For each base-duration (``duration_scale == 1.0``) variant, emit short/long clones.

    Clones inherit timeframe, phase_overrides, and selection_bias, and are tagged with
    ``search_origin="duration_family"`` so they participate in family insights as their
    own axis rather than as mutation descendants.
    """
    if not variants:
        return []
    scales = duration_scales if duration_scales is not None else DURATION_FAMILY_SCALES
    expanded: dict[str, PatternVariantSpec] = {v.variant_slug: v for v in variants}
    for variant in variants:
        if variant.duration_scale != 1.0:
            continue
        if variant.search_origin == "timeframe_family":
            # avoid tf × duration cross-products for the first slice
            continue
        for label, scale in scales.items():
            clone_slug = _variant_duration_slug(variant.variant_slug, label)
            expanded[clone_slug] = PatternVariantSpec(
                pattern_slug=variant.pattern_slug,
                variant_slug=clone_slug,
                timeframe=variant.timeframe,
                phase_overrides=copy.deepcopy(variant.phase_overrides),
                search_origin="duration_family",
                selection_bias=variant.selection_bias,
                hypotheses=[
                    *variant.hypotheses,
                    f"duration-family clone scale={scale:g} ({label})",
                ],
                duration_scale=scale,
            )
    return list(expanded.values())


def expand_variants_across_timeframes(
    variants: list[PatternVariantSpec],
    candidate_timeframes: list[str] | None,
) -> list[PatternVariantSpec]:
    if not variants:
        return []
    base_timeframe = variants[0].timeframe
    target_timeframes = _supported_candidate_timeframes(candidate_timeframes or [base_timeframe], base_timeframe=base_timeframe)
    expanded: dict[str, PatternVariantSpec] = {}
    for variant in variants:
        # avoid tf × duration cross-products: keep duration_family variants at base tf only
        allowed_timeframes = (
            [variant.timeframe]
            if variant.search_origin == "duration_family"
            else target_timeframes
        )
        for timeframe in allowed_timeframes:
            is_base_tf = timeframe == variant.timeframe
            expanded_variant = PatternVariantSpec(
                pattern_slug=variant.pattern_slug,
                variant_slug=_variant_timeframe_slug(variant.variant_slug, timeframe, base_timeframe=variant.timeframe),
                timeframe=timeframe,
                phase_overrides=copy.deepcopy(variant.phase_overrides),
                search_origin=variant.search_origin if is_base_tf else "timeframe_family",
                selection_bias=variant.selection_bias,
                hypotheses=list(variant.hypotheses) if is_base_tf else [
                    *variant.hypotheses,
                    f"timeframe-family clone at {timeframe}",
                ],
                duration_scale=variant.duration_scale,
            )
            expanded[expanded_variant.variant_slug] = expanded_variant
    return list(expanded.values())


def summarize_phase_attempt_records(records: list[PatternLedgerRecord]) -> PhaseAttemptSummary:
    failed_reason_counts: dict[str, int] = {}
    missing_block_counts: dict[str, int] = {}
    for record in records:
        payload = record.payload or {}
        failed_reason = payload.get("failed_reason")
        if failed_reason:
            failed_reason_counts[failed_reason] = failed_reason_counts.get(failed_reason, 0) + 1
        for block in payload.get("missing_blocks", []):
            missing_block_counts[block] = missing_block_counts.get(block, 0) + 1
    return PhaseAttemptSummary(
        failed_reason_counts=failed_reason_counts,
        missing_block_counts=missing_block_counts,
        total_attempts=len(records),
    )


def _find_variant_base(pattern_slug: str, variant_slug: str | None) -> PatternVariantSpec:
    for variant in build_seed_variants(pattern_slug):
        if variant.variant_slug == variant_slug:
            return variant
    base = get_pattern(pattern_slug)
    return PatternVariantSpec(
        pattern_slug=pattern_slug,
        variant_slug=f"{pattern_slug}__canonical",
        timeframe=base.timeframe,
        hypotheses=["canonical runtime contract"],
    )


def _deep_merge_dict(target: dict, source: dict) -> dict:
    merged = copy.deepcopy(target)
    for key, value in source.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_dict(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def _clone_variant_with_overrides(
    base: PatternVariantSpec,
    *,
    suffix: str,
    phase_overrides: dict[str, dict],
    hypotheses: list[str],
    search_origin: str = "auto_mutation",
) -> PatternVariantSpec:
    merged_phase_overrides = copy.deepcopy(base.phase_overrides)
    for phase_id, overrides in phase_overrides.items():
        merged_phase_overrides[phase_id] = _deep_merge_dict(merged_phase_overrides.get(phase_id, {}), overrides)
    return PatternVariantSpec(
        pattern_slug=base.pattern_slug,
        variant_slug=f"{base.variant_slug}__{suffix}",
        timeframe=base.timeframe,
        phase_overrides=merged_phase_overrides,
        search_origin=search_origin,
        selection_bias=base.selection_bias,
        hypotheses=[*base.hypotheses, *hypotheses],
    )


def _find_variant_ancestor_slug(variant_slug: str, known_variant_slugs: list[str]) -> str | None:
    if "__tf-" in variant_slug or "__dur-" in variant_slug:
        return None
    candidates = [
        candidate
        for candidate in known_variant_slugs
        if candidate != variant_slug
        and "__tf-" not in candidate
        and "__dur-" not in candidate
        and variant_slug.startswith(f"{candidate}__")
    ]
    if not candidates:
        return None
    return max(candidates, key=len)


def _classify_delta(reference_delta: float, holdout_delta: float | None, overall_delta: float) -> str:
    reference_damage = max(0.0, -reference_delta)
    holdout_gain = holdout_delta or 0.0
    if holdout_gain > 0 and reference_damage <= 0.02 and overall_delta > 0:
        return "productive"
    if reference_damage >= 0.1 and overall_delta < 0:
        return "damaging"
    if holdout_gain <= 0 and overall_delta <= 0:
        return "flat"
    return "mixed"


def build_variant_delta_insights(variant_results: list[VariantSearchResult]) -> list[VariantDeltaInsight]:
    result_map = {result.variant_slug: result for result in variant_results}
    known_slugs = list(result_map)
    insights: list[VariantDeltaInsight] = []
    for result in variant_results:
        base_slug = _find_variant_ancestor_slug(result.variant_slug, known_slugs)
        if base_slug is None:
            continue
        base_result = result_map[base_slug]
        reference_delta = round(result.reference_score - base_result.reference_score, 6)
        if result.holdout_score is None or base_result.holdout_score is None:
            holdout_delta = None
            damage_adjusted_gain = None
        else:
            holdout_delta = round(result.holdout_score - base_result.holdout_score, 6)
            damage_adjusted_gain = round(holdout_delta - max(0.0, -reference_delta), 6)
        overall_delta = round(result.overall_score - base_result.overall_score, 6)
        insights.append(
            VariantDeltaInsight(
                variant_slug=result.variant_slug,
                base_variant_slug=base_slug,
                reference_delta=reference_delta,
                holdout_delta=holdout_delta,
                overall_delta=overall_delta,
                damage_adjusted_gain=damage_adjusted_gain,
                classification=_classify_delta(reference_delta, holdout_delta, overall_delta),
            )
        )
    return insights


def build_mutation_branch_insights(variant_deltas: list[VariantDeltaInsight]) -> list[MutationBranchInsight]:
    grouped: dict[str, list[VariantDeltaInsight]] = {}
    for delta in variant_deltas:
        if delta.base_variant_slug is None:
            continue
        grouped.setdefault(delta.base_variant_slug, []).append(delta)

    insights: list[MutationBranchInsight] = []
    for anchor_variant_slug, deltas in grouped.items():
        gains = [delta.damage_adjusted_gain for delta in deltas if delta.damage_adjusted_gain is not None]
        avg_gain = round(mean(gains), 6) if gains else 0.0
        best_gain = round(max(gains), 6) if gains else 0.0
        best_overall_delta = round(max((delta.overall_delta for delta in deltas), default=0.0), 6)
        productive_count = sum(1 for delta in deltas if delta.classification == "productive")
        damaging_count = sum(1 for delta in deltas if delta.classification == "damaging")
        flat_count = sum(1 for delta in deltas if delta.classification == "flat")
        branch_score = round(
            0.55 * best_gain
            + 0.25 * avg_gain
            + 0.10 * max(best_overall_delta, 0.0)
            + 0.03 * productive_count
            - 0.08 * damaging_count
            - 0.03 * flat_count,
            6,
        )
        insights.append(
            MutationBranchInsight(
                anchor_variant_slug=anchor_variant_slug,
                descendant_count=len(deltas),
                productive_count=productive_count,
                damaging_count=damaging_count,
                flat_count=flat_count,
                avg_damage_adjusted_gain=avg_gain,
                best_damage_adjusted_gain=best_gain,
                best_overall_delta=best_overall_delta,
                branch_score=branch_score,
            )
        )
    insights.sort(
        key=lambda insight: (
            insight.branch_score,
            insight.best_damage_adjusted_gain,
            insight.best_overall_delta,
            insight.productive_count,
        ),
        reverse=True,
    )
    return insights


def _classify_family(
    *,
    best_reference_score: float,
    best_holdout_score: float | None,
    best_overall_score: float,
    winner_reference_score: float,
    winner_holdout_score: float | None,
    winner_overall_score: float,
) -> str:
    if best_overall_score <= winner_overall_score - 0.1 or best_reference_score <= winner_reference_score - 0.15:
        return "damaging"
    holdout_ok = (
        best_holdout_score is None
        or winner_holdout_score is None
        or best_holdout_score >= winner_holdout_score - 0.02
    )
    if (
        best_overall_score >= winner_overall_score - 0.02
        and best_reference_score >= winner_reference_score - 0.02
        and holdout_ok
    ):
        return "viable"
    return "exploratory"


def build_search_family_insights(
    variant_results: list[VariantSearchResult],
    variant_specs: list[PatternVariantSpec],
    branch_insights: list[MutationBranchInsight],
) -> list[SearchFamilyInsight]:
    result_lookup = {result.variant_slug: result for result in variant_results}
    spec_lookup = {spec.variant_slug: spec for spec in variant_specs}
    winner = max(variant_results, key=lambda result: result.overall_score, default=None)
    if winner is None:
        return []

    insights: list[SearchFamilyInsight] = []
    winner_reference_score = winner.reference_score
    winner_holdout_score = winner.holdout_score
    winner_overall_score = winner.overall_score

    timeframe_family_members: dict[str, list[VariantSearchResult]] = {}
    duration_family_members: dict[str, list[VariantSearchResult]] = {}
    for result in variant_results:
        spec = spec_lookup.get(result.variant_slug)
        if spec is None or spec.search_origin == "auto_mutation":
            continue
        if spec.search_origin == "timeframe_family":
            base_slug = _strip_timeframe_suffix(result.variant_slug)
            timeframe_family_members.setdefault(base_slug, []).append(result)
            continue
        if spec.search_origin == "duration_family":
            base_slug = _strip_duration_suffix(result.variant_slug)
            duration_family_members.setdefault(base_slug, []).append(result)
            continue
        family_type = spec.search_origin
        family_score = round(
            result.overall_score
            + 0.25 * float(result.holdout_score or 0.0)
            + float(spec.selection_bias or 0.0),
            6,
        )
        insights.append(
            SearchFamilyInsight(
                family_key=result.variant_slug,
                family_type=family_type,
                representative_variant_slug=result.variant_slug,
                member_variant_slugs=[result.variant_slug],
                best_reference_score=result.reference_score,
                best_holdout_score=result.holdout_score,
                best_overall_score=result.overall_score,
                family_score=family_score,
                classification=_classify_family(
                    best_reference_score=result.reference_score,
                    best_holdout_score=result.holdout_score,
                    best_overall_score=result.overall_score,
                    winner_reference_score=winner_reference_score,
                    winner_holdout_score=winner_holdout_score,
                    winner_overall_score=winner_overall_score,
                ),
            )
        )

    for base_slug, members in timeframe_family_members.items():
        best_member = max(members, key=lambda result: result.overall_score)
        family_score = round(
            best_member.overall_score + 0.25 * float(best_member.holdout_score or 0.0),
            6,
        )
        insights.append(
            SearchFamilyInsight(
                family_key=f"{base_slug}__tf-family",
                family_type="timeframe_family",
                representative_variant_slug=best_member.variant_slug,
                member_variant_slugs=[result.variant_slug for result in members],
                best_reference_score=best_member.reference_score,
                best_holdout_score=best_member.holdout_score,
                best_overall_score=best_member.overall_score,
                family_score=family_score,
                classification=_classify_family(
                    best_reference_score=best_member.reference_score,
                    best_holdout_score=best_member.holdout_score,
                    best_overall_score=best_member.overall_score,
                    winner_reference_score=winner_reference_score,
                    winner_holdout_score=winner_holdout_score,
                    winner_overall_score=winner_overall_score,
                ),
            )
        )

    for base_slug, members in duration_family_members.items():
        best_member = max(members, key=lambda result: result.overall_score)
        family_score = round(
            best_member.overall_score + 0.25 * float(best_member.holdout_score or 0.0),
            6,
        )
        insights.append(
            SearchFamilyInsight(
                family_key=f"{base_slug}__dur-family",
                family_type="duration_family",
                representative_variant_slug=best_member.variant_slug,
                member_variant_slugs=[result.variant_slug for result in members],
                best_reference_score=best_member.reference_score,
                best_holdout_score=best_member.holdout_score,
                best_overall_score=best_member.overall_score,
                family_score=family_score,
                classification=_classify_family(
                    best_reference_score=best_member.reference_score,
                    best_holdout_score=best_member.holdout_score,
                    best_overall_score=best_member.overall_score,
                    winner_reference_score=winner_reference_score,
                    winner_holdout_score=winner_holdout_score,
                    winner_overall_score=winner_overall_score,
                ),
            )
        )

    delta_by_base: dict[str, list[VariantDeltaInsight]] = {}
    for delta in [d for d in build_variant_delta_insights(variant_results)]:
        if delta.base_variant_slug is not None:
            delta_by_base.setdefault(delta.base_variant_slug, []).append(delta)

    for branch in branch_insights:
        anchor_slug = branch.anchor_variant_slug
        members = delta_by_base.get(anchor_slug, [])
        member_results = [
            result_lookup[delta.variant_slug]
            for delta in members
            if delta.variant_slug in result_lookup
        ]
        if not member_results:
            continue
        best_member = max(member_results, key=lambda result: result.overall_score)
        family_score = round(
            best_member.overall_score + 0.25 * float(best_member.holdout_score or 0.0) + branch.branch_score,
            6,
        )
        insights.append(
            SearchFamilyInsight(
                family_key=anchor_slug,
                family_type="mutation_branch",
                representative_variant_slug=best_member.variant_slug,
                member_variant_slugs=[result.variant_slug for result in member_results],
                best_reference_score=best_member.reference_score,
                best_holdout_score=best_member.holdout_score,
                best_overall_score=best_member.overall_score,
                family_score=family_score,
                classification=_classify_family(
                    best_reference_score=best_member.reference_score,
                    best_holdout_score=best_member.holdout_score,
                    best_overall_score=best_member.overall_score,
                    winner_reference_score=winner_reference_score,
                    winner_holdout_score=winner_holdout_score,
                    winner_overall_score=winner_overall_score,
                ),
            )
        )

    insights.sort(
        key=lambda insight: (
            insight.family_score,
            insight.best_overall_score,
            float(insight.best_holdout_score or 0.0),
        ),
        reverse=True,
    )
    return insights


def build_timeframe_recommendations(
    family_insights: list[SearchFamilyInsight],
    variant_results: list[VariantSearchResult],
    variant_specs: list[PatternVariantSpec],
    *,
    upgrade_threshold: float = TIMEFRAME_UPGRADE_THRESHOLD,
    avoid_threshold: float = TIMEFRAME_AVOID_THRESHOLD,
) -> list[TimeframeRecommendation]:
    """Compare each timeframe_family best-clone against its 1h parent.

    Emits one recommendation per timeframe_family insight, classified as
    ``upgrade`` when the clone beats the parent by ``upgrade_threshold``,
    ``avoid`` when the clone loses by ``avoid_threshold`` or more, and
    ``keep`` when the swing stays inside the band.
    """
    result_lookup = {result.variant_slug: result for result in variant_results}
    spec_lookup = {spec.variant_slug: spec for spec in variant_specs}

    recommendations: list[TimeframeRecommendation] = []
    for insight in family_insights:
        if insight.family_type != "timeframe_family":
            continue
        base_slug = _strip_timeframe_suffix(insight.family_key)
        parent_result = result_lookup.get(base_slug)
        parent_spec = spec_lookup.get(base_slug)
        clone_slug = insight.representative_variant_slug
        clone_result = result_lookup.get(clone_slug)
        clone_spec = spec_lookup.get(clone_slug)
        if (
            parent_result is None
            or parent_spec is None
            or clone_result is None
            or clone_spec is None
        ):
            continue
        delta = round(clone_result.overall_score - parent_result.overall_score, 6)
        if delta >= upgrade_threshold:
            classification = "upgrade"
            recommended_tf = clone_spec.timeframe
        elif delta <= -avoid_threshold:
            classification = "avoid"
            recommended_tf = parent_spec.timeframe
        else:
            classification = "keep"
            recommended_tf = parent_spec.timeframe
        recommendations.append(
            TimeframeRecommendation(
                base_variant_slug=base_slug,
                parent_timeframe=parent_spec.timeframe,
                recommended_timeframe=recommended_tf,
                parent_overall_score=parent_result.overall_score,
                clone_overall_score=clone_result.overall_score,
                clone_variant_slug=clone_slug,
                score_delta=delta,
                classification=classification,
            )
        )
    recommendations.sort(key=lambda r: (-r.score_delta, r.base_variant_slug))
    return recommendations


def build_duration_recommendations(
    family_insights: list[SearchFamilyInsight],
    variant_results: list[VariantSearchResult],
    variant_specs: list[PatternVariantSpec],
    *,
    upgrade_threshold: float = DURATION_UPGRADE_THRESHOLD,
    avoid_threshold: float = DURATION_AVOID_THRESHOLD,
) -> list[DurationRecommendation]:
    """Compare each duration_family best-clone against its baseline-duration parent."""
    result_lookup = {result.variant_slug: result for result in variant_results}
    spec_lookup = {spec.variant_slug: spec for spec in variant_specs}

    recommendations: list[DurationRecommendation] = []
    for insight in family_insights:
        if insight.family_type != "duration_family":
            continue
        base_slug = _strip_duration_suffix(insight.family_key)
        parent_result = result_lookup.get(base_slug)
        parent_spec = spec_lookup.get(base_slug)
        clone_slug = insight.representative_variant_slug
        clone_result = result_lookup.get(clone_slug)
        clone_spec = spec_lookup.get(clone_slug)
        if (
            parent_result is None
            or parent_spec is None
            or clone_result is None
            or clone_spec is None
        ):
            continue
        # derive label from slug suffix
        suffix = clone_slug.split("__dur-", 1)[-1] if "__dur-" in clone_slug else "unknown"
        delta = round(clone_result.overall_score - parent_result.overall_score, 6)
        if delta >= upgrade_threshold:
            classification = "upgrade"
            recommended_scale = clone_spec.duration_scale
        elif delta <= -avoid_threshold:
            classification = "avoid"
            recommended_scale = parent_spec.duration_scale
        else:
            classification = "keep"
            recommended_scale = parent_spec.duration_scale
        recommendations.append(
            DurationRecommendation(
                base_variant_slug=base_slug,
                parent_duration_scale=parent_spec.duration_scale,
                recommended_duration_scale=recommended_scale,
                parent_overall_score=parent_result.overall_score,
                clone_overall_score=clone_result.overall_score,
                clone_variant_slug=clone_slug,
                duration_label=suffix,
                score_delta=delta,
                classification=classification,
            )
        )
    recommendations.sort(key=lambda r: (-r.score_delta, r.base_variant_slug))
    return recommendations


def _promotion_metrics_from_cases(
    case_results: list[VariantCaseResult],
    *,
    min_entry_profit_pct: float = 5.0,
) -> dict[str, float | None]:
    """Compute promotion-gate metrics from per-case replay outcomes."""
    reference_cases = [case for case in case_results if case.role == "reference"]
    holdout_cases = [case for case in case_results if case.role == "holdout"]

    # reference_recall: fraction of reference cases where entry was hit.
    if reference_cases:
        reference_recall = mean(
            1.0 if case.entry_hit else 0.0 for case in reference_cases
        )
    else:
        reference_recall = 0.0

    # phase_fidelity: mean of per-case fidelity across all cases.
    phase_fidelity = mean(case.phase_fidelity for case in case_results) if case_results else 0.0

    # lead_time_bars: mean lead_bars across cases that actually entered.
    entered_lead_bars = [
        float(case.lead_bars) for case in case_results if case.entry_hit and case.lead_bars is not None
    ]
    lead_time_bars = mean(entered_lead_bars) if entered_lead_bars else 0.0

    # false_discovery_rate: entries that never reached target, as fraction of entries.
    entered_cases = [case for case in case_results if case.entry_hit]
    if entered_cases:
        false_discoveries = sum(1 for case in entered_cases if not case.target_hit)
        false_discovery_rate = false_discoveries / len(entered_cases)
    else:
        false_discovery_rate = 0.0

    # robustness_spread: population stdev of per-case score; 0 when < 2 cases.
    if len(case_results) >= 2:
        robustness_spread = float(pstdev(case.score for case in case_results))
    else:
        robustness_spread = 0.0

    # holdout_passed: all holdout cases reached at least the entry phase.
    # When no holdout cases exist the metric is vacuously True so the gate
    # does not penalise packs without explicit holdouts.
    if holdout_cases:
        holdout_passed_value = 1.0 if all(case.entry_hit for case in holdout_cases) else 0.0
    else:
        holdout_passed_value = 1.0

    # entry_profitable_rate (W-0088): fraction of entered cases with a
    # measured forward return >= threshold. Undefined (None) when no
    # entered case has a measured forward return, so callers can tell
    # "metric absent" from "metric present and zero".
    measured_entered = [
        case for case in entered_cases if case.forward_peak_return_pct is not None
    ]
    if measured_entered:
        profitable = sum(
            1
            for case in measured_entered
            if case.forward_peak_return_pct is not None
            and case.forward_peak_return_pct >= min_entry_profit_pct
        )
        entry_profitable_rate: float | None = round(profitable / len(measured_entered), 6)
    else:
        entry_profitable_rate = None

    return {
        "reference_recall": round(float(reference_recall), 6),
        "phase_fidelity": round(float(phase_fidelity), 6),
        "lead_time_bars": round(float(lead_time_bars), 6),
        "false_discovery_rate": round(float(false_discovery_rate), 6),
        "robustness_spread": round(float(robustness_spread), 6),
        "holdout_passed": holdout_passed_value,
        "entry_profitable_rate": entry_profitable_rate,
    }


def build_promotion_report(
    pattern_slug: str,
    winner: VariantSearchResult,
    *,
    policy: PromotionGatePolicy = DEFAULT_PROMOTION_GATE_POLICY,
    report_id: str | None = None,
) -> PromotionReport:
    """Build a PromotionReport for the search winner against the gate policy.

    Decision logic (W-0088):
      - **strict path**: all 6 original gates pass → promote_candidate
      - **trading_edge path**: reference_recall + phase_fidelity +
        lead_time_bars + robustness_spread + holdout_passed all pass AND
        entry_profitable_rate gate passes → promote_candidate
      - otherwise → reject

    The trading_edge path waives ``false_discovery_rate``: a slow-recovery
    case (KOMA, DYM-class) by definition enters but never reaches the
    target phase, so FDR=1.0 by construction. Including it would defeat
    the parallel-path purpose. The path is only available when the
    policy's ``min_entry_profitable_rate`` is set and the metric was
    actually measured.
    """
    metrics = _promotion_metrics_from_cases(
        winner.case_results,
        min_entry_profit_pct=policy.min_entry_profit_pct,
    )
    holdout_passed_bool = bool((metrics["holdout_passed"] or 0.0) >= 1.0)
    entry_profitable_rate = metrics["entry_profitable_rate"]

    strict_gate_results: dict[str, bool] = {
        "reference_recall": metrics["reference_recall"] >= policy.min_reference_recall,
        "phase_fidelity": metrics["phase_fidelity"] >= policy.min_phase_fidelity,
        "lead_time_bars": metrics["lead_time_bars"] >= policy.min_lead_time_bars,
        "false_discovery_rate": metrics["false_discovery_rate"] <= policy.max_false_discovery_rate,
        "robustness_spread": metrics["robustness_spread"] <= policy.max_robustness_spread,
        "holdout_passed": (not policy.require_holdout_passed) or holdout_passed_bool,
    }

    trading_edge_available = (
        policy.min_entry_profitable_rate is not None
        and entry_profitable_rate is not None
    )
    if trading_edge_available:
        entry_profitable_gate: bool | None = (
            entry_profitable_rate >= policy.min_entry_profitable_rate
        )
    elif policy.min_entry_profitable_rate is None:
        entry_profitable_gate = None  # parallel path disabled
    else:
        entry_profitable_gate = False  # enabled but unmeasured
    gate_results: dict[str, bool] = dict(strict_gate_results)

    strict_pass = all(strict_gate_results.values())
    trading_edge_pass = (
        trading_edge_available
        and entry_profitable_gate is True
        and strict_gate_results["reference_recall"]
        and strict_gate_results["phase_fidelity"]
        and strict_gate_results["lead_time_bars"]
        and strict_gate_results["robustness_spread"]
        and strict_gate_results["holdout_passed"]
    )

    if strict_pass:
        decision = "promote_candidate"
        decision_path = "strict"
    elif trading_edge_pass:
        decision = "promote_candidate"
        decision_path = "trading_edge"
    else:
        decision = "reject"
        decision_path = "rejected"

    rejection_reasons: list[str] = []
    if decision == "reject":
        if not strict_gate_results["reference_recall"]:
            rejection_reasons.append(
                f"reference_recall {metrics['reference_recall']:.3f} < floor {policy.min_reference_recall:.3f}"
            )
        if not strict_gate_results["phase_fidelity"]:
            rejection_reasons.append(
                f"phase_fidelity {metrics['phase_fidelity']:.3f} < floor {policy.min_phase_fidelity:.3f}"
            )
        if not strict_gate_results["lead_time_bars"]:
            rejection_reasons.append(
                f"lead_time_bars {metrics['lead_time_bars']:.3f} < floor {policy.min_lead_time_bars:.3f}"
            )
        if not strict_gate_results["false_discovery_rate"]:
            rejection_reasons.append(
                f"false_discovery_rate {metrics['false_discovery_rate']:.3f} > ceiling {policy.max_false_discovery_rate:.3f}"
            )
        if not strict_gate_results["robustness_spread"]:
            rejection_reasons.append(
                f"robustness_spread {metrics['robustness_spread']:.3f} > bound {policy.max_robustness_spread:.3f}"
            )
        if not strict_gate_results["holdout_passed"]:
            rejection_reasons.append("holdout_passed=False")
        if policy.min_entry_profitable_rate is not None:
            if entry_profitable_rate is None:
                rejection_reasons.append(
                    "entry_profitable_rate=unmeasured (no entered case had forward-return data)"
                )
            elif not entry_profitable_gate:
                rejection_reasons.append(
                    f"entry_profitable_rate {entry_profitable_rate:.3f} < floor {policy.min_entry_profitable_rate:.3f}"
                )

    return PromotionReport(
        promotion_report_id=report_id or str(uuid.uuid4()),
        pattern_slug=pattern_slug,
        variant_id=winner.variant_id,
        variant_slug=winner.variant_slug,
        reference_recall=metrics["reference_recall"],
        phase_fidelity=metrics["phase_fidelity"],
        lead_time_bars=metrics["lead_time_bars"],
        false_discovery_rate=metrics["false_discovery_rate"],
        robustness_spread=metrics["robustness_spread"],
        holdout_passed=holdout_passed_bool,
        gate_policy=policy,
        gate_results=gate_results,
        decision=decision,
        rejection_reasons=rejection_reasons,
        entry_profitable_rate=entry_profitable_rate,
        entry_profitable_gate=entry_profitable_gate,
        decision_path=decision_path,
    )


def _branch_insight_lookup(artifact: dict | None) -> dict[str, dict]:
    if artifact is None:
        return {}
    return {
        payload.get("anchor_variant_slug"): payload
        for payload in artifact.get("branch_insights", [])
        if payload.get("anchor_variant_slug")
    }


def _family_insight_lookup(artifact: dict | None) -> dict[str, dict]:
    if artifact is None:
        return {}
    return {
        payload.get("family_key"): payload
        for payload in artifact.get("family_insights", [])
        if payload.get("family_key")
    }


def _family_priority(family_type: str | None, policy: FamilySelectionPolicy) -> int:
    return policy.family_type_priority.get(family_type or "", 0)


def _family_ref(active_family: SearchFamilyInsight | None) -> str | None:
    if active_family is None:
        return None
    return f"family:{active_family.family_key}"


def _family_key_from_ref(family_ref: str | None) -> str | None:
    if not family_ref or not family_ref.startswith("family:"):
        return None
    family_key = family_ref.split("family:", 1)[1]
    return family_key or None


def _artifact_from_negative_memory(entry: dict | None) -> dict | None:
    if not entry:
        return None
    family_scores = list(entry.get("family_scores", []))
    if not family_scores and not entry.get("active_family_key"):
        return None
    return {
        "winner_variant_slug": entry.get("winner_variant_slug"),
        "family_insights": family_scores,
        "family_policy": dict(entry.get("family_policy", {})),
        "active_family_key": entry.get("active_family_key") or _family_key_from_ref(entry.get("baseline_family_ref")),
        "active_family_type": entry.get("active_family_type"),
        "active_family_variant_slug": entry.get("active_family_variant_slug"),
        "created_at": entry.get("created_at", ""),
    }


def select_active_family_insight(
    family_insights: list[SearchFamilyInsight],
    recent_artifacts: list[dict] | None = None,
    policy: FamilySelectionPolicy = DEFAULT_FAMILY_SELECTION_POLICY,
) -> SearchFamilyInsight | None:
    # timeframe_family and duration_family are informational axes, not promotion lanes.
    family_insights = [
        insight
        for insight in family_insights
        if insight.family_type not in ("timeframe_family", "duration_family")
    ]
    if not family_insights:
        return None

    recent_artifacts = recent_artifacts or []
    by_key = {insight.family_key: insight for insight in family_insights}
    best_family_score = max(insight.family_score for insight in family_insights)

    for artifact in recent_artifacts:
        active_family_key = artifact.get("active_family_key")
        if not active_family_key:
            continue
        active_family = by_key.get(active_family_key)
        if active_family is None:
            continue
        if active_family.classification == "damaging":
            continue
        if active_family.family_score >= best_family_score - policy.active_family_stickiness_band:
            return active_family

    viable = [insight for insight in family_insights if insight.classification == "viable"]
    candidate_pool = viable or list(family_insights)
    top_pool_score = max(insight.family_score for insight in candidate_pool)
    shortlist = [
        insight
        for insight in candidate_pool
        if insight.family_score >= top_pool_score - 0.02
    ]
    shortlist.sort(
        key=lambda insight: (
            _family_priority(insight.family_type, policy),
            insight.family_score,
            float(insight.best_holdout_score or 0.0),
            insight.best_overall_score,
            insight.best_reference_score,
            insight.family_key,
        ),
        reverse=True,
    )
    return shortlist[0]


def has_viable_reset_family(artifact: dict | None) -> bool:
    return any(
        insight.get("family_type") == "reset_lane" and insight.get("classification") == "viable"
        for insight in _family_insight_lookup(artifact).values()
    )


def should_use_reset_lane(artifact: dict | None) -> bool:
    winner_slug = artifact.get("winner_variant_slug") if artifact else None
    return branch_is_unhealthy(artifact, winner_slug) or has_viable_reset_family(artifact)


def _best_family_score(artifact: dict | None) -> float:
    family_lookup = _family_insight_lookup(artifact)
    if not family_lookup:
        return 0.0
    return max(float(insight.get("family_score") or 0.0) for insight in family_lookup.values())


def select_preferred_reset_artifact_from_history(artifacts: list[dict]) -> tuple[dict | None, str | None]:
    best_choice: tuple[float, float, str, dict, str] | None = None
    for artifact in artifacts:
        active_family_key = artifact.get("active_family_key")
        for family_key, insight in _family_insight_lookup(artifact).items():
            if insight.get("family_type") != "reset_lane":
                continue
            if insight.get("classification") != "viable":
                continue
            family_score = float(insight.get("family_score") or 0.0)
            if family_key == active_family_key:
                family_score += 0.01
            best_overall_score = float(insight.get("best_overall_score") or 0.0)
            created_at = artifact.get("created_at", "")
            choice = (family_score, best_overall_score, created_at, artifact, family_key)
            if best_choice is None or choice[:3] > best_choice[:3]:
                best_choice = choice
    if best_choice is None:
        return None, None
    return best_choice[3], best_choice[4]


def branch_is_unhealthy(artifact: dict | None, anchor_variant_slug: str | None) -> bool:
    if artifact is None or not anchor_variant_slug:
        return False
    insight = _branch_insight_lookup(artifact).get(anchor_variant_slug)
    if not insight:
        return False
    branch_score = float(insight.get("branch_score") or 0.0)
    productive_count = int(insight.get("productive_count") or 0)
    damaging_count = int(insight.get("damaging_count") or 0)
    flat_count = int(insight.get("flat_count") or 0)
    return branch_score <= 0.0 and productive_count == 0 and (damaging_count > 0 or flat_count >= 2)


def select_mutation_anchor_variant_slug(artifact: dict) -> str | None:
    spec_lookup = {payload.get("variant_slug"): payload for payload in artifact.get("variant_specs", []) if payload.get("variant_slug")}
    result_lookup = {payload.get("variant_slug"): payload for payload in artifact.get("variant_results", []) if payload.get("variant_slug")}
    branch_lookup = _branch_insight_lookup(artifact)
    winner_slug = artifact.get("winner_variant_slug")
    winner_result = result_lookup.get(winner_slug)
    winner_overall = float(winner_result.get("overall_score", 0.0)) if winner_result is not None else 0.0

    productive_candidates: list[tuple[float, float, float, float, str]] = []
    for delta in artifact.get("variant_deltas", []):
        variant_slug = delta.get("variant_slug")
        if variant_slug not in spec_lookup:
            continue
        if delta.get("classification") != "productive":
            continue
        result = result_lookup.get(variant_slug)
        if result is None:
            continue
        overall_score = float(result.get("overall_score", 0.0))
        if overall_score < winner_overall - 0.03:
            continue
        holdout_delta = float(delta.get("holdout_delta") or 0.0)
        damage_adjusted_gain = float(delta.get("damage_adjusted_gain") or 0.0)
        branch_score = float(branch_lookup.get(variant_slug, {}).get("branch_score", 0.0))
        productive_candidates.append((branch_score, damage_adjusted_gain, holdout_delta, overall_score, variant_slug))

    if productive_candidates:
        productive_candidates.sort(reverse=True)
        return productive_candidates[0][4]
    if winner_slug in spec_lookup:
        return winner_slug
    return winner_slug


def select_mutation_anchor_from_history(artifacts: list[dict]) -> tuple[dict | None, str | None]:
    best_choice: tuple[float, float, float, float, str, dict, str] | None = None
    for artifact in artifacts:
        spec_lookup = {
            payload.get("variant_slug"): payload
            for payload in artifact.get("variant_specs", [])
            if payload.get("variant_slug")
        }
        anchor_slug = select_mutation_anchor_variant_slug(artifact)
        if anchor_slug is None:
            continue
        if anchor_slug not in spec_lookup:
            continue
        result_lookup = {
            payload.get("variant_slug"): payload
            for payload in artifact.get("variant_results", [])
            if payload.get("variant_slug")
        }
        result = result_lookup.get(anchor_slug)
        if result is None:
            continue
        delta_lookup = {
            payload.get("variant_slug"): payload
            for payload in artifact.get("variant_deltas", [])
            if payload.get("variant_slug")
        }
        delta = delta_lookup.get(anchor_slug, {})
        overall_score = float(result.get("overall_score", 0.0))
        holdout_score = float(result.get("holdout_score") or 0.0)
        damage_adjusted_gain = float(delta.get("damage_adjusted_gain") or 0.0)
        branch_lookup = _branch_insight_lookup(artifact)
        branch_score = float(branch_lookup.get(anchor_slug, {}).get("branch_score", 0.0))
        created_at = artifact.get("created_at", "")
        choice = (branch_score, overall_score, damage_adjusted_gain, holdout_score, created_at, artifact, anchor_slug)
        if best_choice is None or choice[:5] > best_choice[:5]:
            best_choice = choice
    if best_choice is None:
        return None, None
    return best_choice[5], best_choice[6]


def generate_auto_variants(
    pattern_slug: str,
    *,
    negative_memory: list[dict] | None = None,
    phase_attempt_summary: PhaseAttemptSummary | None = None,
) -> list[PatternVariantSpec]:
    negative_memory = negative_memory or []
    phase_attempt_summary = phase_attempt_summary or PhaseAttemptSummary({}, {}, 0)
    latest_memory = negative_memory[0] if negative_memory else None
    baseline_variant_slug = (
        latest_memory.get("active_family_variant_slug")
        or latest_memory.get("winner_variant_slug")
        if latest_memory
        else None
    )
    base = _find_variant_base(pattern_slug, baseline_variant_slug)
    timeframe = base.timeframe
    tags = set(latest_memory.get("tags", [])) if latest_memory else set()
    missing = phase_attempt_summary.missing_block_counts

    variants: list[PatternVariantSpec] = []

    if latest_memory and "flat-landscape" in tags:
        variants.append(
            PatternVariantSpec(
                pattern_slug=pattern_slug,
                variant_slug=f"{pattern_slug}__auto-arch-reset",
                timeframe=timeframe,
                search_origin="auto_evidence",
                phase_overrides={
                    "ARCH_ZONE": {
                        "required_blocks": [],
                        "required_any_groups": [["sideways_compression", "volume_dryup", "bollinger_squeeze"]],
                        "min_bars": 2,
                        "max_bars": 96,
                    },
                    "REAL_DUMP": {
                        "required_blocks": ["oi_spike_with_dump"],
                        "optional_blocks": ["volume_spike", "recent_decline", "funding_extreme"],
                        "max_bars": 12,
                    },
                },
                hypotheses=["flat landscape detected", "reset earlier phases to escape local optimum"],
            )
        )

    funding_missing = sum(missing.get(key, 0) for key in ["positive_funding_bias", "funding_flip", "ls_ratio_recovery"])
    if funding_missing > 0 or (latest_memory and "variant-miss" in tags):
        variants.append(
            PatternVariantSpec(
                pattern_slug=pattern_slug,
                variant_slug=f"{pattern_slug}__auto-funding-flex",
                timeframe=timeframe,
                search_origin="auto_evidence",
                phase_overrides={
                    "ACCUMULATION": {
                        "required_blocks": ["oi_hold_after_spike"],
                        "required_any_groups": [
                            ["higher_lows_sequence", "reclaim_after_dump"],
                            ["funding_flip", "positive_funding_bias", "ls_ratio_recovery", "post_dump_compression"],
                        ],
                        "phase_score_threshold": 0.58,
                        "transition_window_bars": 24,
                    }
                },
                hypotheses=["phase attempts show funding-side misses", "allow reclaim/compression to substitute into accumulation"],
            )
        )

    structure_missing = sum(missing.get(key, 0) for key in ["higher_lows_sequence", "reclaim_after_dump"])
    if structure_missing > 0 or baseline_variant_slug == f"{pattern_slug}__arch-soft-real-loose":
        variants.append(
            PatternVariantSpec(
                pattern_slug=pattern_slug,
                variant_slug=f"{pattern_slug}__auto-reclaim-early",
                timeframe=timeframe,
                search_origin="auto_evidence",
                phase_overrides={
                    "REAL_DUMP": {
                        "max_bars": 16,
                    },
                    "ACCUMULATION": {
                        "required_blocks": ["oi_hold_after_spike"],
                        "required_any_groups": [
                            ["higher_lows_sequence", "reclaim_after_dump", "post_dump_compression"],
                            ["positive_funding_bias", "ls_ratio_recovery", "funding_flip"],
                        ],
                        "phase_score_threshold": 0.56,
                        "transition_window_bars": 30,
                    },
                },
                hypotheses=["best dead-end variant already improved early depth", "push accumulation earlier with reclaim-heavy structure"],
            )
        )

    if latest_memory and "variant-miss" in tags:
        variants.append(
            PatternVariantSpec(
                pattern_slug=pattern_slug,
                variant_slug=f"{pattern_slug}__auto-holdout-depth",
                timeframe=timeframe,
                search_origin="auto_evidence",
                phase_overrides={
                    "FAKE_DUMP": {
                        "max_bars": 144,
                    },
                    "ARCH_ZONE": {
                        "min_bars": 2,
                        "max_bars": 144,
                    },
                    "REAL_DUMP": {
                        "max_bars": 18,
                    },
                    "ACCUMULATION": {
                        "transition_window_bars": 36,
                        "phase_score_threshold": 0.6,
                    },
                },
                hypotheses=["holdout progressed deeper but still missed entry", "let the structure breathe longer before reset"],
            )
        )

    if not variants:
        variants.append(
            PatternVariantSpec(
                pattern_slug=pattern_slug,
                variant_slug=f"{pattern_slug}__auto-default-broad",
                timeframe=timeframe,
                search_origin="auto_evidence",
                phase_overrides={
                    "REAL_DUMP": {"max_bars": 12},
                    "ACCUMULATION": {"transition_window_bars": 24, "phase_score_threshold": 0.6},
                },
                hypotheses=["fallback broadening variant from default evidence path"],
            )
        )

    deduped: dict[str, PatternVariantSpec] = {}
    for variant in variants:
        deduped[variant.variant_slug] = variant
    return list(deduped.values())


def generate_reset_variants(
    pattern_slug: str,
    *,
    latest_artifact: dict | None = None,
) -> list[PatternVariantSpec]:
    if not should_use_reset_lane(latest_artifact):
        return []

    family_lookup = _family_insight_lookup(latest_artifact)
    blocked_reset_slugs = {
        family_key
        for family_key, insight in family_lookup.items()
        if insight.get("family_type") == "reset_lane" and insight.get("classification") == "damaging"
    }

    canonical = _find_variant_base(pattern_slug, f"{pattern_slug}__canonical")
    holdout_bias = _find_variant_base(pattern_slug, f"{pattern_slug}__holdout-recovery-bias")
    patience = _find_variant_base(pattern_slug, f"{pattern_slug}__real-patience-accum-early")

    variants = [
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__reset-real-proxy-balance",
            timeframe=canonical.timeframe,
            search_origin="reset_lane",
            phase_overrides={
                "ARCH_ZONE": {
                    "required_blocks": [],
                    "required_any_groups": [["sideways_compression", "volume_dryup", "bollinger_squeeze", "post_dump_compression"]],
                    "min_bars": 2,
                    "max_bars": 96,
                },
                "REAL_DUMP": {
                    "required_blocks": [],
                    "required_any_groups": [
                        ["oi_spike_with_dump", "recent_decline"],
                        ["volume_spike", "post_dump_compression", "funding_extreme"],
                    ],
                    "optional_blocks": ["reclaim_after_dump"],
                    "max_bars": 12,
                },
                "ACCUMULATION": {
                    "phase_score_threshold": 0.64,
                    "transition_window_bars": 18,
                },
            },
            hypotheses=[
                "latest winner branch went flat or damaging",
                "reset from canonical with balanced REAL_DUMP proxy and tighter accumulation bridge",
            ],
        ),
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__reset-reclaim-compression",
            timeframe=holdout_bias.timeframe,
            search_origin="reset_lane",
            phase_overrides={
                "ARCH_ZONE": {
                    "required_blocks": [],
                    "required_any_groups": [["sideways_compression", "volume_dryup", "bollinger_squeeze"]],
                    "min_bars": 2,
                    "max_bars": 120,
                },
                "REAL_DUMP": {
                    "max_bars": 18,
                },
                "ACCUMULATION": {
                    "required_blocks": ["oi_hold_after_spike"],
                    "required_any_groups": [
                        ["higher_lows_sequence", "reclaim_after_dump", "post_dump_compression"],
                        ["positive_funding_bias", "ls_ratio_recovery", "funding_flip"],
                    ],
                    "phase_score_threshold": 0.56,
                    "transition_window_bars": 30,
                },
            },
            hypotheses=[
                "current winner branch no longer yields productive descendants",
                "reset into reclaim/compression-led accumulation family",
            ],
        ),
        PatternVariantSpec(
            pattern_slug=pattern_slug,
            variant_slug=f"{pattern_slug}__reset-direct-accum",
            timeframe=patience.timeframe,
            search_origin="reset_lane",
            phase_overrides={
                "FAKE_DUMP": {"max_bars": 144},
                "REAL_DUMP": {
                    "max_bars": 18,
                },
                "ACCUMULATION": {
                    "required_blocks": ["oi_hold_after_spike"],
                    "required_any_groups": [
                        ["higher_lows_sequence", "reclaim_after_dump", "post_dump_compression"],
                        ["positive_funding_bias", "ls_ratio_recovery", "funding_flip", "post_dump_compression"],
                    ],
                    "phase_score_threshold": 0.54,
                    "transition_window_bars": 36,
                },
            },
            hypotheses=[
                "winner branch exhausted without holdout breakthrough",
                "reset into a longer direct-accumulation search family",
            ],
        ),
    ]
    return [variant for variant in variants if variant.variant_slug not in blocked_reset_slugs]


def generate_active_family_variants(
    pattern_slug: str,
    *,
    latest_artifact: dict | None = None,
    available_variants: list[PatternVariantSpec] | None = None,
    phase_attempt_summary: PhaseAttemptSummary | None = None,
) -> list[PatternVariantSpec]:
    if latest_artifact is None:
        return []

    active_family_type = latest_artifact.get("active_family_type")
    active_family_key = latest_artifact.get("active_family_key")
    if active_family_type != "reset_lane" or not active_family_key:
        return []
    root_family_key = active_family_key.split("__fam-", 1)[0]

    family_lookup = _family_insight_lookup(latest_artifact)
    active_family = family_lookup.get(active_family_key)
    if active_family is not None and active_family.get("classification") == "damaging":
        return []

    available_variants = available_variants or []
    phase_attempt_summary = phase_attempt_summary or PhaseAttemptSummary({}, {}, 0)
    variant_lookup = {variant.variant_slug: variant for variant in available_variants}
    stored_variant_lookup = {
        payload.get("variant_slug"): PatternVariantSpec.from_dict(payload)
        for payload in latest_artifact.get("variant_specs", [])
        if payload.get("variant_slug")
    }
    base = (
        variant_lookup.get(root_family_key)
        or stored_variant_lookup.get(root_family_key)
        or variant_lookup.get(active_family_key)
        or stored_variant_lookup.get(active_family_key)
        or _find_variant_base(pattern_slug, root_family_key)
    )

    missing = phase_attempt_summary.missing_block_counts
    funding_missing = sum(
        missing.get(key, 0)
        for key in ["positive_funding_bias", "funding_flip", "ls_ratio_recovery"]
    )
    structure_missing = sum(
        missing.get(key, 0)
        for key in ["higher_lows_sequence", "reclaim_after_dump", "post_dump_compression"]
    )

    variants: list[PatternVariantSpec] = []
    accumulation_pressure = (
        phase_attempt_summary.failed_reason_counts.get("missing_any_group", 0)
        + funding_missing
        + structure_missing
    )
    window_bias = 0.006
    reclaim_bias = 0.012 + min(structure_missing, 6) * 0.002
    accum_bridge_bias = 0.014 + min(accumulation_pressure, 8) * 0.003

    if "reset-reclaim-compression" in root_family_key:
        reclaim_window = _clone_variant_with_overrides(
            base,
            suffix="fam-reclaim-window",
            phase_overrides={
                "ARCH_ZONE": {"max_bars": 144},
                "REAL_DUMP": {"max_bars": 24},
                "ACCUMULATION": {"transition_window_bars": 36},
            },
            hypotheses=[
                "active reset family stayed viable across runs",
                "extend reclaim/compression wall-clock tolerance around the promoted family",
            ],
            search_origin="reset_lane",
        )
        variants.append(
            PatternVariantSpec(
                pattern_slug=reclaim_window.pattern_slug,
                variant_slug=reclaim_window.variant_slug,
                timeframe=reclaim_window.timeframe,
                phase_overrides=reclaim_window.phase_overrides,
                search_origin=reclaim_window.search_origin,
                selection_bias=round(base.selection_bias + window_bias, 6),
                hypotheses=reclaim_window.hypotheses,
            )
        )
        reclaim_bias_variant = _clone_variant_with_overrides(
            base,
            suffix="fam-reclaim-bias",
            phase_overrides={
                "ACCUMULATION": {
                    "phase_score_threshold": 0.54,
                    "score_weights": {
                        "higher_lows_sequence": 0.24,
                        "oi_hold_after_spike": 0.26,
                        "funding_flip": 0.10,
                        "positive_funding_bias": 0.14,
                        "ls_ratio_recovery": 0.14,
                        "post_dump_compression": 0.16,
                        "reclaim_after_dump": 0.16,
                        "volume_dryup": 0.08,
                        "bollinger_squeeze": 0.08,
                    },
                }
            },
            hypotheses=[
                "promoted reset family is reclaim/compression-led",
                "push more score mass into reclaim/compression and funding recovery",
            ],
            search_origin="reset_lane",
        )
        variants.append(
            PatternVariantSpec(
                pattern_slug=reclaim_bias_variant.pattern_slug,
                variant_slug=reclaim_bias_variant.variant_slug,
                timeframe=reclaim_bias_variant.timeframe,
                phase_overrides=reclaim_bias_variant.phase_overrides,
                search_origin=reclaim_bias_variant.search_origin,
                selection_bias=round(base.selection_bias + reclaim_bias, 6),
                hypotheses=reclaim_bias_variant.hypotheses,
            )
        )
        if funding_missing > 0 or structure_missing > 0:
            accum_bridge = _clone_variant_with_overrides(
                base,
                suffix="fam-accum-bridge",
                phase_overrides={
                    "ACCUMULATION": {
                        "required_blocks": ["oi_hold_after_spike"],
                        "required_any_groups": [
                            ["higher_lows_sequence", "reclaim_after_dump", "post_dump_compression"],
                            ["funding_flip", "positive_funding_bias", "ls_ratio_recovery", "post_dump_compression"],
                        ],
                        "phase_score_threshold": 0.55,
                        "transition_window_bars": 34,
                    }
                },
                hypotheses=[
                    "phase-attempt evidence still shows accumulation misses",
                    "keep the promoted reset family but add a wider reclaim/funding bridge",
                ],
                search_origin="reset_lane",
            )
            variants.append(
                PatternVariantSpec(
                    pattern_slug=accum_bridge.pattern_slug,
                    variant_slug=accum_bridge.variant_slug,
                    timeframe=accum_bridge.timeframe,
                    phase_overrides=accum_bridge.phase_overrides,
                    search_origin=accum_bridge.search_origin,
                    selection_bias=round(base.selection_bias + accum_bridge_bias, 6),
                    hypotheses=accum_bridge.hypotheses,
                )
            )

    deduped: dict[str, PatternVariantSpec] = {}
    for variant in variants:
        deduped[variant.variant_slug] = variant
    return list(deduped.values())


def generate_mutation_variants(
    pattern_slug: str,
    *,
    latest_artifact: dict | None = None,
    anchor_variant_slug: str | None = None,
    available_variants: list[PatternVariantSpec] | None = None,
    phase_attempt_summary: PhaseAttemptSummary | None = None,
) -> list[PatternVariantSpec]:
    if latest_artifact is None:
        return []

    available_variants = available_variants or []
    phase_attempt_summary = phase_attempt_summary or PhaseAttemptSummary({}, {}, 0)
    anchor_slug = anchor_variant_slug or latest_artifact.get("winner_variant_slug")
    if not anchor_slug:
        return []

    result_lookup = {
        result.get("variant_slug"): result
        for result in latest_artifact.get("variant_results", [])
        if result.get("variant_slug")
    }
    branch_lookup = {
        payload.get("anchor_variant_slug"): payload
        for payload in latest_artifact.get("branch_insights", [])
        if payload.get("anchor_variant_slug")
    }
    winner_slug = latest_artifact.get("winner_variant_slug")
    winner_result = result_lookup.get(anchor_slug)
    if winner_result is None:
        return []

    variant_lookup = {variant.variant_slug: variant for variant in available_variants}
    stored_variant_lookup = {
        payload.get("variant_slug"): PatternVariantSpec.from_dict(payload)
        for payload in latest_artifact.get("variant_specs", [])
        if payload.get("variant_slug")
    }
    anchor_branch_score = float(branch_lookup.get(anchor_slug, {}).get("branch_score", 0.0))
    if (
        winner_slug
        and winner_slug != anchor_slug
        and anchor_branch_score <= 0.0
        and winner_slug in result_lookup
    ):
        anchor_slug = winner_slug
        winner_result = result_lookup[winner_slug]
    base = (
        variant_lookup.get(anchor_slug)
        or stored_variant_lookup.get(anchor_slug)
        or _find_variant_base(pattern_slug, anchor_slug)
    )
    case_results = list(winner_result.get("case_results", []))
    if not case_results:
        return []
    reference_case_scores = [case.get("score", 0.0) for case in case_results if case.get("role") == "reference"]
    all_case_scores = [case.get("score", 0.0) for case in case_results]
    winner_reference_score = float(
        winner_result.get(
            "reference_score",
            mean(reference_case_scores) if reference_case_scores else 0.0,
        )
    )
    winner_overall_score = float(
        winner_result.get(
            "overall_score",
            mean(all_case_scores) if all_case_scores else 0.0,
        )
    )

    blocked_suffixes: set[str] = set()
    delta_payloads = latest_artifact.get("variant_deltas", [])
    if delta_payloads:
        for delta in delta_payloads:
            if delta.get("base_variant_slug") != anchor_slug:
                continue
            if delta.get("classification") == "damaging":
                blocked_suffixes.add(delta["variant_slug"][len(f"{anchor_slug}__") :])
    else:
        for result in latest_artifact.get("variant_results", []):
            variant_slug = result.get("variant_slug", "")
            prefix = f"{anchor_slug}__"
            if not variant_slug.startswith(prefix):
                continue
            suffix = variant_slug[len(prefix) :]
            ref_delta = float(result.get("reference_score", 0.0)) - winner_reference_score
            overall_delta = float(result.get("overall_score", 0.0)) - winner_overall_score
            if ref_delta <= -0.15 and overall_delta <= -0.05:
                blocked_suffixes.add(suffix)

    anchor_case = min(case_results, key=lambda case: (0 if case.get("role") == "holdout" else 1, case.get("score", 0.0)))
    current_phase = anchor_case.get("current_phase", "")
    case_missing = anchor_case.get("missing_block_counts", {}) or {}
    aggregate_missing = phase_attempt_summary.missing_block_counts
    funding_missing = sum(
        case_missing.get(key, 0) + aggregate_missing.get(key, 0)
        for key in ["positive_funding_bias", "funding_flip", "ls_ratio_recovery"]
    )
    structure_missing = sum(
        case_missing.get(key, 0) + aggregate_missing.get(key, 0)
        for key in ["higher_lows_sequence", "reclaim_after_dump", "post_dump_compression"]
    )

    mutations: list[PatternVariantSpec] = []

    if current_phase in {"FAKE_DUMP", "ARCH_ZONE"}:
        mutations.append(
            _clone_variant_with_overrides(
                base,
                suffix="mut-real-unlock",
                phase_overrides={
                    "ARCH_ZONE": {
                        "required_blocks": [],
                        "required_any_groups": [["sideways_compression", "volume_dryup", "bollinger_squeeze", "post_dump_compression"]],
                        "min_bars": 2,
                        "max_bars": 120,
                    },
                    "REAL_DUMP": {
                        "required_blocks": ["oi_spike_with_dump"],
                        "optional_blocks": ["volume_spike", "recent_decline", "funding_extreme", "post_dump_compression"],
                        "max_bars": 18,
                    },
                },
                hypotheses=[
                    f"latest holdout stalled at {current_phase or 'early phase'}",
                    "unlock ARCH_ZONE to REAL_DUMP transition around the current winner",
                ],
            )
        )
        if "mut-real-proxy" not in blocked_suffixes:
            mutations.append(
                _clone_variant_with_overrides(
                    base,
                    suffix="mut-real-proxy",
                    phase_overrides={
                        "REAL_DUMP": {
                            "required_blocks": [],
                            "required_any_groups": [
                                ["oi_spike_with_dump", "recent_decline"],
                                ["volume_spike", "funding_extreme", "post_dump_compression"],
                            ],
                            "optional_blocks": ["reclaim_after_dump"],
                            "max_bars": 18,
                        },
                    },
                    hypotheses=[
                        f"latest holdout stalled at {current_phase or 'early phase'}",
                        "promote a proxy REAL_DUMP transition when the strict dump block never fires",
                    ],
                )
            )
        else:
            mutations.append(
                _clone_variant_with_overrides(
                    base,
                    suffix="mut-real-guarded",
                    phase_overrides={
                        "REAL_DUMP": {
                            "required_blocks": [],
                            "required_any_groups": [
                                ["oi_spike_with_dump", "recent_decline"],
                                ["volume_spike", "funding_extreme"],
                            ],
                            "optional_blocks": ["post_dump_compression", "reclaim_after_dump"],
                            "max_bars": 12,
                        },
                    },
                    hypotheses=[
                        "previous proxy mutation damaged reference precision",
                        "retry the blocked transition with tighter REAL_DUMP proxy guards",
                    ],
                )
            )
        mutations.append(
            _clone_variant_with_overrides(
                base,
                suffix="mut-holdout-window",
                phase_overrides={
                    "FAKE_DUMP": {"max_bars": 144},
                    "ARCH_ZONE": {"max_bars": 144},
                    "REAL_DUMP": {"max_bars": 24},
                },
                hypotheses=[
                    "winner reached the deepest holdout path but still reset early",
                    "extend early-phase wall-clock tolerance around the winner",
                ],
            )
        )

    if current_phase in {"REAL_DUMP", "ACCUMULATION"} or funding_missing > 0 or structure_missing > 0:
        mutations.append(
            _clone_variant_with_overrides(
                base,
                suffix="mut-accum-bridge",
                phase_overrides={
                    "ACCUMULATION": {
                        "required_blocks": ["oi_hold_after_spike"],
                        "required_any_groups": [
                            ["higher_lows_sequence", "reclaim_after_dump", "post_dump_compression"],
                            ["funding_flip", "positive_funding_bias", "ls_ratio_recovery", "post_dump_compression"],
                        ],
                        "phase_score_threshold": 0.56,
                        "transition_window_bars": 30,
                        "score_weights": {
                            "higher_lows_sequence": 0.28,
                            "oi_hold_after_spike": 0.28,
                            "funding_flip": 0.10,
                            "positive_funding_bias": 0.12,
                            "ls_ratio_recovery": 0.12,
                            "post_dump_compression": 0.12,
                            "reclaim_after_dump": 0.10,
                            "volume_dryup": 0.08,
                            "bollinger_squeeze": 0.08,
                        },
                    }
                },
                hypotheses=[
                    "winner evidence still misses accumulation bridge",
                    "merge funding and reclaim/compression substitutions around the current winner",
                ],
            )
        )

    deduped: dict[str, PatternVariantSpec] = {}
    for variant in mutations:
        deduped[variant.variant_slug] = variant
    return list(deduped.values())


def build_search_variants(
    pattern_slug: str,
    *,
    variants: list[PatternVariantSpec] | None = None,
    candidate_timeframes: list[str] | None = None,
    negative_memory_store: NegativeSearchMemoryStore | None = None,
    artifact_store: PatternSearchArtifactStore | None = None,
    record_store: LedgerRecordStore | None = None,
) -> list[PatternVariantSpec]:
    manual_variants = variants or build_seed_variants(pattern_slug)
    negative_memory_store = negative_memory_store or NegativeSearchMemoryStore()
    artifact_store = artifact_store or PatternSearchArtifactStore()
    record_store = record_store or LEDGER_RECORD_STORE
    negative_memory = negative_memory_store.list(pattern_slug, limit=5)
    recent_artifacts = artifact_store.list(pattern_slug, limit=5)
    latest_memory = negative_memory[0] if negative_memory else None
    synthetic_memory_artifact = _artifact_from_negative_memory(latest_memory)
    latest_artifact = recent_artifacts[0] if recent_artifacts else synthetic_memory_artifact
    latest_active_family_key = latest_artifact.get("active_family_key") if latest_artifact else None
    latest_active_family_type = latest_artifact.get("active_family_type") if latest_artifact else None
    history_for_reset = recent_artifacts or ([synthetic_memory_artifact] if synthetic_memory_artifact is not None else [])
    preferred_reset_artifact, _preferred_reset_family_key = select_preferred_reset_artifact_from_history(history_for_reset)
    use_reset_history = bool(
        latest_active_family_type == "reset_lane" and latest_active_family_key
    )
    if use_reset_history:
        reset_context_artifact = latest_artifact
    else:
        use_reset_history = (
            preferred_reset_artifact is not None
            and float(_best_family_score(preferred_reset_artifact)) >= float(_best_family_score(latest_artifact))
        )
        reset_context_artifact = preferred_reset_artifact if use_reset_history else latest_artifact
    anchor_artifact, anchor_variant_slug = select_mutation_anchor_from_history(recent_artifacts)
    phase_attempt_records = record_store.list(pattern_slug, record_type="phase_attempt", limit=50)
    summary = summarize_phase_attempt_records(phase_attempt_records)
    auto_variants = generate_auto_variants(
        pattern_slug,
        negative_memory=negative_memory,
        phase_attempt_summary=summary,
    )
    reset_variants = generate_reset_variants(
        pattern_slug,
        latest_artifact=reset_context_artifact,
    )
    active_family_variants = generate_active_family_variants(
        pattern_slug,
        latest_artifact=latest_artifact,
        available_variants=[*manual_variants, *auto_variants, *reset_variants],
        phase_attempt_summary=summary,
    )
    mutation_variants = []
    if not use_reset_history and not should_use_reset_lane(latest_artifact):
        mutation_variants = generate_mutation_variants(
            pattern_slug,
            latest_artifact=anchor_artifact,
            anchor_variant_slug=anchor_variant_slug,
            available_variants=[*manual_variants, *auto_variants, *reset_variants, *active_family_variants],
            phase_attempt_summary=summary,
        )
    deduped: dict[str, PatternVariantSpec] = {}
    for variant in [*manual_variants, *auto_variants, *reset_variants, *active_family_variants, *mutation_variants]:
        deduped[variant.variant_slug] = variant
    # duration axis expansion stays at base timeframe; timeframe axis leaves
    # duration_family variants untouched. The two axes stay orthogonal.
    with_duration = expand_variants_across_durations(list(deduped.values()))
    return expand_variants_across_timeframes(with_duration, candidate_timeframes)


DEFAULT_ENTRY_PROFIT_HORIZON_BARS = 48


def _measure_forward_peak_return(
    *,
    symbol: str,
    timeframe: str,
    entry_ts: datetime,
    horizon_bars: int,
    entry_slippage_pct: float = 0.1,
) -> tuple[float | None, float | None, float | None, float | None]:
    """Return (entry_close, paper_peak_return_pct, entry_next_open, realistic_peak_return_pct).

    paper_peak_return_pct: peak return using entry bar's close as the reference price.
    realistic_peak_return_pct: peak return using the next bar's open + slippage (W-0086 slice #5).
    Either realistic field is None when the next bar is unavailable or entry_next_open <= 0.
    Returns (None, None, None, None) when data or forward bars are unavailable.
    """
    if horizon_bars <= 0:
        return None, None, None, None
    try:
        klines = load_klines(symbol, timeframe, offline=True)
    except Exception:
        return None, None, None, None
    if klines is None or klines.empty:
        return None, None, None, None
    entry_mask = klines.index >= entry_ts
    if not entry_mask.any():
        return None, None, None, None
    entry_pos = int(entry_mask.nonzero()[0][0])
    forward_window = klines.iloc[entry_pos : entry_pos + horizon_bars + 1]
    if len(forward_window) < 2:
        return None, None, None, None
    if "close" not in forward_window.columns:
        return None, None, None, None
    entry_close = float(forward_window.iloc[0]["close"])
    if entry_close <= 0:
        return None, None, None, None
    peak_close = float(forward_window["close"].iloc[1:].max())
    paper_peak_return_pct = round((peak_close - entry_close) / entry_close * 100.0, 6)
    # Realistic entry: open of the bar immediately after entry_ts + slippage.
    entry_next_open: float | None = None
    realistic_peak_return_pct: float | None = None
    if "open" in forward_window.columns and len(forward_window) >= 2:
        raw_next_open = float(forward_window.iloc[1]["open"])
        if raw_next_open > 0:
            entry_next_open = round(raw_next_open * (1.0 + entry_slippage_pct / 100.0), 8)
            realistic_peak_return_pct = round(
                (peak_close - entry_next_open) / entry_next_open * 100.0, 6
            )
    return round(entry_close, 8), paper_peak_return_pct, entry_next_open, realistic_peak_return_pct


def _slice_case_frames(case: BenchmarkCase, *, timeframe: str, warmup_bars: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    klines = load_klines(case.symbol, timeframe, offline=True)
    if klines is None or klines.empty:
        raise ValueError(f"Missing klines for {case.symbol} {case.timeframe}")

    within_case = klines.index <= case.end_at
    if not within_case.any():
        raise ValueError(f"No bars before case end for {case.symbol}")
    end_pos = int(within_case.nonzero()[0][-1])

    start_candidates = klines.index >= case.start_at
    if not start_candidates.any():
        raise ValueError(f"No bars at or after case start for {case.symbol}")
    start_pos = int(start_candidates.nonzero()[0][0])
    padded_start = max(0, start_pos - max(warmup_bars, MIN_HISTORY_BARS))
    sliced_klines = klines.iloc[padded_start : end_pos + 1].copy()

    perp = load_perp(case.symbol, offline=True)
    if perp is not None and not perp.empty:
        sliced_perp = perp.loc[(perp.index >= sliced_klines.index[0]) & (perp.index <= sliced_klines.index[-1])].copy()
    else:
        sliced_perp = None

    features = compute_features_table(sliced_klines, case.symbol, perp=sliced_perp)
    return sliced_klines, features


def evaluate_variant_on_case(
    pattern: PatternObject,
    case: BenchmarkCase,
    *,
    timeframe: str,
    warmup_bars: int = 240,
    entry_profit_horizon_bars: int = DEFAULT_ENTRY_PROFIT_HORIZON_BARS,
    entry_slippage_pct: float = 0.1,
) -> VariantCaseResult:
    scaled_warmup_bars = _scale_warmup_bars(
        warmup_bars,
        from_timeframe=case.timeframe,
        to_timeframe=timeframe,
    )
    try:
        klines, features = _slice_case_frames(case, timeframe=timeframe, warmup_bars=scaled_warmup_bars)
    except (CacheMiss, ValueError) as exc:
        return VariantCaseResult(
            case_id=case.case_id,
            symbol=case.symbol,
            role=case.role,
            observed_phase_path=[],
            current_phase="DATA_MISSING",
            phase_fidelity=0.0,
            phase_depth_progress=0.0,
            entry_hit=False,
            target_hit=False,
            lead_bars=None,
            score=0.0,
            failed_reason_counts={type(exc).__name__: 1},
        )
    attempts: list[PhaseAttemptRecord] = []
    machine = PatternStateMachine(pattern, on_phase_attempt=attempts.append)
    replay = replay_pattern_frames(
        machine,
        case.symbol,
        features_df=features,
        klines_df=klines,
        lookback_bars=len(features),
        data_quality={"has_perp": True},
        emit_attempts=True,
    )
    filtered_history = [
        (phase, timestamp)
        for phase, timestamp in replay.phase_history
        if case.start_at <= timestamp <= case.end_at
    ]
    observed_path = _dedupe_path([phase for phase, _ in filtered_history])
    expected_phase_path = _normalized_expected_phase_path(
        case.expected_phase_path,
        case_timeframe=case.timeframe,
        variant_timeframe=timeframe,
    )
    phase_fidelity = _phase_path_in_order(expected_phase_path, observed_path)
    depth_progress = _phase_depth_progress(expected_phase_path, observed_path, replay.current_phase)
    entry_hit = pattern.entry_phase in observed_path
    target_hit = pattern.target_phase in observed_path
    entry_ts: datetime | None = None
    if entry_hit:
        entry_ts = next(ts for phase, ts in filtered_history if phase == pattern.entry_phase)
    lead_bars: int | None = None
    if entry_hit and target_hit and entry_ts is not None:
        target_ts = next(ts for phase, ts in filtered_history if phase == pattern.target_phase)
        bar_minutes = tf_string_to_minutes(timeframe)
        lead_bars = int((target_ts - entry_ts).total_seconds() / (bar_minutes * 60))
    entry_close: float | None = None
    forward_peak_return_pct: float | None = None
    entry_next_open: float | None = None
    realistic_forward_peak_return_pct: float | None = None
    if entry_hit and entry_ts is not None:
        entry_close, forward_peak_return_pct, entry_next_open, realistic_forward_peak_return_pct = (
            _measure_forward_peak_return(
                symbol=case.symbol,
                timeframe=timeframe,
                entry_ts=entry_ts,
                horizon_bars=entry_profit_horizon_bars,
                entry_slippage_pct=entry_slippage_pct,
            )
        )
    lead_score = _lead_score_from_minutes(
        lead_bars,
        variant_timeframe=timeframe,
        case_timeframe=case.timeframe,
    )
    attempt_summary = summarize_phase_attempt_records(
        [
            PatternLedgerRecord(
                record_type="phase_attempt",
                pattern_slug=pattern.slug,
                symbol=attempt.symbol,
                payload={
                    "failed_reason": attempt.failed_reason,
                    "missing_blocks": attempt.missing_blocks,
                },
            )
            for attempt in attempts
            if case.start_at <= attempt.attempted_at <= case.end_at
        ]
    )
    score = round(
        0.30 * phase_fidelity
        + 0.20 * depth_progress
        + 0.20 * float(entry_hit)
        + 0.20 * float(target_hit)
        + 0.10 * lead_score,
        6,
    )
    return VariantCaseResult(
        case_id=case.case_id,
        symbol=case.symbol,
        role=case.role,
        observed_phase_path=observed_path,
        current_phase=replay.current_phase,
        phase_fidelity=phase_fidelity,
        phase_depth_progress=depth_progress,
        entry_hit=entry_hit,
        target_hit=target_hit,
        lead_bars=lead_bars,
        score=score,
        failed_reason_counts=attempt_summary.failed_reason_counts,
        missing_block_counts=attempt_summary.missing_block_counts,
        entry_close=entry_close,
        forward_peak_return_pct=forward_peak_return_pct,
        entry_next_open=entry_next_open,
        realistic_forward_peak_return_pct=realistic_forward_peak_return_pct,
    )


def evaluate_variant_against_pack(
    pack: ReplayBenchmarkPack,
    variant: PatternVariantSpec,
    *,
    warmup_bars: int = 240,
) -> VariantSearchResult:
    pattern = build_variant_pattern(variant.pattern_slug, variant)
    case_results = [
        evaluate_variant_on_case(pattern, case, timeframe=variant.timeframe, warmup_bars=warmup_bars)
        for case in pack.cases
    ]
    reference_scores = [case.score for case in case_results if case.role == "reference"]
    holdout_scores = [case.score for case in case_results if case.role == "holdout"]
    reference_score = mean(reference_scores) if reference_scores else 0.0
    holdout_score = mean(holdout_scores) if holdout_scores else None
    overall = reference_score if holdout_score is None else (0.7 * reference_score + 0.3 * holdout_score)
    return VariantSearchResult(
        variant_id=variant.variant_id,
        variant_slug=variant.variant_slug,
        reference_score=round(reference_score, 6),
        holdout_score=round(holdout_score, 6) if holdout_score is not None else None,
        overall_score=round(overall, 6),
        case_results=case_results,
    )


def _find_variant_spec(
    variants: list[PatternVariantSpec],
    *,
    variant_slug: str,
) -> PatternVariantSpec | None:
    for variant in variants:
        if variant.variant_slug == variant_slug:
            return variant
    return None


def _sync_active_variant_registry(
    *,
    store: ActivePatternVariantStore,
    pattern_slug: str,
    winner: VariantSearchResult,
    variants: list[PatternVariantSpec],
    promotion_report: PromotionReport,
    research_run_id: str,
    baseline_ref: str,
) -> ActivePatternVariantEntry:
    spec = _find_variant_spec(variants, variant_slug=winner.variant_slug)
    timeframe = spec.timeframe if spec is not None else get_pattern(pattern_slug).timeframe
    pattern = (
        build_variant_pattern(pattern_slug, spec)
        if spec is not None
        else get_pattern(pattern_slug)
    )
    entry = ActivePatternVariantEntry(
        pattern_slug=pattern_slug,
        variant_slug=winner.variant_slug,
        timeframe=timeframe,
        watch_phases=derive_watch_phases_from_pattern(pattern),
        source_kind="benchmark_search",
        source_ref=baseline_ref,
        research_run_id=research_run_id,
        promotion_report_id=promotion_report.promotion_report_id,
    )
    store.upsert(entry)
    return entry


def run_pattern_benchmark_search(
    config: PatternBenchmarkSearchConfig,
    *,
    controller: ResearchWorkerController | None = None,
    pack_store: BenchmarkPackStore | None = None,
    artifact_store: PatternSearchArtifactStore | None = None,
    negative_memory_store: NegativeSearchMemoryStore | None = None,
    active_variant_store: ActivePatternVariantStore | None = None,
) -> ResearchRun:
    controller = controller or ResearchWorkerController()
    pack_store = pack_store or BenchmarkPackStore()
    artifact_store = artifact_store or PatternSearchArtifactStore()
    negative_memory_store = negative_memory_store or NegativeSearchMemoryStore()
    active_variant_store = active_variant_store or ACTIVE_PATTERN_VARIANT_STORE
    pack = (
        pack_store.load(config.benchmark_pack_id)
        if config.benchmark_pack_id is not None
        else pack_store.ensure_default_pack(config.pattern_slug)
    )
    family_policy = DEFAULT_FAMILY_SELECTION_POLICY
    if pack is None:
        raise KeyError(f"Benchmark pack not found: {config.benchmark_pack_id}")
    supported_timeframes = _filter_candidate_timeframes_for_pack(
        pack,
        base_timeframe=get_pattern(config.pattern_slug).timeframe,
    )
    if not supported_timeframes:
        raise ValueError(
            f"No locally supported candidate timeframes for benchmark pack {pack.benchmark_pack_id}"
        )
    variants = build_search_variants(
        config.pattern_slug,
        variants=config.variants,
        candidate_timeframes=supported_timeframes,
        negative_memory_store=negative_memory_store,
        artifact_store=artifact_store,
    )
    spec = ResearchJobSpec(
        pattern_slug=config.pattern_slug,
        objective_id=config.objective_id or f"benchmark-search:{pack.benchmark_pack_id}",
        baseline_ref=f"benchmark-pack:{pack.benchmark_pack_id}",
        search_policy={
            "mode": "benchmark-pack-search",
            "n_variants": len(variants),
            "family_selection_policy": family_policy.to_dict(),
        },
        evaluation_protocol={
            "candidate_timeframes": supported_timeframes,
            "n_cases": len(pack.cases),
            "min_reference_score": config.min_reference_score,
            "min_holdout_score": config.min_holdout_score,
            "warmup_bars": config.warmup_bars,
        },
        definition_ref=definition_ref,
    )

    def _execute(run: ResearchRun) -> ResearchJobResult:
        run_definition_ref = run.definition_ref or definition_ref
        recent_artifacts = artifact_store.list(config.pattern_slug, limit=5)
        variant_results = [
            evaluate_variant_against_pack(pack, variant, warmup_bars=config.warmup_bars)
            for variant in variants
        ]
        winner = max(variant_results, key=lambda result: result.overall_score, default=None)
        variant_deltas = build_variant_delta_insights(variant_results)
        branch_insights = build_mutation_branch_insights(variant_deltas)
        family_insights = build_search_family_insights(variant_results, variants, branch_insights)
        timeframe_recommendations = build_timeframe_recommendations(
            family_insights, variant_results, variants
        )
        duration_recommendations = build_duration_recommendations(
            family_insights, variant_results, variants
        )
        promotion_report = (
            build_promotion_report(config.pattern_slug, winner)
            if winner is not None
            else None
        )
        active_family = select_active_family_insight(family_insights, recent_artifacts, family_policy)
        artifact = PatternSearchRunArtifact(
            research_run_id=run.research_run_id,
            pattern_slug=config.pattern_slug,
            definition_ref=run_definition_ref,
            benchmark_pack_id=pack.benchmark_pack_id,
            winner_variant_slug=winner.variant_slug if winner is not None else None,
            search_query_spec=copy.deepcopy(config.search_query_spec),
            variant_results=variant_results,
            variant_specs=variants,
            variant_deltas=variant_deltas,
            branch_insights=branch_insights,
            family_insights=family_insights,
            timeframe_recommendations=timeframe_recommendations,
            duration_recommendations=duration_recommendations,
            promotion_report=promotion_report,
            family_policy=family_policy,
            active_family_key=active_family.family_key if active_family is not None else None,
            active_family_type=active_family.family_type if active_family is not None else None,
            active_family_variant_slug=active_family.representative_variant_slug if active_family is not None else None,
        )
        artifact_store.save(artifact)

        if winner is None:
            return ResearchJobResult(
                disposition="dead_end",
                selection_decision=SelectionDecisionInput(
                    decision_kind="dead_end",
                    rationale="No variants were evaluated.",
                    baseline_ref=run.baseline_ref,
                    metrics={},
                ),
                memory_notes=[
                    ResearchMemoryInput(
                        note_kind="dead_end",
                        summary="Benchmark search produced no evaluated variants.",
                        tags=["benchmark-pack", config.pattern_slug],
                    )
                ],
            )

        passed_reference = winner.reference_score >= config.min_reference_score
        passed_holdout = winner.holdout_score is None or winner.holdout_score >= config.min_holdout_score
        metrics = {
            "definition_ref": run_definition_ref,
            "benchmark_pack_id": pack.benchmark_pack_id,
            "winner_variant_slug": winner.variant_slug,
            "reference_score": winner.reference_score,
            "holdout_score": winner.holdout_score,
            "overall_score": winner.overall_score,
            "active_family_key": active_family.family_key if active_family is not None else None,
            "active_family_type": active_family.family_type if active_family is not None else None,
            "active_family_variant_slug": active_family.representative_variant_slug if active_family is not None else None,
            "baseline_family_ref": _family_ref(active_family),
            "family_policy_id": family_policy.policy_id,
            "promotion_decision": promotion_report.decision if promotion_report is not None else None,
            "promotion_report_id": promotion_report.promotion_report_id if promotion_report is not None else None,
            "promotion_gate_policy_id": promotion_report.gate_policy.policy_id if promotion_report is not None else None,
            "promoted_variant_slug": (
                winner.variant_slug
                if promotion_report is not None and promotion_report.decision == "promote_candidate"
                else None
            ),
            "promoted_family_ref": (
                _family_ref(active_family)
                if promotion_report is not None and promotion_report.decision == "promote_candidate"
                else None
            ),
            "reference_recall": promotion_report.reference_recall if promotion_report is not None else None,
            "phase_fidelity": promotion_report.phase_fidelity if promotion_report is not None else None,
            "lead_time_bars": promotion_report.lead_time_bars if promotion_report is not None else None,
            "false_discovery_rate": promotion_report.false_discovery_rate if promotion_report is not None else None,
            "robustness_spread": promotion_report.robustness_spread if promotion_report is not None else None,
            "holdout_passed": promotion_report.holdout_passed if promotion_report is not None else None,
        }
        active_registry_entry: ActivePatternVariantEntry | None = None
        if (
            passed_reference
            and passed_holdout
            and promotion_report is not None
            and promotion_report.decision == "promote_candidate"
        ):
            active_registry_entry = _sync_active_variant_registry(
                store=active_variant_store,
                pattern_slug=config.pattern_slug,
                winner=winner,
                variants=variants,
                promotion_report=promotion_report,
                research_run_id=run.research_run_id,
                baseline_ref=run.baseline_ref,
            )
            metrics["active_registry_variant_slug"] = active_registry_entry.variant_slug
            metrics["active_registry_timeframe"] = active_registry_entry.timeframe
            metrics["active_registry_watch_phases"] = list(active_registry_entry.watch_phases)
        if passed_reference and passed_holdout:
            rationale = (
                f"Variant {winner.variant_slug} cleared benchmark-pack search floors "
                f"(reference={winner.reference_score:.3f}, holdout={winner.holdout_score if winner.holdout_score is not None else 'n/a'})."
            )
            return ResearchJobResult(
                disposition="no_op",
                winner_variant_ref=winner.variant_slug,
                handoff_payload={
                    "artifact_ref": f"pattern-search:{run.research_run_id}",
                    "definition_ref": run_definition_ref,
                    "active_family_key": active_family.family_key if active_family is not None else None,
                    "active_family_type": active_family.family_type if active_family is not None else None,
                    "active_family_variant_slug": active_family.representative_variant_slug if active_family is not None else None,
                    "baseline_family_ref": _family_ref(active_family),
                    "family_policy_id": family_policy.policy_id,
                    "promotion_decision": promotion_report.decision if promotion_report is not None else None,
                    "promotion_report_id": promotion_report.promotion_report_id if promotion_report is not None else None,
                    "promotion_rejection_reasons": list(promotion_report.rejection_reasons) if promotion_report is not None else [],
                    "promoted_variant_slug": (
                        winner.variant_slug
                        if promotion_report is not None and promotion_report.decision == "promote_candidate"
                        else None
                    ),
                    "promoted_family_ref": (
                        _family_ref(active_family)
                        if promotion_report is not None and promotion_report.decision == "promote_candidate"
                        else None
                    ),
                    "active_registry_variant_slug": (
                        active_registry_entry.variant_slug if active_registry_entry is not None else None
                    ),
                    "active_registry_timeframe": (
                        active_registry_entry.timeframe if active_registry_entry is not None else None
                    ),
                    "active_registry_watch_phases": (
                        list(active_registry_entry.watch_phases) if active_registry_entry is not None else None
                    ),
                },
                selection_decision=SelectionDecisionInput(
                    decision_kind="advance",
                    rationale=rationale,
                    baseline_ref=run.baseline_ref,
                    selected_variant_ref=winner.variant_slug,
                    metrics=metrics,
                ),
                memory_notes=[
                    ResearchMemoryInput(
                        note_kind="breakthrough",
                        summary="Benchmark search found a replay-robust candidate variant.",
                        detail=rationale,
                        tags=["benchmark-pack", "variant", config.pattern_slug],
                    )
                ],
            )

        rationale = (
            f"Best variant {winner.variant_slug} did not clear benchmark floors "
            f"(reference={winner.reference_score:.3f}, holdout={winner.holdout_score if winner.holdout_score is not None else 'n/a'})."
        )
        all_scores = [result.overall_score for result in variant_results]
        flat_landscape = len({round(score, 6) for score in all_scores}) <= 1
        negative_memory_store.save(
            NegativeSearchMemoryEntry(
                memory_id=str(uuid.uuid4()),
                pattern_slug=config.pattern_slug,
                research_run_id=run.research_run_id,
                benchmark_pack_id=pack.benchmark_pack_id,
                winner_variant_slug=winner.variant_slug,
                summary="Benchmark search dead end",
                detail=rationale,
                tags=[
                    "benchmark-pack",
                    "dead-end",
                    "flat-landscape" if flat_landscape else "variant-miss",
                    config.pattern_slug,
                ],
                variant_scores=[
                    {
                        "variant_slug": result.variant_slug,
                        "reference_score": result.reference_score,
                        "holdout_score": result.holdout_score,
                        "overall_score": result.overall_score,
                    }
                    for result in variant_results
                ],
                family_scores=[
                    {
                        "family_key": insight.family_key,
                        "family_type": insight.family_type,
                        "representative_variant_slug": insight.representative_variant_slug,
                        "best_reference_score": insight.best_reference_score,
                        "best_holdout_score": insight.best_holdout_score,
                        "best_overall_score": insight.best_overall_score,
                        "family_score": insight.family_score,
                        "classification": insight.classification,
                    }
                    for insight in family_insights
                ],
                family_policy=family_policy.to_dict(),
                active_family_key=active_family.family_key if active_family is not None else None,
                active_family_type=active_family.family_type if active_family is not None else None,
                active_family_variant_slug=active_family.representative_variant_slug if active_family is not None else None,
                baseline_family_ref=_family_ref(active_family),
            )
        )
        return ResearchJobResult(
            disposition="dead_end",
            winner_variant_ref=winner.variant_slug,
            handoff_payload={
                "artifact_ref": f"pattern-search:{run.research_run_id}",
                "definition_ref": run_definition_ref,
                "active_family_key": active_family.family_key if active_family is not None else None,
                "active_family_type": active_family.family_type if active_family is not None else None,
                "active_family_variant_slug": active_family.representative_variant_slug if active_family is not None else None,
                "baseline_family_ref": _family_ref(active_family),
                "family_policy_id": family_policy.policy_id,
                "promotion_decision": promotion_report.decision if promotion_report is not None else None,
                "promotion_report_id": promotion_report.promotion_report_id if promotion_report is not None else None,
                "promotion_rejection_reasons": list(promotion_report.rejection_reasons) if promotion_report is not None else [],
                "promoted_variant_slug": (
                    winner.variant_slug
                    if promotion_report is not None and promotion_report.decision == "promote_candidate"
                    else None
                ),
                "promoted_family_ref": (
                    _family_ref(active_family)
                    if promotion_report is not None and promotion_report.decision == "promote_candidate"
                    else None
                ),
            },
            selection_decision=SelectionDecisionInput(
                decision_kind="dead_end",
                rationale=rationale,
                baseline_ref=run.baseline_ref,
                selected_variant_ref=winner.variant_slug,
                metrics=metrics,
            ),
            memory_notes=[
                ResearchMemoryInput(
                    note_kind="dead_end",
                    summary="Benchmark search winner still missed the reference or holdout floor.",
                    detail=rationale,
                    tags=["benchmark-pack", "dead-end", config.pattern_slug],
                )
            ],
        )

    return controller.run_bounded_job(spec, execute=_execute)


def _resolve_definition_ref(*, pattern_slug: str, definition_id: str | None) -> dict:
    service = PatternDefinitionService()
    if definition_id:
        parsed = service.parse_definition_id(definition_id)
        return (
            service.get_definition_ref(
                pattern_slug=parsed["pattern_slug"],
                pattern_version=parsed["pattern_version"],
            )
            or parsed
        )
    return service.get_definition_ref(pattern_slug=pattern_slug) or {"pattern_slug": pattern_slug}


def pattern_benchmark_search_payload(
    run: ResearchRun,
    *,
    controller: ResearchWorkerController | None = None,
    artifact_store: PatternSearchArtifactStore | None = None,
    negative_memory_store: NegativeSearchMemoryStore | None = None,
) -> dict:
    controller = controller or ResearchWorkerController()
    artifact_store = artifact_store or PatternSearchArtifactStore()
    negative_memory_store = negative_memory_store or NegativeSearchMemoryStore()
    decision = controller.store.get_selection_decision(run.research_run_id)
    notes = controller.store.list_memory_notes(research_run_id=run.research_run_id)
    artifact = artifact_store.load(run.research_run_id)
    return {
        "research_run": asdict(run),
        "selection_decision": asdict(decision) if decision is not None else None,
        "memory_notes": [asdict(note) for note in notes],
        "artifact": artifact,
        "negative_memory": negative_memory_store.list(run.pattern_slug, limit=5),
    }
