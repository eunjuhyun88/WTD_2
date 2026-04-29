"""W-0290 Phase 3 — Multiple testing preregistry + hierarchical BH-FDR.

Prevents HARKing (Hypothesizing After Results are Known) by requiring
hypotheses to be filed before testing begins.  The hierarchical BH
procedure controls FDR across ~20K tests (53 patterns × horizons ×
sub-hypotheses) without over-correcting.

Hierarchy:
  Level 1 — families (default key: ``pattern_slug``)
  Level 2 — hypotheses within each family (primary + secondary)

Algorithm (hierarchical BH, Yekutieli 2008):
  1. For each family, derive family_p = min p-value across its *primary*
     hypotheses.  Secondary hypotheses do not influence family selection.
  2. Apply flat BH to {family_p} at ``alpha`` → active families.
  3. Within each active family: apply flat BH to ALL hypotheses at ``alpha``.
  4. Hypotheses in inactive families: status = ``"skipped"``.
  5. Hypotheses with insufficient data: status = ``"insufficient"``
     (excluded from both BH levels).

Reference:
    Benjamini, Y. & Yekutieli, D. (2001). "The Control of the False
    Discovery Rate in Multiple Testing under Dependency." Annals of
    Statistics 29 (4): 1165-1188.

    Harvey, C. & Liu, Y. (2015). "Backtesting." J. Portfolio Management
    41 (1): 13-28.  (preregistration rationale in finance)
"""
from __future__ import annotations

import copy
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence, Literal

import yaml

from research.validation.stats import bh_correct


HypothesisStatus = Literal[
    "pending",       # registered, not yet tested
    "rejected",      # H₀ rejected — significant after BH correction
    "not_rejected",  # H₀ not rejected
    "insufficient",  # too few samples (excluded from BH)
    "skipped",       # family did not pass Level-1 BH
]


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class RegisteredHypothesis:
    """One pre-registered hypothesis entry.

    Fields set at registration time:
        hypothesis_id: stable 12-char SHA-1 fingerprint of
            (pattern_slug, horizon_hours, label).
        pattern_slug: e.g. ``"breakout_retest"``.
        horizon_hours: forward-return horizon, e.g. ``4``.
        label: human description, e.g. ``"mean_net_bps > 0 (G1)"``.
        alpha: per-hypothesis FDR level (propagated to BH calls).
        family: grouping key for Level-1 BH. Defaults to pattern_slug.
        filed_at: ISO 8601 UTC timestamp at registration.
        is_primary: ``True`` → drives family-level BH gate.
            ``False`` → secondary / robustness sub-hypothesis.

    Fields set after testing:
        p_raw: raw p-value from the hypothesis test.
        p_bh: BH-corrected p-value (within-family Level-2).
        status: one of HypothesisStatus.
        n_samples: number of observations used in the test.
        tested_at: ISO 8601 UTC timestamp when p_raw was recorded.
    """

    hypothesis_id: str
    pattern_slug: str
    horizon_hours: int
    label: str
    alpha: float
    family: str
    filed_at: str
    is_primary: bool

    p_raw: float | None = None
    p_bh: float | None = None
    status: HypothesisStatus = "pending"
    n_samples: int = 0
    tested_at: str | None = None

    def to_dict(self) -> dict:
        return {
            "hypothesis_id": self.hypothesis_id,
            "pattern_slug": self.pattern_slug,
            "horizon_hours": self.horizon_hours,
            "label": self.label,
            "alpha": self.alpha,
            "family": self.family,
            "filed_at": self.filed_at,
            "is_primary": self.is_primary,
            "p_raw": self.p_raw,
            "p_bh": self.p_bh,
            "status": self.status,
            "n_samples": self.n_samples,
            "tested_at": self.tested_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "RegisteredHypothesis":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in known})


# ---------------------------------------------------------------------------
# ID generation
# ---------------------------------------------------------------------------


