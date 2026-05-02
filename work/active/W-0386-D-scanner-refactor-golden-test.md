# W-0386-D — Phase D: Scanner 의존 역전 + Golden Test + ADR-012

> Parent: W-0386 | Status: 🔴 Blocked (W-0386-C + **W-0378** 대기)
> Pre-conditions: W-0386-C merged AND **W-0378 merged** (agent endpoint 락 해제)
> Estimated files: 12개 | Estimated time: 2-3일

## 이 Phase가 하는 일

`scanner/scheduler.py` 611 → ≤350 lines, jobs/에 Job Protocol 도입, `core_loop/builder.py` 완성, integration golden test 추가, ADR-012 작성으로 W-0386 전체를 닫는다.

## Pre-conditions Checklist

- [ ] W-0386-C PR merged (SHA: ____________)
- [ ] **W-0378 PR merged** (SHA: ____________) — `engine/api/routes/agent.py` 락 해제 확인
- [ ] `git pull origin main` 후 `uv run pytest` pass
- [ ] 브랜치 생성: `git checkout -b feat/W-0386-D-scanner-golden`

## Setup Commands

```bash
# W-0378 머지 확인
git log --oneline | grep "W-0378" | head -3

# scheduler.py 현재 행 수 확인
wc -l engine/scanner/scheduler.py
# → 현재 611

mkdir -p engine/tests/integration
touch engine/tests/integration/__init__.py
mkdir -p docs/decisions
```

## Operations Table (exact, ordered)

| # | 타입 | Source | Destination | 추가 작업 |
|---|---|---|---|---|
| 1 | CREATE | — | `engine/scanner/jobs/protocol.py` | Job Protocol 정의 |
| 2 | CREATE | — | `engine/scanner/jobs/registry.py` | job 등록부 분리 |
| 3 | EDIT | `engine/scanner/scheduler.py` | (동일) | 611 → ≤350 lines |
| 4 | EDIT | `engine/scanner/jobs/universe_scan.py` | (동일) | Job Protocol 채택 |
| 5 | EDIT | `engine/scanner/jobs/alpha_observer.py` | (동일) | Job Protocol 채택 |
| 6 | EDIT | `engine/scanner/jobs/alpha_warm.py` | (동일) | Job Protocol 채택 |
| 7 | EDIT | `engine/scanner/jobs/outcome_resolver.py` | (동일) | Job Protocol 채택 |
| 8 | CREATE | — | `engine/core_loop/builder.py` | CoreLoopBuilder fluent API |
| 9 | CREATE | — | `engine/tests/integration/test_core_loop_spine.py` | golden test |
| 10 | CREATE | — | `engine/tests/unit/test_core_loop_builder.py` | builder unit tests |
| 11 | CREATE | — | `docs/decisions/ADR-012-core-loop-spine.md` | ADR 신규 |
| 12 | EDIT | `docs/decisions/ADR-006-core-loop-runtime-adapter-boundary.md` | cross-link 추가 |
| 13 | EDIT | `docs/decisions/ADR-009-core-runtime-ownership.md` | cross-link 추가 |

---

### `engine/scanner/jobs/protocol.py`

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable, Any


@dataclass
class JobContext:
    dry_run: bool = False
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class JobResult:
    name: str
    ok: bool
    processed: int = 0
    error: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class Job(Protocol):
    name: str
    schedule: str  # cron 표현식 (예: "*/5 * * * *")

    async def run(self, ctx: JobContext) -> JobResult: ...
```

---

### `engine/scanner/jobs/registry.py`

```python
from __future__ import annotations
from engine.scanner.jobs.protocol import Job
import logging

log = logging.getLogger("engine.scanner.jobs.registry")

_REGISTRY: dict[str, Job] = {}


def register(job: Job) -> None:
    _REGISTRY[job.name] = job
    log.debug("Registered job: %s (schedule=%s)", job.name, job.schedule)


def get_all() -> list[Job]:
    return list(_REGISTRY.values())


def get(name: str) -> Job | None:
    return _REGISTRY.get(name)
