from __future__ import annotations

from typing import Any

from patterns.library import PATTERN_LIBRARY


def build_definition_id(pattern_slug: str, pattern_version: int | None) -> str | None:
    slug = pattern_slug.strip()
    if not slug:
        return None
    version = pattern_version if isinstance(pattern_version, int) and pattern_version > 0 else None
    if version is None:
        pattern = PATTERN_LIBRARY.get(slug)
        if pattern is not None:
            version = pattern.version
    if version is None:
        return None
    return f"{slug}:v{version}"


def definition_id_from_ref(definition_ref: dict[str, Any] | None) -> str | None:
    if not isinstance(definition_ref, dict):
        return None
    value = definition_ref.get("definition_id")
    return value if isinstance(value, str) and value else None


def build_definition_ref(
    pattern_slug: str,
    pattern_version: int | None,
    *,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    slug = pattern_slug.strip()
    if not slug:
        return dict(existing or {})

    ref = dict(existing or {})
    pattern = PATTERN_LIBRARY.get(slug)
    version = pattern_version if isinstance(pattern_version, int) and pattern_version > 0 else None
    if version is None and pattern is not None:
        version = pattern.version

    ref["pattern_slug"] = slug
    if version is not None:
        ref["pattern_version"] = version

    definition_id = definition_id_from_ref(ref) or build_definition_id(slug, version)
    if definition_id is not None:
        ref["definition_id"] = definition_id

    if pattern is not None:
        ref.setdefault("pattern_family", pattern.slug.replace("-", "_"))
        ref.setdefault("timeframe", pattern.timeframe)
        ref.setdefault("direction", pattern.direction)

    return ref

