"""Phase taxonomy registry for MM Hunter validation framework.

W-0256 Priority A3: D8 phase taxonomy augment-only addition.

This registry exposes named phase sequences so that ``BenchmarkCase``
instances can declare which taxonomy their ``expected_phase_path``
follows.  The default ``oi_reversal_5`` matches the legacy hard-coded
phases used in pattern_search.py default benchmark cases (FAKE_DUMP →
ARCH_ZONE → REAL_DUMP → ACCUMULATION → BREAKOUT) so existing data is
backward-compatible.

Adding a new taxonomy is a pure data operation (extend the dict).
``pattern_search.py`` requires zero edits to consume new taxonomies.
"""

from __future__ import annotations

from typing import Iterable


# Registry of canonical phase sequences. Keys are stable identifiers
# stored in ``BenchmarkCase.phase_taxonomy_id``.
TAXONOMY_REGISTRY: dict[str, list[str]] = {
    # Legacy / current default (matches pattern_search.py L599-L611 cases).
    "oi_reversal_5": [
        "FAKE_DUMP",
        "ARCH_ZONE",
        "REAL_DUMP",
        "ACCUMULATION",
        "BREAKOUT",
    ],
    # Wyckoff classical 4-phase market cycle.
    "wyckoff_4": [
        "accumulation",
        "markup",
        "distribution",
        "markdown",
    ],
}


DEFAULT_TAXONOMY_ID = "oi_reversal_5"


def get_taxonomy(taxonomy_id: str) -> list[str]:
    """Return the canonical phase sequence for ``taxonomy_id``.

    Raises:
        KeyError: if ``taxonomy_id`` is not registered.
    """
    if taxonomy_id not in TAXONOMY_REGISTRY:
        raise KeyError(
            f"Unknown phase_taxonomy_id={taxonomy_id!r}. "
            f"Registered: {sorted(TAXONOMY_REGISTRY)}"
        )
    return list(TAXONOMY_REGISTRY[taxonomy_id])


def is_valid_phase(taxonomy_id: str, phase: str) -> bool:
    """Return True iff ``phase`` belongs to ``taxonomy_id``."""
    return phase in TAXONOMY_REGISTRY.get(taxonomy_id, [])


def is_path_consistent(taxonomy_id: str, expected_phase_path: Iterable[str]) -> bool:
    """Return True iff every phase in ``expected_phase_path`` is registered.

    Used to validate ``BenchmarkCase`` consistency at construction or load.
    Empty paths return True (vacuously consistent).
    """
    canonical = TAXONOMY_REGISTRY.get(taxonomy_id)
    if canonical is None:
        return False
    canonical_set = set(canonical)
    return all(phase in canonical_set for phase in expected_phase_path)


__all__ = [
    "TAXONOMY_REGISTRY",
    "DEFAULT_TAXONOMY_ID",
    "get_taxonomy",
    "is_valid_phase",
    "is_path_consistent",
]