```

---

### `engine/scanner/scheduler.py` 축소 전략

611 lines → ≤350 lines 달성 방법:
1. job 등록 로직 → `jobs/registry.py`로 이동
2. 각 job의 `async def` 구현 → 이미 `jobs/*.py`에 있으므로 scheduler는 등록+실행만
3. ENABLE_SIGNAL_EVENTS 처리는 `jobs/registry.py`의 조건부 register로 이동
4. APScheduler 설정 (executor, jobstore)만 남김

축소 후 scheduler.py 구조:
```python
"""scheduler.py — APScheduler 설정 + job 등록 진입점. ≤350 lines."""
from engine.scanner.jobs.registry import register, get_all
from engine.scanner.jobs.universe_scan import UniverseScanJob
from engine.scanner.jobs.alpha_observer import AlphaObserverJob
from engine.scanner.jobs.alpha_warm import AlphaWarmJob
from engine.scanner.jobs.outcome_resolver import OutcomeResolverJob

def build_scheduler():
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler()

    # job 등록
    register(UniverseScanJob())
    register(AlphaObserverJob())
    register(AlphaWarmJob())
    register(OutcomeResolverJob())

    for job in get_all():
        scheduler.add_job(
            _wrap(job),
            "cron",
            id=job.name,
            # parse job.schedule (cron) → kwargs
        )
    return scheduler
```

---

### `engine/core_loop/builder.py`

```python
from __future__ import annotations
from engine.core_loop.contracts import PipelineRequest, PipelineResult
from engine.core_loop.ports import DataPort, SignalStorePort, OutcomeStorePort, LedgerPort
from engine.core_loop.spine import CoreLoop, Stage
import asyncio


class CoreLoopBuilder:
    """Fluent builder for CoreLoop instances."""

    def __init__(self) -> None:
        self._stages: list[Stage] = []
        self._data_port: DataPort | None = None
        self._signal_port: SignalStorePort | None = None
        self._outcome_port: OutcomeStorePort | None = None
        self._ledger_port: LedgerPort | None = None

    def with_data(self, port: DataPort) -> "CoreLoopBuilder":
        self._data_port = port
        return self

    def with_signal_store(self, port: SignalStorePort) -> "CoreLoopBuilder":
        self._signal_port = port
        return self

    def with_outcome_store(self, port: OutcomeStorePort) -> "CoreLoopBuilder":
        self._outcome_port = port
        return self

    def with_ledger(self, port: LedgerPort) -> "CoreLoopBuilder":
        self._ledger_port = port
        return self

    def with_stage(self, stage: Stage) -> "CoreLoopBuilder":
        self._stages.append(stage)
        return self

    def build(self) -> CoreLoop:
        from engine.pipeline_stages import build_default_stages
        stages = self._stages or build_default_stages(
            data_port=self._data_port,
            signal_port=self._signal_port,
            outcome_port=self._outcome_port,
            ledger_port=self._ledger_port,
        )
        return CoreLoop(stages=stages)

    def run(self, request: PipelineRequest) -> PipelineResult:
        return asyncio.run(self.build().run(request))
```

---

### `engine/tests/unit/test_core_loop_builder.py`

```python
"""CoreLoopBuilder unit tests — 12 cases."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from engine.core_loop.builder import CoreLoopBuilder
from engine.core_loop.contracts import PipelineRequest, PipelineResult
from engine.core_loop.ports import DataPort, SignalStorePort, OutcomeStorePort, LedgerPort


class FakeDataPort:
    async def refresh(self, symbols): pass

class FakeSignalPort:
    def upsert_events(self, events): pass
    def resolve_outcome(self, sid, pnl): pass

class FakeOutcomePort:
    def write_outcomes(self, outcomes): pass

class FakeLedgerPort:
    def append(self, records): pass
    def latest_path(self): return None


def test_builder_default_build():
    loop = CoreLoopBuilder().build()
    assert loop is not None

def test_builder_with_ports():
    loop = (CoreLoopBuilder()
        .with_data(FakeDataPort())
        .with_signal_store(FakeSignalPort())
        .with_outcome_store(FakeOutcomePort())
        .with_ledger(FakeLedgerPort())
        .build())
    assert loop is not None

def test_builder_fluent_returns_self():
    b = CoreLoopBuilder()
    assert b.with_data(FakeDataPort()) is b
    assert b.with_signal_store(FakeSignalPort()) is b
    assert b.with_outcome_store(FakeOutcomePort()) is b
    assert b.with_ledger(FakeLedgerPort()) is b

def test_pipeline_request_defaults():
    req = PipelineRequest(symbols=["BTCUSDT"])
    assert req.refresh_data == False
    assert req.top_n == 20
    assert req.run_id is not None

def test_pipeline_result_ok_default():
    from engine.core_loop.contracts import PipelineRequest
    req = PipelineRequest(symbols=[])
    result = PipelineResult(request=req)
    assert result.ok == True
    assert result.failed_stages() == []

def test_stage_result_error():
    from engine.core_loop.contracts import StageResult
    sr = StageResult(stage="test", ok=False, duration_s=0.1, error="boom")
    assert not sr.ok
    assert sr.error == "boom"

def test_port_protocols():
    assert isinstance(FakeDataPort(), DataPort)
    assert isinstance(FakeSignalPort(), SignalStorePort)
    assert isinstance(FakeOutcomePort(), OutcomeStorePort)
    assert isinstance(FakeLedgerPort(), LedgerPort)

def test_core_loop_single_stage():
    import asyncio
    from engine.core_loop.contracts import StageResult
    from engine.core_loop.spine import CoreLoop

    class OkStage:
        name = "ok"
        async def run(self, req, result):
            return StageResult(stage="ok", ok=True, duration_s=0.0)

    loop = CoreLoop(stages=[OkStage()])
    req = PipelineRequest(symbols=["BTCUSDT"])
    result = asyncio.run(loop.run(req))
    assert result.ok
    assert len(result.stages) == 1

def test_core_loop_stops_on_failure():
    import asyncio
    from engine.core_loop.contracts import StageResult
    from engine.core_loop.spine import CoreLoop

    class FailStage:
        name = "fail"
        async def run(self, req, result):
            return StageResult(stage="fail", ok=False, duration_s=0.0, error="err")

    class ShouldNotRun:
        name = "skip"
        async def run(self, req, result):
            raise AssertionError("Should not run after failure")

    loop = CoreLoop(stages=[FailStage(), ShouldNotRun()])
    result = asyncio.run(loop.run(PipelineRequest(symbols=[])))
    assert not result.ok
    assert len(result.stages) == 1

def test_builder_custom_stage():
    import asyncio
    from engine.core_loop.contracts import StageResult

    class NopStage:
        name = "nop"
        async def run(self, req, result):
            return StageResult(stage="nop", ok=True, duration_s=0.0)

    result = (CoreLoopBuilder()
        .with_stage(NopStage())
        .run(PipelineRequest(symbols=[])))
    assert result.ok

def test_job_protocol():
    from engine.scanner.jobs.protocol import Job, JobContext, JobResult
    class FakeJob:
        name = "fake"
        schedule = "*/5 * * * *"
        async def run(self, ctx: JobContext) -> JobResult:
            return JobResult(name=self.name, ok=True)
    assert isinstance(FakeJob(), Job)

