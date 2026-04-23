from __future__ import annotations

from dataclasses import asdict
from typing import Any

from capture.store import CaptureStore
from capture.types import CaptureRecord
from patterns.library import PATTERN_LIBRARY
from patterns.registry import PATTERN_REGISTRY_STORE, PatternRegistryEntry, PatternRegistryStore
from patterns.types import PatternObject


def _definition_id(pattern: PatternObject) -> str:
    return f"{pattern.slug}:v{pattern.version}"


def current_definition_id(pattern_slug: str) -> str | None:
    pattern = PATTERN_LIBRARY.get(pattern_slug)
    if pattern is None:
        return None
    return _definition_id(pattern)


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        text = value.strip()
        if not text or text in seen:
            continue
        seen.add(text)
        ordered.append(text)
    return ordered


class PatternDefinitionService:
    """Compose canonical pattern definition read models from existing stores."""

    def __init__(
        self,
        *,
        capture_store: CaptureStore | None = None,
        registry_store: PatternRegistryStore | None = None,
        pattern_library: dict[str, PatternObject] | None = None,
    ) -> None:
        self.capture_store = capture_store or CaptureStore()
        self.registry_store = registry_store or PATTERN_REGISTRY_STORE
        self.pattern_library = pattern_library or PATTERN_LIBRARY

    def list_definitions(self, *, limit: int = 100) -> list[dict[str, Any]]:
        summaries: list[dict[str, Any]] = []
        for slug in sorted(self.pattern_library):
            pattern = self.pattern_library[slug]
            evidence = self._load_capture_evidence(slug, limit=10)
            thesis = self._collect_thesis(pattern, evidence)
            registry = self._registry_entry(pattern)
            latest_capture_at_ms = evidence[0]["captured_at_ms"] if evidence else None
            summaries.append(
                {
                    "definition_id": _definition_id(pattern),
                    "pattern_slug": pattern.slug,
                    "pattern_family": self._pattern_family(pattern, evidence),
                    "name": pattern.name,
                    "timeframe": pattern.timeframe,
                    "direction": pattern.direction,
                    "version": pattern.version,
                    "entry_phase": pattern.entry_phase,
                    "target_phase": pattern.target_phase,
                    "tags": list(pattern.tags),
                    "thesis": thesis,
                    "evidence_count": len(evidence),
                    "latest_capture_at_ms": latest_capture_at_ms,
                    "registry": registry.to_dict(),
                }
            )
            if len(summaries) >= limit:
                break
        return summaries

    def get_definition(self, slug: str) -> dict[str, Any]:
        pattern = self.pattern_library.get(slug)
        if pattern is None:
            raise KeyError(slug)
        evidence = self._load_capture_evidence(slug, limit=20)
        registry = self._registry_entry(pattern)
        return {
            "definition_id": _definition_id(pattern),
            "pattern_slug": pattern.slug,
            "pattern_family": self._pattern_family(pattern, evidence),
            "name": pattern.name,
            "description": pattern.description,
            "timeframe": pattern.timeframe,
            "direction": pattern.direction,
            "version": pattern.version,
            "created_by": pattern.created_by,
            "entry_phase": pattern.entry_phase,
            "target_phase": pattern.target_phase,
            "tags": list(pattern.tags),
            "phase_template": [asdict(phase) for phase in pattern.phases],
            "thesis": self._collect_thesis(pattern, evidence),
            "registry": registry.to_dict(),
            "linked_evidence": evidence,
            "evidence_count": len(evidence),
            "latest_capture_at_ms": evidence[0]["captured_at_ms"] if evidence else None,
        }

    def get_definition_ref(
        self,
        *,
        pattern_slug: str,
        pattern_version: int | None = None,
    ) -> dict[str, Any] | None:
        pattern = self.pattern_library.get(pattern_slug)
        if pattern is None:
            return None
        version = pattern_version or pattern.version
        evidence = self._load_capture_evidence(pattern_slug, limit=10)
        return {
            "definition_id": f"{pattern.slug}:v{version}",
            "pattern_slug": pattern.slug,
            "pattern_version": version,
            "pattern_family": self._pattern_family(pattern, evidence),
            "timeframe": pattern.timeframe,
            "direction": pattern.direction,
        }

    def parse_definition_id(self, definition_id: str) -> dict[str, Any]:
        slug, separator, version_token = definition_id.partition(":v")
        if not slug or separator != ":v" or not version_token.isdigit():
            raise ValueError(definition_id)
        pattern = self.pattern_library.get(slug)
        if pattern is None:
            raise KeyError(slug)
        return {
            "definition_id": definition_id,
            "pattern_slug": slug,
            "pattern_version": int(version_token),
        }

    def _registry_entry(self, pattern: PatternObject) -> PatternRegistryEntry:
        return self.registry_store.get(pattern.slug) or PatternRegistryEntry.from_pattern(pattern)

    def _collect_thesis(self, pattern: PatternObject, evidence: list[dict[str, Any]]) -> list[str]:
        values: list[str] = []
        for item in evidence:
            for thesis in item.get("thesis", []):
                if isinstance(thesis, str):
                    values.append(thesis)
        thesis = _dedupe_strings(values)
        if thesis:
            return thesis
        return [pattern.description]

    def _pattern_family(self, pattern: PatternObject, evidence: list[dict[str, Any]]) -> str:
        values = _dedupe_strings(
            [
                item["pattern_family"]
                for item in evidence
                if isinstance(item.get("pattern_family"), str)
            ]
        )
        if values:
            return values[0]
        return pattern.slug.replace("-", "_")

    def _load_capture_evidence(self, slug: str, *, limit: int) -> list[dict[str, Any]]:
        captures = self.capture_store.list(pattern_slug=slug, limit=limit)
        evidence: list[dict[str, Any]] = []
        for capture in captures:
            if not capture.research_context:
                continue
            evidence.append(self._capture_to_evidence(capture))
        return evidence

    @staticmethod
    def _capture_to_evidence(capture: CaptureRecord) -> dict[str, Any]:
        research_context = capture.research_context or {}
        thesis = research_context.get("thesis")
        research_tags = research_context.get("research_tags")
        phase_annotations = research_context.get("phase_annotations")
        return {
            "evidence_id": f"capture:{capture.capture_id}",
            "capture_id": capture.capture_id,
            "capture_kind": capture.capture_kind,
            "symbol": capture.symbol,
            "timeframe": capture.timeframe,
            "phase": capture.phase,
            "captured_at_ms": capture.captured_at_ms,
            "user_note": capture.user_note,
            "pattern_family": research_context.get("pattern_family"),
            "thesis": thesis if isinstance(thesis, list) else [],
            "research_tags": research_tags if isinstance(research_tags, list) else [],
            "phase_annotations": phase_annotations if isinstance(phase_annotations, list) else [],
            "source": research_context.get("source"),
        }
