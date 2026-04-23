"""Pattern model registry.

Keeps a durable current-state snapshot of pattern-scoped models so runtime
scoring can distinguish candidate vs active rollout state.
"""
from __future__ import annotations

import json
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

RolloutState = Literal["candidate", "active", "paused", "retired"]

MODEL_REGISTRY_DIR = Path(__file__).parent.parent / "model_registry"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _definition_id_from_ref(definition_ref: dict | None) -> str | None:
    if not isinstance(definition_ref, dict):
        return None
    value = definition_ref.get("definition_id")
    return value if isinstance(value, str) and value else None


@dataclass
class PatternModelRegistryEntry:
    pattern_slug: str
    model_key: str
    model_version: str
    timeframe: str
    target_name: str
    feature_schema_version: int
    label_policy_version: int
    threshold_policy_version: int = 1
    rollout_state: RolloutState = "candidate"
    requested_by_user_id: str | None = None
    definition_id: str | None = None
    definition_ref: dict = field(default_factory=dict)
    trained_at: datetime = field(default_factory=_utcnow)
    promoted_at: datetime | None = None
    updated_at: datetime = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        data = asdict(self)
        for key in ("trained_at", "promoted_at", "updated_at"):
            if isinstance(data.get(key), datetime):
                data[key] = data[key].isoformat()
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "PatternModelRegistryEntry":
        parsed = dict(data)
        for key in ("trained_at", "promoted_at", "updated_at"):
            value = parsed.get(key)
            if isinstance(value, str):
                parsed[key] = datetime.fromisoformat(value)
        definition_ref = parsed.get("definition_ref")
        if not isinstance(definition_ref, dict):
            parsed["definition_ref"] = {}
        parsed["definition_id"] = parsed.get("definition_id") or _definition_id_from_ref(parsed["definition_ref"])
        return cls(**parsed)


class PatternModelRegistryStore:
    def __init__(self, base_dir: Path = MODEL_REGISTRY_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, pattern_slug: str) -> Path:
        return self.base_dir / f"{pattern_slug}.json"

    def list(
        self,
        pattern_slug: str,
        *,
        definition_id: str | None = None,
    ) -> list[PatternModelRegistryEntry]:
        path = self._path(pattern_slug)
        if not path.exists():
            return []
        with open(path) as f:
            payload = json.load(f)
        records = [PatternModelRegistryEntry.from_dict(row) for row in payload.get("entries", [])]
        if definition_id is not None:
            records = [row for row in records if row.definition_id == definition_id]
        records.sort(key=lambda row: row.updated_at, reverse=True)
        return records

    def save_all(self, pattern_slug: str, entries: list[PatternModelRegistryEntry]) -> Path:
        path = self._path(pattern_slug)
        payload = {
            "pattern_slug": pattern_slug,
            "entries": [entry.to_dict() for entry in entries],
        }
        with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as f:
            json.dump(payload, f, indent=2)
            temp_path = Path(f.name)
        temp_path.replace(path)
        return path

    def upsert_candidate(
        self,
        *,
        pattern_slug: str,
        model_key: str,
        model_version: str,
        timeframe: str,
        target_name: str,
        feature_schema_version: int,
        label_policy_version: int,
        threshold_policy_version: int = 1,
        requested_by_user_id: str | None = None,
        definition_ref: dict | None = None,
    ) -> PatternModelRegistryEntry:
        now = _utcnow()
        entries = self.list(pattern_slug)
        resolved_definition_ref = dict(definition_ref or {})
        definition_id = _definition_id_from_ref(resolved_definition_ref)
        for entry in entries:
            if entry.model_key == model_key and entry.model_version == model_version:
                entry.timeframe = timeframe
                entry.target_name = target_name
                entry.feature_schema_version = feature_schema_version
                entry.label_policy_version = label_policy_version
                entry.threshold_policy_version = threshold_policy_version
                entry.requested_by_user_id = requested_by_user_id
                entry.definition_ref = resolved_definition_ref
                entry.definition_id = definition_id
                if entry.rollout_state not in ("active",):
                    entry.rollout_state = "candidate"
                entry.updated_at = now
                self.save_all(pattern_slug, entries)
                return entry

        entry = PatternModelRegistryEntry(
            pattern_slug=pattern_slug,
            model_key=model_key,
            model_version=model_version,
            timeframe=timeframe,
            target_name=target_name,
            feature_schema_version=feature_schema_version,
            label_policy_version=label_policy_version,
            threshold_policy_version=threshold_policy_version,
            rollout_state="candidate",
            requested_by_user_id=requested_by_user_id,
            definition_id=definition_id,
            definition_ref=resolved_definition_ref,
            trained_at=now,
            updated_at=now,
        )
        entries.append(entry)
        self.save_all(pattern_slug, entries)
        return entry

    def get_active(
        self,
        pattern_slug: str,
        *,
        definition_id: str | None = None,
    ) -> PatternModelRegistryEntry | None:
        return next(
            (entry for entry in self.list(pattern_slug, definition_id=definition_id) if entry.rollout_state == "active"),
            None,
        )

    def get_preferred_scoring_model(
        self,
        pattern_slug: str,
        *,
        definition_id: str | None = None,
    ) -> PatternModelRegistryEntry | None:
        entries = self.list(pattern_slug, definition_id=definition_id)
        active = next((entry for entry in entries if entry.rollout_state == "active"), None)
        if active is not None:
            return active
        return next((entry for entry in entries if entry.rollout_state == "candidate"), None)

    def promote(
        self,
        *,
        pattern_slug: str,
        model_key: str,
        model_version: str,
        threshold_policy_version: int | None = None,
    ) -> PatternModelRegistryEntry:
        now = _utcnow()
        entries = self.list(pattern_slug)
        target: PatternModelRegistryEntry | None = None

        for entry in entries:
            if entry.rollout_state == "active":
                entry.rollout_state = "paused"
                entry.updated_at = now
            if entry.model_key == model_key and entry.model_version == model_version:
                target = entry

        if target is None:
            raise KeyError(f"Model not found: {pattern_slug} {model_key} {model_version}")

        target.rollout_state = "active"
        target.promoted_at = now
        target.updated_at = now
        if threshold_policy_version is not None:
            target.threshold_policy_version = threshold_policy_version

        self.save_all(pattern_slug, entries)
        return target


MODEL_REGISTRY_STORE = PatternModelRegistryStore()