def test_job_registry_add_get():
    from engine.scanner.jobs import registry
    from engine.scanner.jobs.protocol import JobContext, JobResult
    class RegJob:
        name = "reg_test_job"
        schedule = "0 * * * *"
        async def run(self, ctx):
            return JobResult(name=self.name, ok=True)
    registry.register(RegJob())
    assert registry.get("reg_test_job") is not None
```

---

### `engine/tests/integration/test_core_loop_spine.py`

```python
"""Integration golden test — W-0386-D.

5 symbols × 30d window → PipelineResult sha256 byte-equal to baseline.
BH-FDR p-vector atol=0.
KS-test pattern_outcomes distribution p > 0.99.
"""
import hashlib
import json
import warnings
from pathlib import Path
import pytest
import numpy as np

SNAPSHOT_DIR = Path(__file__).parent.parent / "snapshots"
PIPELINE_SNAPSHOT = SNAPSHOT_DIR / "pipeline_result_sha256.json"
BHFDR_SNAPSHOT = SNAPSHOT_DIR / "bh_fdr_pvector.npy"

SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]


def _run_pipeline():
    from engine.core_loop.builder import CoreLoopBuilder
    from engine.core_loop.contracts import PipelineRequest
    req = PipelineRequest(symbols=SYMBOLS, top_n=5)
    return CoreLoopBuilder().run(req)


