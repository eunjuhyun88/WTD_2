# W-0386-B — Phase B: Core Loop Spine + Facade

> Parent: W-0386 | Status: 🔴 Blocked (W-0386-A 대기)
> Pre-conditions: W-0386-A merged
> Estimated files: 8개 | Estimated time: 2-3일

## 이 Phase가 하는 일

`engine/core_loop/` 신규 패키지에 Stage Protocol + Contracts + Ports를 정의하고, `engine/pipeline.py`를 458 → ≤120 lines facade로 축소한다. 기존 `ResearchPipeline.run()` CLI 호환 유지.

## Pre-conditions Checklist

- [ ] W-0386-A PR merged (SHA: ____________)
- [ ] `git pull origin main` 후 `uv run pytest` pass
- [ ] 브랜치 생성: `git checkout -b feat/W-0386-B-core-loop-spine`

## Setup Commands

```bash
mkdir -p engine/core_loop
touch engine/core_loop/__init__.py
```

## Operations Table (exact, ordered)

| # | 타입 | Source 경로 | Destination 경로 | 추가 작업 |
|---|---|---|---|---|
| 1 | MKDIR | — | `engine/core_loop/` | |
| 2 | CREATE | — | `engine/core_loop/__init__.py` | 아래 내용 |
| 3 | CREATE | — | `engine/core_loop/contracts.py` | 아래 내용 |
| 4 | CREATE | — | `engine/core_loop/ports.py` | 아래 내용 |
| 5 | CREATE | — | `engine/core_loop/spine.py` | 아래 내용 |
| 6 | EDIT | `engine/pipeline.py` | (동일) | 458 → ≤120 lines facade화 |
| 7 | CREATE | — | `engine/tests/test_pipeline_compat.py` | backward-compat + snapshot |
| 8 | CREATE | — | `engine/tests/snapshots/` | sha256 고정 파일 저장 디렉토리 |

---

### `engine/core_loop/__init__.py`

```python
from engine.core_loop.spine import Stage, CoreLoop
from engine.core_loop.contracts import PipelineRequest, PipelineResult, StageResult
from engine.core_loop.ports import DataPort, SignalStorePort, OutcomeStorePort, LedgerPort
from engine.core_loop.builder import CoreLoopBuilder  # Phase D에서 추가

__all__ = [
    "Stage", "CoreLoop",
    "PipelineRequest", "PipelineResult", "StageResult",
    "DataPort", "SignalStorePort", "OutcomeStorePort", "LedgerPort",
]
```

---

### `engine/core_loop/contracts.py`

```python
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class PipelineRequest:
    symbols: list[str]
    refresh_data: bool = False
    top_n: int = 20
    out_dir: str | None = None
    run_id: str = field(default_factory=lambda: datetime.utcnow().strftime("%Y%m%d_%H%M%S"))


@dataclass
class StageResult:
    stage: str
    ok: bool
    duration_s: float
    meta: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@dataclass
class PipelineResult:
    request: PipelineRequest
    stages: list[StageResult] = field(default_factory=list)
    ok: bool = True
    total_duration_s: float = 0.0
    out_path: str | None = None

    def failed_stages(self) -> list[StageResult]:
        return [s for s in self.stages if not s.ok]
```

---

### `engine/core_loop/ports.py`

```python
from __future__ import annotations
from typing import Protocol, runtime_checkable
from pathlib import Path


@runtime_checkable
class DataPort(Protocol):
    async def refresh(self, symbols: list[str]) -> None: ...


@runtime_checkable
class SignalStorePort(Protocol):
    def upsert_events(self, events: list[dict]) -> None: ...
    def resolve_outcome(self, signal_id: str, pnl_bps: float) -> None: ...


@runtime_checkable
class OutcomeStorePort(Protocol):
    def write_outcomes(self, outcomes: list[dict]) -> None: ...


@runtime_checkable
class LedgerPort(Protocol):
    def append(self, records: list[dict]) -> None: ...
    def latest_path(self) -> Path | None: ...
```

---

### `engine/core_loop/spine.py`

