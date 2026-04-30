"""W-0344: Refinement Loop Closure e2e tests.

Covers:
  AC1: 10 verdicts → check_refinement_gates returns eligible → trigger_job calls refinement
  AC2: auto-promote updates ACTIVE_PATTERN_VARIANT_STORE source_kind="refinement"
  AC3: ACTIVE_PATTERN_VARIANT_STORE.get() returns updated entry after training promote
  AC4: flywheel health verdicts_to_refinement_count_7d increments after training_run record
  AC5: rollback — re-upsert with prior source_kind restores previous state
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ledger.store import LedgerRecordStore
from ledger.types import PatternLedgerRecord
from patterns.active_variant_registry import ActivePatternVariantEntry, ActivePatternVariantStore
from scanner.jobs.refinement_trigger import check_refinement_gates, refinement_trigger_job

SLUG = "tradoor-oi-reversal-v1"


def _store(tmp_path: Path) -> LedgerRecordStore:
    return LedgerRecordStore(base_dir=tmp_path / "ledger_records")


def _record(record_type: str, *, slug: str = SLUG, created_at: datetime) -> PatternLedgerRecord:
    return PatternLedgerRecord(
        record_type=record_type,
        pattern_slug=slug,
        created_at=created_at,
        payload={},
    )


def _seed_verdicts(store: LedgerRecordStore, n: int, now: datetime) -> None:
    for i in range(n):
        store.append(_record("verdict", created_at=now - timedelta(hours=i + 1)))


# ---------------------------------------------------------------------------
# AC1: 10 verdicts → gates clear → refinement_trigger_job fires refinement
# ---------------------------------------------------------------------------

def test_gates_clear_with_ten_verdicts(tmp_path):
    store = _store(tmp_path)
    now = datetime(2026, 4, 30, 12, 0)
    _seed_verdicts(store, 10, now)

    eligible = check_refinement_gates(
        now=now,
        ledger_store=store,
        pattern_slugs=[SLUG],
        min_verdicts=10,
        min_days=7.0,
    )
    assert eligible == [SLUG]


@pytest.mark.asyncio
async def test_trigger_job_calls_refinement_with_eligible_slugs(tmp_path):
    store = _store(tmp_path)
    now = datetime(2026, 4, 30, 12, 0)
    _seed_verdicts(store, 10, now)

    called_with: list[list[str]] = []

    async def _fake_refinement(*, pattern_slugs=None, auto_train_candidate=False):
        called_with.append(list(pattern_slugs or []))

    with patch("scanner.jobs.refinement_trigger.pattern_refinement_job", new=_fake_refinement):
        triggered = await refinement_trigger_job(now=now, ledger_store=store)

    assert triggered == [SLUG]
    assert called_with == [[SLUG]]


@pytest.mark.asyncio
async def test_trigger_job_noop_when_no_eligible(tmp_path):
    store = _store(tmp_path)
    now = datetime(2026, 4, 30, 12, 0)
    _seed_verdicts(store, 3, now)  # below threshold

    called_with: list = []

    async def _fake_refinement(**_kwargs):
        called_with.append(True)

    with patch("scanner.jobs.refinement_trigger.pattern_refinement_job", new=_fake_refinement):
        triggered = await refinement_trigger_job(now=now, ledger_store=store)

    assert triggered == []
    assert called_with == []  # refinement NOT called


# ---------------------------------------------------------------------------
# AC2 + AC3: auto-promote → ACTIVE_PATTERN_VARIANT_STORE updated
# ---------------------------------------------------------------------------

def test_auto_promote_updates_active_variant_store(tmp_path):
    from patterns.model_registry import PatternModelRegistryEntry, PatternModelRegistryStore
    from patterns.training_service import train_pattern_model_from_ledger

    # Set up variant store with a seed entry
    variant_store = ActivePatternVariantStore(base_dir=tmp_path / "variants")
    seed_entry = ActivePatternVariantEntry(
        pattern_slug=SLUG,
        variant_slug=f"{SLUG}__canonical",
        timeframe="1h",
        watch_phases=["ACCUMULATION"],
        source_kind="seed",
    )
    variant_store.upsert(seed_entry)

    # Mock heavy dependencies
    mock_pattern = MagicMock()
    mock_pattern.timeframe = "1h"

    mock_engine = MagicMock()
    mock_engine.train.return_value = {
        "auc": 0.72,
        "replaced": True,
        "model_version": "v2",
        "fold_aucs": [0.70, 0.72, 0.74],
    }

    mock_registry_store = MagicMock(spec=PatternModelRegistryStore)
    promoted_entry = MagicMock()
    promoted_entry.rollout_state = "active"
    mock_registry_store.upsert_candidate.return_value = promoted_entry
    mock_registry_store.promote.return_value = promoted_entry

    mock_record_store = MagicMock()
    mock_ledger = MagicMock()
    mock_ledger.list_outcomes_for_pattern = MagicMock(return_value=[])

    # Build 30+ synthetic records (required for auto-promote gate)
    fake_records = [
        {"snapshot": {"close": 100.0, "volume": 1000.0}, "outcome": i % 2}
        for i in range(35)
    ]

    with (
        patch("patterns.training_service.get_pattern", return_value=mock_pattern),
        patch("patterns.training_service.list_outcomes_for_definition", return_value=[]),
        patch("patterns.training_service.build_pattern_training_records", return_value=fake_records),
        patch("patterns.training_service._pattern_training_matrix",
              return_value=(__import__("numpy").zeros((35, 5)), __import__("numpy").array([i % 2 for i in range(35)]))),
        patch("patterns.training_service.make_pattern_model_key", return_value="test_model_key"),
    ):
        result = train_pattern_model_from_ledger(
            SLUG,
            ledger=mock_ledger,
            record_store=mock_record_store,
            registry_store=mock_registry_store,
            variant_store=variant_store,
            get_engine_fn=lambda _key: mock_engine,
        )

    assert result["auto_promoted"] is True

    # Verify ACTIVE_PATTERN_VARIANT_STORE was updated
    updated = variant_store.get(SLUG)
    assert updated is not None
    assert updated.source_kind == "refinement"
    assert updated.source_ref == "test_model_key"
    # Variant slug and watch_phases are preserved
    assert updated.variant_slug == f"{SLUG}__canonical"
    assert updated.watch_phases == ["ACCUMULATION"]


def test_auto_promote_skipped_when_auc_below_threshold(tmp_path):
    from patterns.model_registry import PatternModelRegistryStore
    from patterns.training_service import train_pattern_model_from_ledger

    variant_store = ActivePatternVariantStore(base_dir=tmp_path / "variants")
    seed_entry = ActivePatternVariantEntry(
        pattern_slug=SLUG,
        variant_slug=f"{SLUG}__canonical",
        timeframe="1h",
        watch_phases=["ACCUMULATION"],
        source_kind="seed",
    )
    variant_store.upsert(seed_entry)

    mock_pattern = MagicMock()
    mock_pattern.timeframe = "1h"
    mock_engine = MagicMock()
    mock_engine.train.return_value = {
        "auc": 0.52,  # below 0.60 threshold
        "replaced": True,
        "model_version": "v2",
        "fold_aucs": [0.50, 0.52, 0.54],
    }
    mock_registry_store = MagicMock(spec=PatternModelRegistryStore)
    candidate_entry = MagicMock()
    candidate_entry.rollout_state = "candidate"
    mock_registry_store.upsert_candidate.return_value = candidate_entry

    fake_records = [
        {"snapshot": {"close": 100.0}, "outcome": i % 2}
        for i in range(35)
    ]

    with (
        patch("patterns.training_service.get_pattern", return_value=mock_pattern),
        patch("patterns.training_service.list_outcomes_for_definition", return_value=[]),
        patch("patterns.training_service.build_pattern_training_records", return_value=fake_records),
        patch("patterns.training_service._pattern_training_matrix",
              return_value=(__import__("numpy").zeros((35, 5)), __import__("numpy").array([i % 2 for i in range(35)]))),
        patch("patterns.training_service.make_pattern_model_key", return_value="test_model_key"),
    ):
        result = train_pattern_model_from_ledger(
            SLUG,
            ledger=MagicMock(),
            record_store=MagicMock(),
            registry_store=mock_registry_store,
            variant_store=variant_store,
            get_engine_fn=lambda _key: mock_engine,
        )

    assert result["auto_promoted"] is False
    # Variant store entry unchanged
    still_seed = variant_store.get(SLUG)
    assert still_seed.source_kind == "seed"


# ---------------------------------------------------------------------------
# AC5: rollback — restore prior source_kind
# ---------------------------------------------------------------------------

def test_rollback_restores_prior_source_kind(tmp_path):
    variant_store = ActivePatternVariantStore(base_dir=tmp_path / "variants")

    original = ActivePatternVariantEntry(
        pattern_slug=SLUG,
        variant_slug=f"{SLUG}__canonical",
        timeframe="1h",
        watch_phases=["ACCUMULATION"],
        source_kind="seed",
        source_ref=None,
    )
    variant_store.upsert(original)

    # Simulate promotion
    promoted = variant_store.get(SLUG)
    promoted.source_kind = "refinement"
    promoted.source_ref = "model_key_v2"
    variant_store.upsert(promoted)

    assert variant_store.get(SLUG).source_kind == "refinement"

    # Rollback: restore to original
    original.source_kind = "seed"
    original.source_ref = None
    variant_store.upsert(original)

    rolled_back = variant_store.get(SLUG)
    assert rolled_back.source_kind == "seed"
    assert rolled_back.source_ref is None


# ---------------------------------------------------------------------------
# AC4: flywheel health verdicts_to_refinement_count_7d increments
# ---------------------------------------------------------------------------

def test_flywheel_health_counts_training_run_after_refinement(tmp_path):
    from api.routes.observability import compute_flywheel_health
    from capture.store import CaptureStore

    record_store = LedgerRecordStore(base_dir=tmp_path / "records")
    capture_store = CaptureStore(db_path=str(tmp_path / "captures.db"))

    now = datetime(2026, 4, 30, 12, 0)

    # Seed a training_run record within the last 7d
    record_store.append(PatternLedgerRecord(
        record_type="training_run",
        pattern_slug=SLUG,
        created_at=now - timedelta(days=1),
        payload={"model_key": "test_key", "auc": 0.72},
    ))

    health = compute_flywheel_health(
        now=now,
        capture_store=capture_store,
        record_store=record_store,
    )

    assert health["verdicts_to_refinement_count_7d"] >= 1
