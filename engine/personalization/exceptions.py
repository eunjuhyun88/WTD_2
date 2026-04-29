"""Personalization domain exceptions."""
from __future__ import annotations


class PersonalizationError(Exception):
    """Base for personalization domain errors."""


class ColdStartError(PersonalizationError):
    """Raised when a warm-path operation is called for a cold-start user/pattern."""


class PatternNotFoundError(PersonalizationError):
    """Raised when pattern_slug is not found in ActivePatternVariantStore."""


class StateCorruptedError(PersonalizationError):
    """Raised when persisted state JSON fails schema validation."""
