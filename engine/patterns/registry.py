"""Pattern registry — JSON-backed, versioned canonical source of truth.

Persists pattern metadata to disk so every restart has a stable, queryable
record of which patterns are defined, their version, and who created them.

Relationship to library.py:
  library.py   — defines PatternObject instances in Python code (seeding source)
  registry.py  — stores per-slug metadata JSON in engine/pattern_registry/
  PATTERN_LIBRARY (dict) — runtime in-memory map; seeded from library on startup

The registry is intentionally lightweight: it stores metadata (slug, version,
source, timeframe, direction, tags, created_at) rather than duplicating the
full phase graph. PatternObject remains the authoritative in-memory definition.
"""
from __future__ import annotations

import json
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from patterns.types import PatternObject

REGISTRY_DIR = Path(__file__).parent.parent / "pattern_registry"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class PatternRegistryEntry:
    """Canonical registry record for one pattern."""
    slug: str
    version: int
    source: str                   # "system" | "user" | "api"
    direction: str                # "long" | "short"
    timeframe: str
    tags: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=_utcnow)
    updated_at: str = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "PatternRegistryEntry":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})

    @classmethod
    def from_pattern(cls, pattern: "PatternObject") -> "PatternRegistryEntry":
        return cls(
            slug=pattern.slug,
            version=pattern.version,
            source=pattern.created_by,
            direction=pattern.direction,
            timeframe=pattern.timeframe,
            tags=list(pattern.tags),
        )


class PatternRegistryStore:
    """JSON-backed, per-slug pattern registry."""

    def __init__(self, base_dir: Path = REGISTRY_DIR) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, slug: str) -> Path:
        return self.base_dir / f"{slug}.json"

    def get(self, slug: str) -> PatternRegistryEntry | None:
        path = self._path(slug)
        if not path.exists():
            return None
        with open(path) as f:
            return PatternRegistryEntry.from_dict(json.load(f))

    def list_all(self) -> list[PatternRegistryEntry]:
        entries = []
        for path in sorted(self.base_dir.glob("*.json")):
            try:
                with open(path) as f:
                    entries.append(PatternRegistryEntry.from_dict(json.load(f)))
            except Exception:
                continue
        return entries

    def upsert(self, entry: PatternRegistryEntry) -> None:
        """Write or overwrite a registry entry atomically."""
        path = self._path(entry.slug)
        data = entry.to_dict()
        with tempfile.NamedTemporaryFile("w", dir=self.base_dir, delete=False, suffix=".tmp") as f:
            json.dump(data, f, indent=2)
            tmp = Path(f.name)
        tmp.replace(path)

    def seed_from_library(self, pattern_library: dict) -> int:
        """Seed registry from the in-memory PATTERN_LIBRARY on startup.

        Only writes entries that don't exist yet (preserves user-created patterns).
        Returns number of new entries written.
        """
        written = 0
        for slug, pattern in pattern_library.items():
            if self.get(slug) is not None:
                continue  # already registered, preserve existing metadata
            entry = PatternRegistryEntry.from_pattern(pattern)
            self.upsert(entry)
            written += 1
        return written


PATTERN_REGISTRY_STORE = PatternRegistryStore()
