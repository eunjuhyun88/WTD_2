"""Durable active-pattern-variant registry for live runtime.

This store answers a different question from ``patterns.registry``:

- ``patterns.registry``: which pattern families exist?
- ``active_variant_registry``: which concrete variant should live runtime scan now?

The first production slice supports one active variant per pattern family.
Entries are JSON-backed so benchmark-search promotion can update them without
source edits, and live-monitor can survive process restarts.
"""
from __future__ import annotations

import json
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ACTIVE_VARIANT_REGISTRY_DIR = Path(__file__).parent.parent / "pattern_active_variants"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ActivePatternVariantEntry:
    pattern_slug: str
    variant_slug: str
    timeframe: str
    watch_phases: list[str]
    source_kind: str = "seed"  # "seed" | "benchmark_search" | "operator"
    source_ref: str | None = None
    research_run_id: str | None = None
    promotion_report_id: str | None = None
    created_at: str = field(default_factory=_utcnow)
    updated_at: str = field(default_factory=_utcnow)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "ActivePatternVariantEntry":
        return cls(
            pattern_slug=payload["pattern_slug"],
            variant_slug=payload["variant_slug"],
            timeframe=payload["timeframe"],
            watch_phases=list(payload.get("watch_phases", [])),
            source_kind=payload.get("source_kind", "seed"),
            source_ref=payload.get("source_ref"),
            research_run_id=payload.get("research_run_id"),
            promotion_report_id=payload.get("promotion_report_id"),
            created_at=payload.get("created_at", _utcnow()),
            updated_at=payload.get("updated_at", _utcnow()),
        )


DEFAULT_ACTIVE_PATTERN_VARIANTS: list[ActivePatternVariantEntry] = [
    ActivePatternVariantEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        timeframe="1h",
        watch_phases=["ACCUMULATION", "REAL_DUMP"],
    ),
    ActivePatternVariantEntry(
        pattern_slug="funding-flip-reversal-v1",
        variant_slug="funding-flip-reversal-v1__canonical__dur-long",
        timeframe="1h",
        watch_phases=["ENTRY_ZONE", "FLIP_SIGNAL"],
    ),
    ActivePatternVariantEntry(
        pattern_slug="wyckoff-spring-reversal-v1",
        variant_slug="wyckoff-spring-reversal-v1__canonical__dur-long",
        timeframe="1h",
        watch_phases=["SPRING", "SIGN_OF_STRENGTH"],
    ),
    ActivePatternVariantEntry(
        pattern_slug="whale-accumulation-reversal-v1",
        variant_slug="whale-accumulation-reversal-v1__canonical__dur-long",
        timeframe="1h",
        watch_phases=["BOTTOM_CONFIRM", "WHALE_ACCUMULATION"],
    ),
    ActivePatternVariantEntry(
        pattern_slug="volume-absorption-reversal-v1",
        variant_slug="volume-absorption-reversal-v1__canonical",
        timeframe="1h",
        watch_phases=["SELLING_CLIMAX", "ABSORPTION"],
    ),
    ActivePatternVariantEntry(
        pattern_slug="compression-breakout-reversal-v1",
        variant_slug="compression-breakout-reversal-v1__cbr-v1",
        timeframe="1h",
        watch_phases=["SETUP", "COILING"],
    ),
]


def derive_watch_phases_from_pattern(pattern) -> list[str]:
    phase_ids = [phase.phase_id for phase in pattern.phases]
    entry_phase = pattern.entry_phase
    watch = [entry_phase]
    try:
        entry_idx = phase_ids.index(entry_phase)
    except ValueError:
        return watch
    if entry_idx > 0:
        watch.append(phase_ids[entry_idx - 1])
    deduped: list[str] = []
    for phase_id in watch:
        if phase_id not in deduped:
            deduped.append(phase_id)
    return deduped


class ActivePatternVariantStore:
    def __init__(self, base_dir: Path = ACTIVE_VARIANT_REGISTRY_DIR) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, pattern_slug: str) -> Path:
        return self.base_dir / f"{pattern_slug}.json"

    def get(self, pattern_slug: str) -> ActivePatternVariantEntry | None:
        path = self._path(pattern_slug)
        if not path.exists():
            return None
        with open(path) as fh:
            return ActivePatternVariantEntry.from_dict(json.load(fh))

    def list_all(self) -> list[ActivePatternVariantEntry]:
        entries: list[ActivePatternVariantEntry] = []
        for path in sorted(self.base_dir.glob("*.json")):
            try:
                with open(path) as fh:
                    entries.append(ActivePatternVariantEntry.from_dict(json.load(fh)))
            except Exception:
                continue
        return entries

    def upsert(self, entry: ActivePatternVariantEntry) -> None:
        entry.updated_at = _utcnow()
        path = self._path(entry.pattern_slug)
        with tempfile.NamedTemporaryFile("w", dir=self.base_dir, delete=False, suffix=".tmp") as fh:
            json.dump(entry.to_dict(), fh, indent=2)
            tmp = Path(fh.name)
        tmp.replace(path)

    def seed_defaults(self, defaults: list[ActivePatternVariantEntry] | None = None) -> int:
        seeded = 0
        for entry in defaults or DEFAULT_ACTIVE_PATTERN_VARIANTS:
            if self.get(entry.pattern_slug) is not None:
                continue
            self.upsert(
                ActivePatternVariantEntry.from_dict(entry.to_dict())
            )
            seeded += 1
        return seeded

    def list_effective(
        self,
        defaults: list[ActivePatternVariantEntry] | None = None,
    ) -> list[ActivePatternVariantEntry]:
        entries = self.list_all()
        if entries:
            return entries
        self.seed_defaults(defaults)
        return self.list_all()


ACTIVE_PATTERN_VARIANT_STORE = ActivePatternVariantStore()
