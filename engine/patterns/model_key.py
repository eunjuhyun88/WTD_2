"""Pattern model identity helpers."""
from __future__ import annotations


def make_pattern_model_key(
    pattern_slug: str,
    timeframe: str,
    target_name: str,
    feature_schema_version: int,
    label_policy_version: int,
) -> str:
    """Return the canonical identity for a pattern-scoped model family."""
    return (
        f"{pattern_slug}:{timeframe}:{target_name}:"
        f"fs{feature_schema_version}:lp{label_policy_version}"
    )