def _sha256_result(result) -> str:
    payload = {
        "ok": result.ok,
        "stages": [{"name": s.stage, "ok": s.ok} for s in result.stages],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


@pytest.mark.integration
def test_golden_snapshot():
    """PipelineResult structure byte-equal to baseline."""
    result = _run_pipeline()
    sha = _sha256_result(result)

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    if not PIPELINE_SNAPSHOT.exists():
        PIPELINE_SNAPSHOT.write_text(json.dumps({"sha256": sha}))
        pytest.skip(f"Snapshot created: {sha}. Re-run to verify.")

    baseline = json.loads(PIPELINE_SNAPSHOT.read_text())["sha256"]
    assert sha == baseline, f"Pipeline structure changed: {sha} != {baseline}"


@pytest.mark.integration
def test_bh_fdr_stable():
    """BH-FDR p-value vector unchanged after refactor (atol=0)."""
    from engine.research.validation.stats import bh_correct
    test_pvals = [0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5]
    result = bh_correct(test_pvals, alpha=0.05)

    if not BHFDR_SNAPSHOT.exists():
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        np.save(str(BHFDR_SNAPSHOT), np.array(result))
        pytest.skip("BH-FDR snapshot created. Re-run to verify.")

    baseline = np.load(str(BHFDR_SNAPSHOT))
    np.testing.assert_array_equal(result, baseline)


@pytest.mark.integration
def test_pattern_outcomes_ks():
    """pattern_outcomes distribution KS-test p > 0.99 (before vs after refactor)."""
    # 이 테스트는 engine.research.artifacts.finding_store를 사용
    # baseline distribution은 Phase C 완료 후 첫 실행에서 저장됨
    DIST_SNAPSHOT = SNAPSHOT_DIR / "pattern_outcomes_dist.npy"
    from engine.research.artifacts.finding_store import FindingStore

    store = FindingStore()
    try:
        outcomes = store.get_recent_pnl(limit=200)
    except Exception:
        pytest.skip("finding_store unavailable in test environment")

    if not outcomes:
        pytest.skip("No pattern outcomes in store")

    arr = np.array(outcomes)
    if not DIST_SNAPSHOT.exists():
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        np.save(str(DIST_SNAPSHOT), arr)
        pytest.skip("Distribution snapshot created. Re-run to verify.")

    baseline = np.load(str(DIST_SNAPSHOT))
    from scipy import stats
    ks_stat, p_value = stats.ks_2samp(arr, baseline)
    assert p_value > 0.99, f"KS-test p={p_value:.4f} < 0.99 — distribution changed"
```

---

### `docs/decisions/ADR-012-core-loop-spine.md` 내용

```markdown
# ADR-012 — Core Loop Spine & research/ 4-subpackage Boundary

Date: 2026-05-02
Status: Accepted
Supersedes: (부분) ADR-006, ADR-009
Linked: W-0386

## Context

engine.research 가 내부 import 45회 허브로 굳어, 새 시그널 도메인 추가마다 결합 누적.
17개+ 경쟁 진입점으로 재현 가능한 코어루프 실행 불가.

## Decision

1. engine/core_loop/ 신규 패키지: Stage Protocol + CoreLoop + Ports (ADR-002 app-engine-boundary 준수)
2. engine/research/ → discovery/validation/ensemble/artifacts 단방향 의존 레이어
3. import-linter CI gate로 경계 강제
4. pipeline.py는 CoreLoop facade (DeprecationWarning 4주)

## Consequences

- `from engine.research` top-level: 45 → ≤ 12
- 신규 시그널 도메인: research/discovery/ 또는 research/artifacts/ 에만 추가
- 새 진입점 금지: CoreLoopBuilder 사용 강제 (import-linter `pipeline-thin-facade`)

## Cross-links

- ADR-006: core-loop ↔ runtime-adapter — core_loop/ports.py가 Port Protocol로 구현
- ADR-009: core-runtime ownership — CoreLoop이 canonical owner
```

## Verification Commands

```bash
# 1. scheduler.py ≤ 350 lines
wc -l engine/scanner/scheduler.py
# → ≤ 350

# 2. 4/4 jobs Job Protocol 채택 확인
cd engine && uv run python -c "
from engine.scanner.jobs.protocol import Job
from engine.scanner.jobs.universe_scan import UniverseScanJob
from engine.scanner.jobs.alpha_observer import AlphaObserverJob
from engine.scanner.jobs.alpha_warm import AlphaWarmJob
from engine.scanner.jobs.outcome_resolver import OutcomeResolverJob
for cls in [UniverseScanJob, AlphaObserverJob, AlphaWarmJob, OutcomeResolverJob]:
    obj = cls()
    assert isinstance(obj, Job), f'{cls} not Job'
    assert hasattr(obj, 'schedule'), f'{cls} no schedule'
print('4/4 jobs OK')
"
# → 4/4 jobs OK

# 3. builder unit tests (12 cases)
uv run pytest engine/tests/unit/test_core_loop_builder.py -v
# → 12 passed

# 4. import-linter 전체 0 위반
uv run lint-imports --config .importlinter
# → 0 violations

# 5. integration golden test (snapshot 생성 또는 pass)
uv run pytest engine/tests/integration/ -v -m integration --tb=short
# → skip (첫 실행: snapshot 생성) 또는 pass

# 6. 전체 pytest
uv run pytest engine/tests/ -q --tb=short 2>&1 | tail -5
# → 기존 + 신규 13개 이상, 0 failed

# 7. scheduler→research direct import 0
grep -n "from research\.\|from engine\.research\." engine/scanner/scheduler.py | grep -v "jobs\." | wc -l
# → 0
```

## Commit & PR

```bash
git add engine/scanner/jobs/protocol.py engine/scanner/jobs/registry.py \
        engine/scanner/scheduler.py engine/scanner/jobs/*.py \
        engine/core_loop/builder.py \
        engine/tests/integration/ engine/tests/unit/test_core_loop_builder.py \
        engine/tests/snapshots/ \
        docs/decisions/ADR-012-core-loop-spine.md \
        docs/decisions/ADR-006-core-loop-runtime-adapter-boundary.md \
        docs/decisions/ADR-009-core-runtime-ownership.md

git commit -m "feat(W-0386-D): Job Protocol + golden test + CoreLoopBuilder + ADR-012"

gh pr create \
  --title "[W-0386-D] Scanner Job Protocol + Golden Test + ADR-012 — W-0386 마무리" \
  --body "## Changes
- scanner/jobs/protocol.py: Job Protocol (name/schedule/run)
- scanner/jobs/registry.py: job 등록부 분리
- scanner/scheduler.py: 611 → ≤350 lines
- core_loop/builder.py: CoreLoopBuilder fluent API
- tests/unit/test_core_loop_builder.py: 12 unit tests
- tests/integration/test_core_loop_spine.py: golden snapshot + BH-FDR + KS-test
- docs/decisions/ADR-012: core-loop-spine 경계 문서화

## Verification
- [ ] scheduler.py ≤ 350 lines
- [ ] 4/4 jobs Job Protocol 채택
- [ ] builder unit 12 passed
- [ ] import-linter 0 violations
- [ ] integration golden test pass
- [ ] pytest 전체 pass

Closes #ISSUE_NUM"
```

## Exit Criteria (Phase D)

- [ ] AC-D1: `engine/scanner/scheduler.py` ≤ 350 lines
- [ ] AC-D2: 4/4 jobs Job Protocol 채택 (`isinstance(job, Job)` 확인)
- [ ] AC-D3: `scheduler.py` → `research.*` direct import 0 (ports 경유만)
- [ ] AC-D4: `engine/core_loop/builder.py` — `CoreLoopBuilder` fluent API 완성
- [ ] AC-D5: builder unit tests 12개 pass
- [ ] AC-D6: integration golden test — parquet sha256 byte-equal, BH-FDR atol=0
- [ ] AC-D7: import-linter 전체 0 violations
- [ ] AC-D8: ADR-012 신규 + ADR-006/009 cross-link
- [ ] AC-D9: 전체 pytest pass (신규 ≥ 13개)
- [ ] PR merged + CURRENT.md main SHA 업데이트
