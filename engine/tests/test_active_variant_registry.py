from __future__ import annotations

from patterns.active_variant_registry import (
    ActivePatternVariantEntry,
    ActivePatternVariantStore,
)


def test_active_variant_store_roundtrip(tmp_path) -> None:
    store = ActivePatternVariantStore(tmp_path / "active")
    entry = ActivePatternVariantEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        variant_slug="tradoor-oi-reversal-v1__canonical",
        timeframe="1h",
        watch_phases=["ACCUMULATION", "REAL_DUMP"],
        source_kind="benchmark_search",
        source_ref="benchmark-pack:foo",
        research_run_id="run-1",
        promotion_report_id="report-1",
    )

    store.upsert(entry)
    loaded = store.get("tradoor-oi-reversal-v1")

    assert loaded is not None
    assert loaded.variant_slug == entry.variant_slug
    assert loaded.watch_phases == ["ACCUMULATION", "REAL_DUMP"]
    assert loaded.source_kind == "benchmark_search"


def test_active_variant_store_seeds_defaults_when_empty(tmp_path) -> None:
    store = ActivePatternVariantStore(tmp_path / "active")

    entries = store.list_effective()

    assert len(entries) >= 1
    assert any(entry.pattern_slug == "tradoor-oi-reversal-v1" for entry in entries)