```python
from __future__ import annotations
import asyncio
import logging
import time
from typing import Protocol, runtime_checkable

from engine.core_loop.contracts import PipelineRequest, PipelineResult, StageResult

log = logging.getLogger("engine.core_loop.spine")


@runtime_checkable
class Stage(Protocol):
    name: str
    async def run(self, req: PipelineRequest, result: PipelineResult) -> StageResult: ...


class CoreLoop:
    """Ordered sequence of stages. Each stage receives the running PipelineResult for context."""

    def __init__(self, stages: list[Stage]) -> None:
        self._stages = stages

    async def run(self, req: PipelineRequest) -> PipelineResult:
        result = PipelineResult(request=req)
        t0 = time.monotonic()
        for stage in self._stages:
            t_stage = time.monotonic()
            try:
                sr = await stage.run(req, result)
            except Exception as exc:
                sr = StageResult(
                    stage=stage.name, ok=False,
                    duration_s=time.monotonic() - t_stage,
                    error=str(exc),
                )
                log.error("Stage %s failed: %s", stage.name, exc)
            result.stages.append(sr)
            if not sr.ok:
                result.ok = False
                break
        result.total_duration_s = time.monotonic() - t0
        return result
```

---

### `engine/pipeline.py` 축소 내용 (facade, ≤120 lines)

기존 `pipeline.py`의 `ResearchPipeline` 클래스는 아래 facade로 교체한다.
내부 로직(DATA refresh, SCAN, VALIDATE, SAVE, REPORT)은 각 stage 구현체에 위임된다.
Stage 구현체는 기존 `pipeline.py` 함수들을 `async def run()` 래퍼로 감싸는 방식으로 구성.

```python
"""Research Pipeline facade — delegates to engine.core_loop.

Backward-compatible entrypoint. Prefer engine.core_loop.CoreLoopBuilder directly.
"""
from __future__ import annotations
import asyncio
import warnings
from dataclasses import dataclass, field
from pathlib import Path

try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError:
    pass

from engine.core_loop.contracts import PipelineRequest, PipelineResult
from engine.core_loop.spine import CoreLoop
from engine.pipeline_stages import build_default_stages  # 기존 로직을 stage로 감싼 모듈


@dataclass
class PipelineConfig:
    symbols: list[str] | None = None
    refresh: bool = False
    top: int = 20
    out: Path | None = None


class ResearchPipeline:
    """Backward-compatible facade. Use CoreLoopBuilder for new code."""

    def __init__(self, config: PipelineConfig | None = None) -> None:
        warnings.warn(
            "ResearchPipeline is deprecated. Use engine.core_loop.CoreLoopBuilder.",
            DeprecationWarning, stacklevel=2,
        )
        self._config = config or PipelineConfig()

    def run(self, symbols: list[str] | None = None, refresh: bool = False, top: int = 20) -> PipelineResult:
        req = PipelineRequest(
            symbols=symbols or self._config.symbols or [],
            refresh_data=refresh or self._config.refresh,
            top_n=top,
        )
        loop = CoreLoop(stages=build_default_stages())
        return asyncio.run(loop.run(req))


def main() -> None:
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--symbols", nargs="*")
    p.add_argument("--refresh", action="store_true")
    p.add_argument("--top", type=int, default=20)
    args = p.parse_args()
    pipeline = ResearchPipeline()
    result = pipeline.run(symbols=args.symbols, refresh=args.refresh, top=args.top)
    if not result.ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
```

**`engine/pipeline_stages.py`** (신규, 기존 pipeline.py 내부 로직 stage화):

기존 `_refresh_data`, `_run_scan`, `_run_validate`, `_save`, `_report` 함수들을 
`Stage` Protocol을 구현하는 클래스로 래핑. 행위 변경 없음 (함수 내부 코드 동일).

---

### `engine/tests/test_pipeline_compat.py`

