"""W-0321 — exceptions.py smoke tests."""
from __future__ import annotations

from personalization.exceptions import (
    ColdStartError,
    PatternNotFoundError,
    PersonalizationError,
    StateCorruptedError,
)


def test_all_errors_inherit_from_base():
    for cls in (ColdStartError, PatternNotFoundError, StateCorruptedError):
        assert issubclass(cls, PersonalizationError)
        err = cls("test message")
        assert str(err) == "test message"
        assert isinstance(err, Exception)
