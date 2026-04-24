"""Pattern model identity helpers."""
from __future__ import annotations

from typing import Any, Mapping


def definition_id_from_ref(definition_ref: Mapping[str, Any] | None) -> str | None:
    if definition_ref is None:
        return None
    value = definition_ref.get("definition_id")
    return value if isinstance(value, str) and value else None


def make_pattern_model_key(
    pattern_slug: str,
    timeframe: str,
    target_name: str,
    feature_schema_version: int,
    label_policy_version: int,
    *,
    definition_ref: Mapping[str, Any] | None = None,
) -> str:
    """Return the canonical identity for a pattern-scoped model family."""
    scope = definition_id_from_ref(definition_ref) or pattern_slug
    return (
        f"{scope}:{timeframe}:{target_name}:"
        f"fs{feature_schema_version}:lp{label_policy_version}"
    )
