"""Real baseline: recall@10 against 188K actual corpus windows.

Unlike the synthetic eval (19 hand-crafted contrarian noise → trivially 100%),
this uses:
  - Temporal overlap pairs from real corpus (75% bar overlap, 12h stride)
  - 99 contemporary real-corpus distractors per query (not hand-crafted)

If the corpus DB is not available, all tests are skipped.

Exit Criteria (W-0247 F-16 real baseline):
  EC-R1: mine_real_eval_set returns ≥ 20 items
  EC-R2: recall@10 ≥ 0.60 with real distractors
  EC-R3: eval_miner.report_coverage returns total_windows ≥ 10_000
  EC-R4: ingest_capture_snapshot round-trips cleanly
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from search.eval_miner import mine_real_eval_set, report_coverage
from search.recall_benchmark import run_recall_benchmark

_CORPUS_DB = Path(__file__).resolve().parent.parent / "search" / "state" / "search_corpus.sqlite"


@pytest.fixture(scope="module")
def real_items():
    if not _CORPUS_DB.exists():
        pytest.skip("search corpus DB not found — skipping real eval")
    items = mine_real_eval_set(n_items=50, seed=42)
    if len(items) < 5:
        pytest.skip(f"only {len(items)} items mined — corpus too sparse")
    return items


def test_ec_r3_corpus_coverage():
    """EC-R3: corpus has ≥ 10,000 windows."""
    if not _CORPUS_DB.exists():
        pytest.skip("corpus DB not found")
    cov = report_coverage()
    total = cov.get("total_windows", 0)
    assert total >= 10_000, f"corpus only has {total} windows"


def test_ec_r1_mine_returns_enough_items():
    """EC-R1: miner produces ≥ 20 items from real corpus."""
    if not _CORPUS_DB.exists():
        pytest.skip("corpus DB not found")
    items = mine_real_eval_set(n_items=50, seed=42)
    assert len(items) >= 20, f"only {len(items)} items mined"


def test_ec_r1_items_have_real_noise(real_items):
    """All mined items carry real distractor signatures."""
    for item in real_items:
        assert item.real_noise, f"{item.query_id} has no real_noise"
        assert len(item.real_noise) >= 10, (
            f"{item.query_id} only {len(item.real_noise)} distractors"
        )


def test_ec_r2_recall_at_10_real_corpus(real_items):
    """EC-R2: recall@10 ≥ 0.60 with real distractors.

    With 75% temporal overlap between query and expected window,
    Layer A should score the expected window higher than most
    contemporary distractors. Floor 0.60 is conservative.
    """
    report = run_recall_benchmark(
        eval_set=real_items,
        weights_abc=(0.60, 0.30, 0.10),
        noise_count=min(99, min(len(i.real_noise) for i in real_items)),
    )
    print(
        f"\nReal recall@10: {report.recall_at_10:.2%}  "
        f"({report.hits}/{report.total})"
    )
    misses = [r.query_id for r in report.query_results if not r.hit]
    if misses:
        print(f"Misses: {misses[:5]}")
    assert report.recall_at_10 >= 0.60, (
        f"real recall@10 = {report.recall_at_10:.2%} < 60%\n"
        f"Misses: {misses}"
    )


def test_ec_r2_real_not_worse_than_old_weights(real_items):
    """New weights (0.60,0.30,0.10) ≥ old (0.45,0.30,0.25) on real data."""
    noise_count = min(19, min(len(i.real_noise) for i in real_items))
    new_r = run_recall_benchmark(
        eval_set=real_items,
        weights_abc=(0.60, 0.30, 0.10),
        noise_count=noise_count,
    )
    old_r = run_recall_benchmark(
        eval_set=real_items,
        weights_abc=(0.45, 0.30, 0.25),
        noise_count=noise_count,
    )
    print(
        f"\nnew_weights={new_r.recall_at_10:.2%}  "
        f"old_weights={old_r.recall_at_10:.2%}"
    )
    assert new_r.recall_at_10 >= old_r.recall_at_10 - 0.05, (
        f"new weights ({new_r.recall_at_10:.2%}) worse than old "
        f"({old_r.recall_at_10:.2%}) by > 5%"
    )


def test_ec_r4_ingest_capture_snapshot(tmp_path):
    """EC-R4: ingest_capture_snapshot creates a corpus window and retrieves it."""
    from features.corpus_bridge import ingest_capture_snapshot
    from search.corpus import SearchCorpusStore

    corpus_db = tmp_path / "corpus.sqlite"
    captured_at_ms = 1_772_431_200_000  # 2026-03-02 06:00 UTC

    fake_snapshot = {
        "close_return_pct": 3.5,
        "realized_volatility_pct": 0.8,
        "volume_ratio": 1.4,
        "higher_low_count": 3,
        "breakout_flag": 1,
        "funding_rate_last": 0.0002,
    }

    wid = ingest_capture_snapshot(
        capture_id="test-cap-001",
        symbol="BTCUSDT",
        timeframe="1h",
        captured_at_ms=captured_at_ms,
        feature_snapshot=fake_snapshot,
        corpus_db_path=corpus_db,
    )

    assert wid is not None, "ingest returned None"
    assert len(wid) == 24, f"unexpected window_id length: {len(wid)}"

    store = SearchCorpusStore(corpus_db)
    windows = store.list_windows(symbol="BTCUSDT", timeframe="1h")
    assert len(windows) == 1
    assert windows[0].window_id == wid
    assert windows[0].source.startswith("capture:")

    sig = windows[0].signature
    assert abs(sig.get("close_return_pct", 0) - 3.5) < 1e-4


def test_ec_r4_ingest_empty_snapshot_returns_none(tmp_path):
    """Empty snapshots are rejected cleanly."""
    from features.corpus_bridge import ingest_capture_snapshot

    result = ingest_capture_snapshot(
        capture_id="empty-cap",
        symbol="BTCUSDT",
        timeframe="1h",
        captured_at_ms=1_772_431_200_000,
        feature_snapshot={},
        corpus_db_path=tmp_path / "corpus.sqlite",
    )
    assert result is None
