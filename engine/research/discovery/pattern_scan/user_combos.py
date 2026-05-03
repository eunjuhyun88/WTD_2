"""W-0393: Load active user-pattern combos (tv_import) from Supabase.

Returns empty list when Supabase is unavailable — scanner falls back to LIBRARY_COMBOS only.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger("engine.research.user_combos")


def load_active_user_combos() -> list:
    """Fetch active tv_import combos and return as PatternObjectCombo list.

    Safe to call even if Supabase env vars are absent — returns [] in that case.
    """
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return []

    try:
        from supabase import create_client
        sb = create_client(url, key)
        rows = (
            sb.table("user_pattern_combos")
            .select(
                "id, variant_id, symbol, timeframe, direction, "
                "trigger_block, confirmation_blocks, indicator_filters, "
                "pattern_family, search_origin, strictness"
            )
            .eq("status", "active")
            .limit(200)
            .execute()
        ).data or []
    except Exception as e:
        log.warning("load_active_user_combos: Supabase error: %s", e)
        return []

    combos = []
    for row in rows:
        try:
            combo = _row_to_combo(row)
            if combo is not None:
                combos.append(combo)
        except Exception as exc:
            log.debug("Skipping malformed user combo %s: %s", row.get("variant_id"), exc)

    if combos:
        log.info("Loaded %d active user combos from tv_imports", len(combos))
    return combos


def _row_to_combo(row: dict):
    from research.pattern_search import PatternVariantSpec, IndicatorFilter
    import uuid as _uuid

    raw_filters = row.get("indicator_filters") or []
    indicator_filters = tuple(
        IndicatorFilter(
            feature_name=f["feature_name"],
            operator=f["operator"],
            value=(
                tuple(f["value"])
                if isinstance(f["value"], list) and f.get("operator") in ("in", "between")
                else f["value"]
            ),
            weight=float(f.get("weight", 1.0)),
            filter_type=f.get("filter_type", "hard"),
        )
        for f in raw_filters
        if isinstance(f, dict) and "feature_name" in f and "operator" in f
    )

    pattern_slug = row.get("pattern_family") or "alpha_confluence"
    variant_slug = row.get("variant_id") or str(_uuid.uuid4())

    spec = PatternVariantSpec(
        pattern_slug=pattern_slug,
        variant_slug=variant_slug,
        timeframe=row.get("timeframe") or "4h",
        indicator_filters=indicator_filters,
        search_origin=row.get("search_origin") or "tv_import",
        selection_bias=0.7,
        variant_id=variant_slug,
    )

    try:
        from research.discovery.pattern_scan.pattern_object_combos import PatternObjectCombo
        from patterns.library import get_pattern
        pattern_obj = get_pattern(pattern_slug)
        return PatternObjectCombo(pattern=pattern_obj, variant_spec=spec)
    except Exception:
        return None
