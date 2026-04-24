"""Pattern alert policy plane.

Separates raw state-machine candidates from user-visible candidates.
"""
from __future__ import annotations

import json
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from ledger.types import PatternOutcome
from patterns.definitions import current_definition_id
from patterns.model_registry import MODEL_REGISTRY_STORE

AlertPolicyMode = Literal["shadow", "visible", "gated"]

ALERT_POLICY_DIR = Path(__file__).parent.parent / "alert_policies"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class PatternAlertPolicy:
    pattern_slug: str
    mode: AlertPolicyMode = "visible"
    updated_at: datetime = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        data = asdict(self)
        if isinstance(data["updated_at"], datetime):
            data["updated_at"] = data["updated_at"].isoformat()
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "PatternAlertPolicy":
        parsed = dict(data)
        if isinstance(parsed.get("updated_at"), str):
            parsed["updated_at"] = datetime.fromisoformat(parsed["updated_at"])
        return cls(**parsed)


@dataclass(frozen=True)
class AlertPolicyDecision:
    mode: AlertPolicyMode
    visible: bool
    reason: str

    def to_dict(self) -> dict:
        return {
            "mode": self.mode,
            "visible": self.visible,
            "reason": self.reason,
        }


class PatternAlertPolicyStore:
    def __init__(self, base_dir: Path = ALERT_POLICY_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, pattern_slug: str) -> Path:
        return self.base_dir / f"{pattern_slug}.json"

    def load(self, pattern_slug: str) -> PatternAlertPolicy:
        path = self._path(pattern_slug)
        if not path.exists():
            return PatternAlertPolicy(pattern_slug=pattern_slug)
        with open(path) as f:
            data = json.load(f)
        return PatternAlertPolicy.from_dict(data)

    def save(self, policy: PatternAlertPolicy) -> Path:
        policy.updated_at = _utcnow()
        path = self._path(policy.pattern_slug)
        with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as f:
            json.dump(policy.to_dict(), f, indent=2)
            temp_path = Path(f.name)
        temp_path.replace(path)
        return path


def evaluate_alert_policy(pattern_slug: str, outcome: PatternOutcome | None) -> AlertPolicyDecision:
    policy = ALERT_POLICY_STORE.load(pattern_slug)

    if policy.mode == "shadow":
        return AlertPolicyDecision(mode=policy.mode, visible=False, reason="policy_shadow")

    if policy.mode == "visible":
        return AlertPolicyDecision(mode=policy.mode, visible=True, reason="policy_visible")

    definition_id = current_definition_id(pattern_slug)
    active_model = MODEL_REGISTRY_STORE.get_active(pattern_slug, definition_id=definition_id)
    if active_model is None and definition_id is not None:
        active_model = MODEL_REGISTRY_STORE.get_active(pattern_slug)
    if active_model is None:
        return AlertPolicyDecision(mode=policy.mode, visible=False, reason="no_active_model")
    if outcome is None:
        return AlertPolicyDecision(mode=policy.mode, visible=False, reason="missing_entry_score")
    if outcome.entry_ml_state != "scored":
        return AlertPolicyDecision(mode=policy.mode, visible=False, reason="active_model_unscored")
    if outcome.entry_rollout_state != "active":
        return AlertPolicyDecision(mode=policy.mode, visible=False, reason="non_active_rollout_score")
    if outcome.entry_model_key != active_model.model_key:
        return AlertPolicyDecision(mode=policy.mode, visible=False, reason="active_model_key_mismatch")
    if outcome.entry_model_version != active_model.model_version:
        return AlertPolicyDecision(mode=policy.mode, visible=False, reason="active_model_mismatch")
    if outcome.entry_threshold_passed is True:
        return AlertPolicyDecision(mode=policy.mode, visible=True, reason="active_threshold_passed")
    return AlertPolicyDecision(mode=policy.mode, visible=False, reason="active_threshold_blocked")


ALERT_POLICY_STORE = PatternAlertPolicyStore()