def make_hypothesis_id(pattern_slug: str, horizon_hours: int, label: str) -> str:
    """Stable 12-char SHA-1 fingerprint for a (slug, horizon, label) triple.

    Deterministic: same inputs always produce the same ID so that
    re-registration of an existing hypothesis is detected and deduplicated.
    """
    key = f"{pattern_slug}|{horizon_hours}|{label}"
    return hashlib.sha1(key.encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class HypothesisRegistry:
    """YAML-backed preregistry for multiple-testing discipline.

    Usage pattern::

        registry = HypothesisRegistry(path="research/hypotheses.yaml")
        h = registry.register("breakout_retest", 4, "mean_net_bps > 0")
        # ... run tests ...
        registry.record_result(h.hypothesis_id, p_raw=0.021, n_samples=45)
        registry.run_correction()
        registry.save()
    """

    def __init__(self, path: Path | str | None = None) -> None:
        self._path = Path(path) if path is not None else None
        self._entries: dict[str, RegisteredHypothesis] = {}
        if self._path is not None and self._path.exists():
            self._load()

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(
        self,
        pattern_slug: str,
        horizon_hours: int,
        label: str,
        *,
        alpha: float = 0.05,
        family: str | None = None,
        is_primary: bool = True,
    ) -> RegisteredHypothesis:
        """Register a hypothesis before testing. Idempotent.

        If a hypothesis with the same (pattern_slug, horizon_hours, label)
        already exists, the existing entry is returned unchanged.

        Args:
            pattern_slug: identifier for the pattern under test.
            horizon_hours: forward-return horizon in hours.
            label: human-readable description of the null hypothesis.
            alpha: FDR significance level. Default 0.05.
            family: Level-1 BH grouping key. Defaults to pattern_slug.
            is_primary: whether this hypothesis drives Level-1 family gate.

        Returns:
            :class:`RegisteredHypothesis` (new or existing).
        """
        h_id = make_hypothesis_id(pattern_slug, horizon_hours, label)
        if h_id in self._entries:
            return self._entries[h_id]
        entry = RegisteredHypothesis(
            hypothesis_id=h_id,
            pattern_slug=pattern_slug,
            horizon_hours=horizon_hours,
            label=label,
            alpha=alpha,
            family=family if family is not None else pattern_slug,
            filed_at=datetime.now(timezone.utc).isoformat(),
            is_primary=is_primary,
        )
        self._entries[h_id] = entry
        return entry

    # ------------------------------------------------------------------
    # Test result recording
    # ------------------------------------------------------------------

    def record_result(
        self,
        hypothesis_id: str,
        p_raw: float,
        n_samples: int,
        *,
        min_n: int = 30,
    ) -> None:
        """Record the raw p-value for a registered hypothesis.

        Args:
            hypothesis_id: must exist in the registry.
            p_raw: raw (uncorrected) p-value from the hypothesis test.
            n_samples: number of observations. When below ``min_n`` the
                status is set to ``"insufficient"`` and the hypothesis is
                excluded from BH correction.
            min_n: minimum sample size for a valid test. Default 30.

        Raises:
            KeyError: if ``hypothesis_id`` is not registered.
        """
        entry = self._entries.get(hypothesis_id)
        if entry is None:
            raise KeyError(f"Unknown hypothesis_id: {hypothesis_id!r}")
        entry.p_raw = p_raw
        entry.n_samples = n_samples
        entry.tested_at = datetime.now(timezone.utc).isoformat()
        if n_samples < min_n:
            entry.status = "insufficient"

    # ------------------------------------------------------------------
    # Hierarchical BH correction
    # ------------------------------------------------------------------

    def run_correction(self, alpha: float | None = None) -> None:
        """Apply hierarchical BH correction to all pending (testable) entries.

        Updates ``p_bh`` and ``status`` in-place for every entry that has
        a recorded p-value.  Entries with ``status="insufficient"`` are
        excluded; they keep their current status.

        Args:
            alpha: FDR level. When ``None``, each hypothesis's own
                ``alpha`` is ignored and the single ``alpha=0.05`` default
                is used for all BH calls.  Pass an explicit value to
                override uniformly.
        """
        effective_alpha = alpha if alpha is not None else 0.05
        pending = [
            h for h in self._entries.values()
            if h.status == "pending" and h.p_raw is not None
        ]
        corrected = hierarchical_bh_correct(pending, alpha=effective_alpha)
        for h in corrected:
            self._entries[h.hypothesis_id] = h

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    @property
    def entries(self) -> list[RegisteredHypothesis]:
        return list(self._entries.values())

    def get(self, hypothesis_id: str) -> RegisteredHypothesis | None:
        return self._entries.get(hypothesis_id)

    def summary(self) -> dict:
        """Return counts per status."""
        all_entries = list(self._entries.values())
        return {
            "total": len(all_entries),
            "pending": sum(1 for e in all_entries if e.status == "pending"),
            "rejected": sum(1 for e in all_entries if e.status == "rejected"),
            "not_rejected": sum(1 for e in all_entries if e.status == "not_rejected"),
            "insufficient": sum(1 for e in all_entries if e.status == "insufficient"),
            "skipped": sum(1 for e in all_entries if e.status == "skipped"),
        }

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self) -> None:
        """Serialize the registry to YAML at ``self._path``.

        Raises:
            RuntimeError: if no path was configured.
        """
        if self._path is None:
            raise RuntimeError("No path configured for HypothesisRegistry")
        data = [e.to_dict() for e in self._entries.values()]
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            yaml.dump(data, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )

    def _load(self) -> None:
        assert self._path is not None
        raw = yaml.safe_load(self._path.read_text(encoding="utf-8")) or []
        for d in raw:
            h = RegisteredHypothesis.from_dict(d)
            self._entries[h.hypothesis_id] = h

    @classmethod
    def load(cls, path: Path | str) -> "HypothesisRegistry":
        """Load an existing YAML registry from disk."""
        return cls(path)


