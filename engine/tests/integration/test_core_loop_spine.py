"""Integration golden test — W-0386-D.

Tests:
  - BH-FDR p-value vector stable after refactor (snapshot-based)
  - 4/4 Job Protocol smoke test
"""
from pathlib import Path
import pytest
import numpy as np

SNAPSHOT_DIR = Path(__file__).parent.parent / "snapshots"
BHFDR_SNAPSHOT = SNAPSHOT_DIR / "bh_fdr_pvector.npy"


@pytest.mark.integration
def test_bh_fdr_stable():
    """BH-FDR p-value vector unchanged after refactor (atol=0)."""
    from research.validation.stats import bh_correct

    test_pvals = [0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5]
    result = bh_correct(test_pvals, alpha=0.05)

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    if not BHFDR_SNAPSHOT.exists():
        np.save(str(BHFDR_SNAPSHOT), np.array(result))
        pytest.skip(f"BH-FDR snapshot created at {BHFDR_SNAPSHOT}. Re-run to verify.")

    baseline = np.load(str(BHFDR_SNAPSHOT))
    np.testing.assert_array_equal(result, baseline)


@pytest.mark.integration
def test_job_protocol_smoke():
    """4 job classes satisfy Job Protocol (AC-D2)."""
    from scanner.jobs.protocol import Job
    from scanner.jobs.universe_scan import UniverseScanJob
    from scanner.jobs.alpha_observer import AlphaObserverJob
    from scanner.jobs.alpha_warm import AlphaWarmJob
    from scanner.jobs.outcome_resolver import OutcomeResolverJob

    for cls in [UniverseScanJob, AlphaObserverJob, AlphaWarmJob, OutcomeResolverJob]:
        obj = cls()
        assert isinstance(obj, Job), f"{cls.__name__} not Job"
        assert hasattr(obj, "name"), f"{cls.__name__} missing name"
        assert hasattr(obj, "schedule"), f"{cls.__name__} missing schedule"
        assert isinstance(obj.name, str) and obj.name
        assert isinstance(obj.schedule, str) and obj.schedule
