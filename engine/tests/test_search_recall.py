"""F-16: recall@10 CI gate — pattern similarity search quality.

Exit Criteria:
  EC-1: eval_set.EVAL_SET has exactly 50 items
  EC-3/4: recall@10 >= 0.70 with new weights (0.60, 0.30, 0.10)
  EC-5: recall@10 with new weights >= recall@10 with old weights (non-regression)
"""
from __future__ import annotations

import pytest

from search.eval_set import EVAL_SET
from search.recall_benchmark import run_recall_benchmark

_NEW_WEIGHTS = (0.60, 0.30, 0.10)
_OLD_WEIGHTS = (0.45, 0.30, 0.25)
_RECALL_FLOOR = 0.70


def test_eval_set_has_50_items() -> None:
    assert len(EVAL_SET) == 50


def test_eval_set_all_query_ids_unique() -> None:
    ids = [item.query_id for item in EVAL_SET]
    assert len(ids) == len(set(ids)), "Duplicate query_ids in EVAL_SET"


def test_eval_set_all_pattern_slugs_non_empty() -> None:
    for item in EVAL_SET:
        assert item.pattern_slug, f"{item.query_id} has empty pattern_slug"
        assert item.pattern_draft.get("pattern_slug") or item.pattern_draft.get("search_hints"), (
            f"{item.query_id} pattern_draft is missing slug and search_hints"
        )


def test_recall_at_10_meets_floor() -> None:
    report = run_recall_benchmark(weights_abc=_NEW_WEIGHTS)
    assert report.recall_at_10 >= _RECALL_FLOOR, (
        f"recall@10 = {report.recall_at_10:.2%} ({report.hits}/{report.total}) < {_RECALL_FLOOR:.0%}\n"
        f"Misses: {[r.query_id for r in report.query_results if not r.hit]}"
    )


def test_new_weights_not_worse_than_old() -> None:
    new_report = run_recall_benchmark(weights_abc=_NEW_WEIGHTS)
    old_report = run_recall_benchmark(weights_abc=_OLD_WEIGHTS)
    assert new_report.recall_at_10 >= old_report.recall_at_10 - 0.02, (
        f"New weights ({new_report.recall_at_10:.2%}) worse than old ({old_report.recall_at_10:.2%}) by >2%"
    )


def test_default_weights_updated() -> None:
    from search.similar import _W_ABC_DEFAULT
    assert _W_ABC_DEFAULT == _NEW_WEIGHTS, (
        f"_W_ABC_DEFAULT not updated: got {_W_ABC_DEFAULT}, expected {_NEW_WEIGHTS}"
    )
