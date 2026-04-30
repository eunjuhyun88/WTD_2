"""W-0350: PatternStore unit tests (mock Supabase client)."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from patterns.types import PatternObject, PhaseCondition


def _make_pattern(slug: str = "test-pattern-v1", extra_phase: str | None = None) -> PatternObject:
    phases = [
        PhaseCondition(phase_id="FAKE_DUMP", label="Fake dump", required_blocks=["oi_spike_with_dump"]),
        PhaseCondition(phase_id="ACCUMULATION", label="Accum", required_blocks=["whale_tick_buy"]),
    ]
    if extra_phase:
        phases.append(PhaseCondition(phase_id=extra_phase, label=extra_phase, required_blocks=[]))
    return PatternObject(
        slug=slug,
        name="Test Pattern",
        description="Unit test pattern",
        phases=phases,
        entry_phase="ACCUMULATION",
        target_phase="BREAKOUT",
        tags=["test", "oi_reversal"],
        version=1,
    )


def _mock_sb(*, data=None, count=0):
    """Build a minimal Supabase client mock."""
    client = MagicMock()
    resp = MagicMock()
    resp.data = data or []
    resp.count = count
    # chain: .table().upsert/select/etc().execute()
    chain = MagicMock()
    chain.execute.return_value = resp
    chain.eq.return_value = chain
    chain.limit.return_value = chain
    chain.contains.return_value = chain
    chain.select.return_value = chain
    chain.upsert.return_value = chain
    client.table.return_value = chain
    return client


class TestUpsertIdempotent:
    """AC5: 2회 upsert → row count unchanged."""

    def test_upsert_called_twice_no_error(self):
        from patterns.store import PatternStore
        p = _make_pattern()
        mock_client = _mock_sb(data=[{"slug": p.slug}])
        with patch("patterns.store._client", return_value=mock_client):
            store = PatternStore()
            slug1 = store.upsert(p)
            slug2 = store.upsert(p)
        assert slug1 == slug2 == p.slug
        # Both calls should hit upsert (ON CONFLICT DO UPDATE)
        assert mock_client.table.return_value.upsert.call_count == 2


class TestGetBySlug:
    """AC2: GET /patterns/objects/{slug} returns correct row."""

    def test_get_existing_slug(self):
        from patterns.store import PatternStore
        row = {"slug": "tradoor-oi-reversal-v1", "name": "OI 급등 반전", "phase_ids": ["FAKE_DUMP"]}
        mock_client = _mock_sb(data=[row])
        with patch("patterns.store._client", return_value=mock_client):
            result = PatternStore().get("tradoor-oi-reversal-v1")
        assert result is not None
        assert result["slug"] == "tradoor-oi-reversal-v1"

    def test_get_missing_slug_returns_none(self):
        from patterns.store import PatternStore
        mock_client = _mock_sb(data=[])
        with patch("patterns.store._client", return_value=mock_client):
            result = PatternStore().get("nonexistent-slug")
        assert result is None


class TestListFilterByPhase:
    """AC3: list(phase=X) queries with .contains("phase_ids", [X])."""

    def test_list_passes_phase_filter(self):
        from patterns.store import PatternStore
        rows = [{"slug": "p1", "phase_ids": ["FAKE_DUMP", "ACCUMULATION"]}]
        mock_client = _mock_sb(data=rows)
        with patch("patterns.store._client", return_value=mock_client):
            result = PatternStore().list(phase="FAKE_DUMP")
        assert len(result) == 1
        chain = mock_client.table.return_value
        chain.contains.assert_called_once_with("phase_ids", ["FAKE_DUMP"])

    def test_list_no_filter(self):
        from patterns.store import PatternStore
        rows = [{"slug": f"p{i}", "phase_ids": []} for i in range(5)]
        mock_client = _mock_sb(data=rows)
        with patch("patterns.store._client", return_value=mock_client):
            result = PatternStore().list()
        assert len(result) == 5
        chain = mock_client.table.return_value
        chain.contains.assert_not_called()


class TestSeedSkipsDuplicateSlug:
    """AC5: seed skips duplicate slugs in PATTERN_LIBRARY."""

    def test_seed_dry_run_counts_all(self):
        from patterns.seed import seed
        success, skipped = seed(dry_run=True)
        assert success >= 50, f"Expected ≥50, got {success}"
        assert skipped == 0

    def test_seed_handles_upsert_error_gracefully(self):
        from patterns.seed import seed
        from patterns.store import PatternStore

        call_count = 0

        def failing_upsert(self_store, pattern):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("simulated DB error")
            return pattern.slug

        with patch.object(PatternStore, "upsert", failing_upsert):
            success, skipped = seed(dry_run=False)

        assert skipped == 1
        assert success >= 50


class TestSchemaRoundTrip:
    """AC2: upsert → get returns same slug and phase_ids."""

    def test_round_trip_phase_ids(self):
        from patterns.store import PatternStore, _pattern_to_row
        p = _make_pattern(extra_phase="BREAKOUT")
        row = _pattern_to_row(p)
        assert row["slug"] == p.slug
        assert "FAKE_DUMP" in row["phase_ids"]
        assert "ACCUMULATION" in row["phase_ids"]
        assert "BREAKOUT" in row["phase_ids"]
        assert isinstance(row["phases_json"], list)
        assert len(row["phases_json"]) == 3
