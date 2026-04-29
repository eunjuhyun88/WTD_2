"""Pattern lifecycle status store — file-backed, D7 file-first.

Tracks the lifecycle status of each pattern (draft → candidate → object → archived).
This is a separate axis from the variant registry (which tracks *which variant* runs).

Lifecycle axis:
  draft      — created but not yet reviewed
  candidate  — under review, scanner registered
  object     — production-active
  archived   — retired

Variant axis (active_variant_registry):
  which concrete variant slug is active in live scanning

Bridge:
  draft → candidate: active_variant_registry.upsert() registers variant in scanner
  candidate → object: audit log only, no registry change
  * → archived: variant registry entry removed from scanner
"""
from __future__ import annotations

import json
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

LIFECYCLE_DIR = Path(__file__).parent.parent / "pattern_lifecycle"

VALID_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"candidate", "archived"},
    "candidate": {"object", "archived"},
    "object": {"archived"},
    "archived": set(),  # terminal
}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class PatternLifecycleEntry:
    slug: str
    status: Literal["draft", "candidate", "object", "archived"]
    promoted_at: Optional[str] = None
    created_at: str = field(default_factory=_utcnow)
    updated_at: str = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "PatternLifecycleEntry":
        return cls(
            slug=data["slug"],
            status=data["status"],
            promoted_at=data.get("promoted_at"),
            created_at=data.get("created_at", _utcnow()),
            updated_at=data.get("updated_at", _utcnow()),
        )


@dataclass
class PatternLifecycleEvent:
    slug: str
    from_status: str
    to_status: str
    reason: str
    user_id: Optional[str]
    created_at: str = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        return asdict(self)


EVENTS_FILE = LIFECYCLE_DIR / "_events.jsonl"


class PatternLifecycleStore:
    """JSON-backed lifecycle store. One JSON file per pattern slug."""

    def __init__(self, base_dir: Path = LIFECYCLE_DIR) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, slug: str) -> Path:
        return self.base_dir / f"{slug}.json"

    def get(self, slug: str) -> PatternLifecycleEntry | None:
        path = self._path(slug)
        if not path.exists():
            return None
        with open(path) as fh:
            return PatternLifecycleEntry.from_dict(json.load(fh))

    def get_or_default(self, slug: str) -> PatternLifecycleEntry:
        """Return existing entry or create a default 'object' entry (legacy patterns)."""
        entry = self.get(slug)
        if entry is None:
            entry = PatternLifecycleEntry(slug=slug, status="object")
            self.upsert(entry)
        return entry

    def upsert(self, entry: PatternLifecycleEntry) -> None:
        entry.updated_at = _utcnow()
        path = self._path(entry.slug)
        with tempfile.NamedTemporaryFile("w", dir=self.base_dir, delete=False, suffix=".tmp") as fh:
            json.dump(entry.to_dict(), fh, indent=2)
            tmp = Path(fh.name)
        tmp.replace(path)

    def list_all(self) -> list[PatternLifecycleEntry]:
        entries: list[PatternLifecycleEntry] = []
        for path in sorted(self.base_dir.glob("*.json")):
            try:
                with open(path) as fh:
                    entries.append(PatternLifecycleEntry.from_dict(json.load(fh)))
            except Exception:
                continue
        return entries

    def list_by_status(self, status: str) -> list[PatternLifecycleEntry]:
        return [e for e in self.list_all() if e.status == status]

    def append_event(self, event: PatternLifecycleEvent) -> None:
        """Append an audit event to the JSONL events log."""
        events_file = self.base_dir / "_events.jsonl"
        with open(events_file, "a") as fh:
            fh.write(json.dumps(event.to_dict()) + "\n")

    def transition(
        self,
        slug: str,
        new_status: Literal["draft", "candidate", "object", "archived"],
        reason: str = "",
        user_id: Optional[str] = None,
    ) -> PatternLifecycleEntry:
        """Validate and perform a status transition. Returns updated entry."""
        entry = self.get_or_default(slug)
        current = entry.status

        allowed = VALID_TRANSITIONS.get(current, set())
        if new_status not in allowed:
            raise ValueError(
                f"invalid transition: {current} → {new_status}. "
                f"Allowed: {sorted(allowed) or 'none (terminal)'}"
            )

        entry.status = new_status
        entry.promoted_at = _utcnow() if new_status in ("candidate", "object") else entry.promoted_at
        self.upsert(entry)

        event = PatternLifecycleEvent(
            slug=slug,
            from_status=current,
            to_status=new_status,
            reason=reason,
            user_id=user_id,
        )
        self.append_event(event)

        return entry


PATTERN_LIFECYCLE_STORE = PatternLifecycleStore()
