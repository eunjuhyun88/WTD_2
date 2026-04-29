"""UserVariantRegistry: resolve personalized variant for (user, pattern)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from patterns.active_variant_registry import ActivePatternVariantStore
from personalization.affinity_registry import AffinityRegistry
from personalization.coldstart import is_cold, COLD_START_THRESHOLD
from personalization.threshold_adapter import ThresholdAdapter
from personalization.types import UserPatternState, ThresholdDelta


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class VariantResolution:
    pattern_slug: str
    variant_slug: str
    timeframe: str
    mode: Literal["personalized", "global_fallback"]
    delta: Optional[ThresholdDelta]
    base_variant_slug: str
    resolved_at: str


class UserVariantRegistry:
    def __init__(
        self,
        threshold_adapter: ThresholdAdapter,
        affinity: AffinityRegistry,
        base_dir: Path,
    ) -> None:
        self._adapter = threshold_adapter
        self._affinity = affinity
        self._store = ActivePatternVariantStore(base_dir)

    def resolve_for_user(
        self,
        user_id: str,
        pattern_slug: str,
        state: Optional[UserPatternState] = None,
    ) -> VariantResolution:
        """Return personalized variant or global fallback."""
        # Check cold start
        aff_state = self._affinity.get_state(user_id, pattern_slug)
        n_total = aff_state.n_total if aff_state else 0

        if n_total < COLD_START_THRESHOLD or state is None:
            # Global fallback
            entry = self._store.get(pattern_slug)
            if entry is None:
                return VariantResolution(
                    pattern_slug=pattern_slug,
                    variant_slug="unknown",
                    timeframe="1h",
                    mode="global_fallback",
                    delta=None,
                    base_variant_slug="unknown",
                    resolved_at=_utcnow(),
                )
            return VariantResolution(
                pattern_slug=pattern_slug,
                variant_slug=entry.variant_slug,
                timeframe=entry.timeframe,
                mode="global_fallback",
                delta=None,
                base_variant_slug=entry.variant_slug,
                resolved_at=_utcnow(),
            )

        # Personalized path
        delta = self._adapter.compute_delta(state, pattern_slug)
        entry = self._store.get(pattern_slug)
        if entry is None:
            return VariantResolution(
                pattern_slug=pattern_slug,
                variant_slug="unknown",
                timeframe="1h",
                mode="global_fallback",
                delta=None,
                base_variant_slug="unknown",
                resolved_at=_utcnow(),
            )
        return VariantResolution(
            pattern_slug=pattern_slug,
            variant_slug=entry.variant_slug,
            timeframe=entry.timeframe,
            mode="personalized",
            delta=delta,
            base_variant_slug=entry.variant_slug,
            resolved_at=_utcnow(),
        )

    def invalidate(self, user_id: str, pattern_slug: str) -> None:
        """Hook for future cache invalidation. Currently a no-op."""