```python
"""Backward-compatibility + golden snapshot test for W-0386-B."""
import hashlib
import json
from pathlib import Path
import pytest

SNAPSHOT_DIR = Path(__file__).parent / "snapshots"
SNAPSHOT_FILE = SNAPSHOT_DIR / "pipeline_result_sha256.json"


def _sha256_result(result) -> str:
    s = json.dumps({
        "ok": result.ok,
        "stage_names": [s.stage for s in result.stages],
        "stage_ok": [s.ok for s in result.stages],
    }, sort_keys=True)
    return hashlib.sha256(s.encode()).hexdigest()


def test_research_pipeline_deprecation_warning():
    """ResearchPipeline emit DeprecationWarning."""
    import warnings
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        from engine.pipeline import ResearchPipeline, PipelineConfig
        ResearchPipeline(PipelineConfig())
    assert any(issubclass(x.category, DeprecationWarning) for x in w)


def test_pipeline_cli_importable():
    """python -m engine.pipeline --help 실행 가능."""
    import subprocess, sys
    r = subprocess.run(
        [sys.executable, "-m", "engine.pipeline", "--help"],
        capture_output=True, cwd=Path(__file__).parent.parent,
    )
    assert r.returncode == 0


@pytest.mark.integration
def test_golden_snapshot_5sym_30d(tmp_path):
    """5 symbols × 30d window → PipelineResult sha256 byte-equal to baseline."""
    from engine.pipeline import ResearchPipeline, PipelineConfig
    import warnings
    SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        p = ResearchPipeline(PipelineConfig(symbols=SYMBOLS, top=5))
        result = p.run()

    sha = _sha256_result(result)

    if not SNAPSHOT_FILE.exists():
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        SNAPSHOT_FILE.write_text(json.dumps({"sha256": sha}))
        pytest.skip(f"Snapshot created: {sha}. Re-run to verify.")

    baseline = json.loads(SNAPSHOT_FILE.read_text())["sha256"]
    assert sha == baseline, f"Pipeline result changed: {sha} != {baseline}"
```

## Import Path Update Map

이 Phase는 신규 파일 생성 + pipeline.py 축소만. 기존 import 경로 변경 없음.
기존 `from engine.pipeline import ResearchPipeline` 호출자 수정 불필요.

```bash
# 확인: 기존 호출자 목록
grep -rn "from engine.pipeline\|import engine.pipeline" engine/ app/ --include="*.py" --include="*.ts" 2>/dev/null
```

## Verification Commands

```bash
# 1. 신규 패키지 import 확인
cd engine && uv run python -c "from engine.core_loop import CoreLoop, PipelineRequest; print('OK')"
# → OK

# 2. pipeline.py ≤ 120 lines 확인
wc -l engine/pipeline.py
# → ≤ 120

# 3. DeprecationWarning 발생 확인
uv run python -W error::DeprecationWarning -c "
import warnings
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter('always')
    from engine.pipeline import ResearchPipeline
    ResearchPipeline()
print(len([x for x in w if issubclass(x.category, DeprecationWarning)]), 'warnings')
"
# → 1 warnings 이상

# 4. CLI 호환 확인
uv run python -m engine.pipeline --help
# → 에러 없음

# 5. unit tests pass
uv run pytest engine/tests/test_pipeline_compat.py -v -k "not integration"
# → 2 passed

# 6. import-linter (Phase A에서 등록한 계약 중 pipeline-thin-facade 위반 0)
uv run lint-imports --config .importlinter
# → 위반 0 (pipeline_stages.py가 research 직접 import하면 구조 조정)

# 7. 전체 pytest
uv run pytest engine/tests/ -q --tb=short
# → 기존 test count + 2 이상, 0 failed
```

## Commit & PR

```bash
git add engine/core_loop/ engine/pipeline.py engine/pipeline_stages.py engine/tests/test_pipeline_compat.py engine/tests/snapshots/
git commit -m "feat(W-0386-B): core_loop spine + contracts + ports + pipeline facade (458→≤120 lines)"
gh pr create \
  --title "[W-0386-B] Core Loop Spine + Pipeline Facade" \
  --body "## Changes
- engine/core_loop/: Stage Protocol, contracts, ports 신규 패키지
- engine/pipeline.py: 458 → ≤120 lines facade (DeprecationWarning)
- engine/pipeline_stages.py: 기존 로직을 Stage 구현체로 래핑
- engine/tests/test_pipeline_compat.py: 호환 + golden snapshot

## Verification
- [ ] core_loop import OK
- [ ] pipeline.py ≤ 120 lines
- [ ] DeprecationWarning 발생 확인
- [ ] CLI --help 호환
- [ ] import-linter pipeline-thin-facade 위반 0
- [ ] pytest pass

Part of #ISSUE_NUM"
```

## Exit Criteria (Phase B)

- [ ] AC-B1: `engine/core_loop/` 4파일 (\_\_init\_\_, spine, contracts, ports) 생성
- [ ] AC-B2: `engine/pipeline.py` ≤ 120 lines
- [ ] AC-B3: `python -m engine.pipeline --help` 성공
- [ ] AC-B4: DeprecationWarning 발생 (test_pipeline_compat.py pass)
- [ ] AC-B5: import-linter `pipeline-thin-facade` contract 위반 0
- [ ] AC-B6: golden snapshot 생성 또는 byte-equal pass
- [ ] PR merged
