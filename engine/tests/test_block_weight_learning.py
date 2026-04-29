"""Tests for BlockWeightLearner and block_weights EWM store — W-0313 Phase 2."""
from __future__ import annotations

import threading

import pytest

from scoring import block_weights as bw
from search.block_weight_learner import BlockWeightLearner


# ── Tests ────────────────────────────────────────────────────────────────────

def test_ewm_converges_on_synthetic(tmp_path):
    learner = BlockWeightLearner(db_path=tmp_path / "bw.sqlite")
    for _ in range(100):
        learner.update("funding_extreme", 1.0)
    w = learner.get_weights().get("funding_extreme", 1.0)
    assert 1.3 <= w <= 2.0, f"Expected w in [1.3, 2.0], got {w:.4f}"


def test_ewm_decay_alpha_095(tmp_path):
    db = tmp_path / "bw.sqlite"
    # Apply 200 steady-state updates (past warmup threshold) with outcome=1.0
    for i in range(200):
        bw.update("steady_block", 1.0, db_path=db)
    raw = bw.get_raw("steady_block", db_path=db)
    n = bw.get_n_updates("steady_block", db_path=db)
    assert n == 200
    # With alpha=0.85 for first 100 then 0.95, raw should converge close to 1.0
    assert raw > 0.9, f"raw={raw:.4f} expected > 0.9 after 200 updates"


def test_ewm_warmup_alpha_085(tmp_path):
    db = tmp_path / "bw.sqlite"
    # After 10 updates with outcome=1.0 (still in warmup), convergence is faster
    for _ in range(10):
        bw.update("warmup_block", 1.0, db_path=db)
    raw_warmup = bw.get_raw("warmup_block", db_path=db)

    # Compute expected: alpha=0.85, 10 steps from 0
    expected = 0.0
    for _ in range(10):
        expected = 0.85 * expected + 0.15 * 1.0
    assert abs(raw_warmup - expected) < 1e-6, f"raw={raw_warmup:.6f}, expected={expected:.6f}"


def test_block_weight_normalization(tmp_path):
    db = tmp_path / "bw.sqlite"
    # Push toward extremes
    for _ in range(200):
        bw.update("high_block", 100.0, db_path=db)
    for _ in range(200):
        bw.update("low_block", -100.0, db_path=db)
    w_high = bw.get_effective_weight("high_block", db_path=db)
    w_low = bw.get_effective_weight("low_block", db_path=db)
    assert w_high <= bw._W_MAX, f"w_high={w_high} exceeds W_MAX={bw._W_MAX}"
    assert w_low >= bw._W_MIN, f"w_low={w_low} below W_MIN={bw._W_MIN}"


def test_disqualifier_blocks_unchanged(tmp_path):
    db = tmp_path / "bw.sqlite"
    for block in bw._DISQUALIFIER_BLOCKS:
        # update should return 0.0 and not change anything
        ret = bw.update(block, 1.0, db_path=db)
        assert ret == 0.0
        w = bw.get_effective_weight(block, db_path=db)
        assert w == 1.0, f"{block} weight should be 1.0, got {w}"


def test_concurrent_updates_threadsafe(tmp_path):
    db = tmp_path / "bw.sqlite"
    errors = []

    def _worker():
        try:
            bw.update("concurrent_block", 1.0, db_path=db)
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=_worker) for _ in range(100)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(errors) == 0, f"Errors in concurrent updates: {errors}"
    n = bw.get_n_updates("concurrent_block", db_path=db)
    assert n == 100, f"Expected 100 updates, got {n}"


def test_persistence_across_restart(tmp_path):
    db = tmp_path / "bw.sqlite"
    bw.update("persist_block", 0.8, db_path=db)
    raw_before = bw.get_raw("persist_block", db_path=db)

    # Simulate restart by creating a new learner on the same DB path
    learner2 = BlockWeightLearner(db_path=db)
    raw_after = learner2.get_raw("persist_block")
    assert abs(raw_after - raw_before) < 1e-9, f"raw mismatch: {raw_before} vs {raw_after}"


def test_reset_clears_history(tmp_path):
    db = tmp_path / "bw.sqlite"
    for _ in range(10):
        bw.update("reset_block", 1.0, db_path=db)
    assert bw.get_n_updates("reset_block", db_path=db) == 10

    bw.reset_block("reset_block", db_path=db)
    assert bw.get_n_updates("reset_block", db_path=db) == 0
    assert bw.get_raw("reset_block", db_path=db) == 0.0


def test_outcome_zero_for_unfired_blocks(tmp_path):
    db = tmp_path / "bw.sqlite"
    learner = BlockWeightLearner(db_path=db)

    # fired block gets updated; unfired block should not
    learner.update_from_verdict(
        verdict="valid",
        blocks_triggered=["fired_block"],
        all_blocks=["fired_block", "unfired_block"],
    )

    n_fired = bw.get_n_updates("fired_block", db_path=db)
    n_unfired = bw.get_n_updates("unfired_block", db_path=db)
    assert n_fired == 1, f"fired_block should have 1 update, got {n_fired}"
    assert n_unfired == 0, f"unfired_block should have 0 updates, got {n_unfired}"


def test_negative_outcome_decay(tmp_path):
    db = tmp_path / "bw.sqlite"
    learner = BlockWeightLearner(db_path=db)
    for _ in range(100):
        learner.update("bad_block", -1.0)
    w = learner.get_weights().get("bad_block", 1.0)
    assert w < 1.0, f"Expected w < 1.0 after 100 invalid verdicts, got {w:.4f}"
