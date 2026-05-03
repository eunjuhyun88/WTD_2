"""W-0393: Fast preflight — signal count estimate + filter dropoff.

Does NOT write to DB. Runs before every commit.
"""
from __future__ import annotations

from .models import CompiledHypothesisSpec, ImportDiagnostics

MIN_SAMPLE = 30
_BASE_UNIVERSE = 50_000     # approx windows across 300 symbols × 180d
_FILTER_RETENTION = 0.45    # each hard filter keeps ~45% of windows


def estimate_variant(
    compiler_spec: CompiledHypothesisSpec,
    strictness: str = "base",
) -> ImportDiagnostics:
    """Estimate signal count for a strictness variant.

    Returns ImportDiagnostics with heuristic estimated_signal_count.
    """
    variant = compiler_spec.strictness_variants.get(strictness) or {}
    filters = variant.get("indicator_filters", [])

    count, dropoff = _fast_count_with_dropoff(filters)
    min_pass = count >= MIN_SAMPLE
    warnings: list[str] = []
    relaxations: list[dict] = []

    if not min_pass:
        warnings.append(
            f"~{count} estimated signals (need ≥ {MIN_SAMPLE}). "
            "Consider using 'loose' strictness or removing the most restrictive filter."
        )
        if strictness == "base":
            loose_filters = (compiler_spec.strictness_variants.get("loose") or {}).get("indicator_filters", [])
            loose_count, _ = _fast_count_with_dropoff(loose_filters)
            if loose_count >= MIN_SAMPLE:
                relaxations.append({
                    "action": "use_loose_variant",
                    "estimated_count": loose_count,
                    "description": f"Loose variant has ~{loose_count} estimated signals",
                })
            else:
                relaxations.append({
                    "action": "reduce_filters",
                    "description": "Remove the most restrictive filter to increase sample size",
                })

    if not filters:
        warnings.append("No indicator filters compiled — hypothesis relies on pattern family only")

    unsupported = compiler_spec.unsupported_atoms
    if unsupported:
        kinds = ", ".join(a["kind"] for a in unsupported[:3])
        warnings.append(f"Unsupported atoms not compiled: {kinds}")

    return ImportDiagnostics(
        estimated_signal_count=count,
        filter_dropoff=dropoff,
        min_sample_pass=min_pass,
        leakage_risk="low",
        selection_bias=0.7,
        warnings=warnings,
        suggested_relaxations=relaxations,
    )


def _fast_count_with_dropoff(filters: list[dict]) -> tuple[int, list[dict]]:
    """Heuristic count with per-filter dropoff tracking."""
    current = _BASE_UNIVERSE
    dropoff: list[dict] = []
    for f in filters:
        after = max(0, int(current * _FILTER_RETENTION))
        dropoff.append({
            "filter": f"{f.get('feature_name')} {f.get('operator')} {f.get('value')}",
            "before": current,
            "after": after,
        })
        current = after
    return current, dropoff