# ---------------------------------------------------------------------------
# Hierarchical BH correction (standalone function)
# ---------------------------------------------------------------------------


def hierarchical_bh_correct(
    hypotheses: Sequence[RegisteredHypothesis],
    *,
    alpha: float = 0.05,
) -> list[RegisteredHypothesis]:
    """Two-level hierarchical BH correction.

    Level 1 — family gate:
        For each family, collect raw p-values from *primary* hypotheses
        (``is_primary=True``) that have ``status="pending"``.  Use
        ``min(p_raw)`` as the family representative p.  Apply flat BH
        to these family-level p-values at ``alpha``.

    Level 2 — within-family:
        For each *active* family (rejected at Level 1): apply flat BH to
        all ``pending`` hypotheses in the family (primary and secondary).
        For *inactive* families: mark all ``pending`` hypotheses as
        ``"skipped"``.

    Args:
        hypotheses: sequence of :class:`RegisteredHypothesis` with
            ``p_raw`` set and ``status == "pending"``.  Objects are
            **not** mutated; corrected copies are returned.
        alpha: FDR level for both BH calls.

    Returns:
        List of shallow copies of the input hypotheses with ``p_bh`` and
        ``status`` populated.
    """
    if not hypotheses:
        return []

    # Work on shallow copies so we don't mutate callers' objects.
    results = [copy.copy(h) for h in hypotheses]

    # Index copies by family.
    families: dict[str, list[RegisteredHypothesis]] = {}
    for h in results:
        families.setdefault(h.family, []).append(h)

    family_names = sorted(families.keys())

    # Level 1 — family representative p-values (min over primary pending).
    family_rep_p: list[float] = []
    for fam in family_names:
        primary_p = [
            h.p_raw
            for h in families[fam]
            if h.is_primary and h.p_raw is not None and h.status == "pending"
        ]
        family_rep_p.append(min(primary_p) if primary_p else 1.0)

    family_rejected, _family_corrected = bh_correct(family_rep_p, alpha=alpha)
    family_active = {
        fam: bool(family_rejected[i]) for i, fam in enumerate(family_names)
    }

    # Level 2 — within-family correction.
    for fam, active in family_active.items():
        fam_hypotheses = families[fam]

        if not active:
            for h in fam_hypotheses:
                if h.status == "pending":
                    if h.is_primary:
                        # Primary drove Level-1; it was effectively tested there.
                        h.status = "not_rejected"
                    else:
                        # Secondary was never individually tested.
                        h.status = "skipped"
                        h.p_bh = None
            continue

        # Active family: apply BH to all testable (pending + p_raw set) hypotheses.
        testable = [
            h for h in fam_hypotheses
            if h.p_raw is not None and h.status == "pending"
        ]
        if not testable:
            continue

        p_vals = [h.p_raw for h in testable]
        rejected, corrected_p = bh_correct(p_vals, alpha=alpha)

        for i, h in enumerate(testable):
            h.p_bh = float(corrected_p[i])
            h.status = "rejected" if bool(rejected[i]) else "not_rejected"

    return results
