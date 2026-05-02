# W-0386-C — Phase C: research/ 4-subpackage 분해

> Parent: W-0386 | Status: 🔴 Blocked (W-0386-B + **W-0370** 대기)
> Pre-conditions: W-0386-B merged AND **W-0370 merged** (signal_event_store.py 락 해제)
> Estimated files: ~60개 (git mv 위주) | Estimated time: 3-4일

## 이 Phase가 하는 일

`engine/research/` 50+ 파일 모노리스를 `discovery / validation / ensemble / artifacts` 4 sub-package로 재배치한다. 행위 변경 0. `engine/research/__init__.py`는 backward-compat re-export shim 유지.

## Pre-conditions Checklist

- [ ] W-0386-B PR merged (SHA: ____________)
- [ ] **W-0370 PR merged** (SHA: ____________) — signal_event_store.py 락 해제 확인
- [ ] `git pull origin main` 후 `uv run pytest` pass
- [ ] 브랜치 생성: `git checkout -b feat/W-0386-C-research-split`

```bash
# W-0370 머지 확인
git log --oneline | grep "W-0370" | head -3
# → W-0370 커밋이 있어야 진행
```

## Setup Commands

```bash
cd engine/research

# sub-package 디렉토리 생성
mkdir -p discovery validation ensemble artifacts

# __init__.py 생성
touch discovery/__init__.py
touch ensemble/__init__.py    # 이미 있으면 skip
touch artifacts/__init__.py

# validation/__init__.py 이미 존재 — 내용 확인
cat validation/__init__.py
```

## Operations Table (exact, ordered)

모든 이동은 `git mv` 사용 (history 보존).

### Phase C-1: discovery/ 구성

| # | 타입 | Source | Destination | 추가 작업 |
|---|---|---|---|---|
| 1 | MKDIR | — | `engine/research/discovery/` | |
| 2 | git mv | `engine/research/autoresearch_loop.py` | `engine/research/discovery/autoresearch_loop.py` | |
| 3 | git mv | `engine/research/autoresearch_runner.py` | `engine/research/discovery/autoresearch_runner.py` | |
| 4 | git mv | `engine/research/orchestrator.py` | `engine/research/discovery/orchestrator.py` | |
| 5 | git mv | `engine/research/discovery_agent.py` | `engine/research/discovery/discovery_agent.py` | |
| 6 | git mv | `engine/research/pattern_discovery_agent.py` | `engine/research/discovery/pattern_discovery_agent.py` | |
| 7 | git mv | `engine/research/query_transformer.py` | `engine/research/discovery/query_transformer.py` | |
| 8 | git mv | `engine/research/candidate_search.py` | `engine/research/discovery/candidate_search.py` | |
| 9 | git mv | `engine/research/sweep_parameters.py` | `engine/research/discovery/sweep_parameters.py` | |
| 10 | git mv | `engine/research/paradigm_framework.py` | `engine/research/discovery/paradigm_framework.py` | |
| 11 | git mv | `engine/research/manual_hypothesis_pack_builder.py` | `engine/research/discovery/manual_hypothesis_pack_builder.py` | |
| 12 | git mv | `engine/research/event_tracker/` | `engine/research/discovery/event_tracker/` | 디렉토리째 이동 |
| 13 | git mv | `engine/research/pattern_scan/` | `engine/research/discovery/pattern_scan/` | 디렉토리째 이동 |
| 14 | git mv | `engine/research/proposer/` | `engine/research/discovery/proposer/` | 디렉토리째 이동 |
| 15 | git mv | `engine/research/live_monitor.py` | `engine/research/discovery/live_monitor.py` | |
| 16 | git mv | `engine/research/discovery_tools.py` | `engine/research/discovery/discovery_tools.py` | |
| 17 | git mv | `engine/research/worker_control.py` | `engine/research/discovery/worker_control.py` | |
| 18 | CREATE | — | `engine/research/discovery/__init__.py` | 아래 내용 |

### Phase C-2: validation/ 보강

| # | 타입 | Source | Destination | 추가 작업 |
|---|---|---|---|---|
| 19 | git mv | `engine/research/ratchet.py` | `engine/research/validation/ratchet.py` | |
| 20 | git mv | `engine/research/alpha_quality.py` | `engine/research/validation/alpha_quality.py` | |
| 21 | git mv | `engine/research/eval_protocol.py` | `engine/research/validation/eval_protocol.py` | |
| 22 | git mv | `engine/research/objectives.py` | `engine/research/validation/objectives.py` | |
| 23 | git mv | `engine/research/verification_loop.py` | `engine/research/validation/verification_loop.py` | |
| 24 | EDIT | `engine/research/validation/__init__.py` | (동일) | __all__ 업데이트 |

### Phase C-3: ensemble/ 보강

| # | 타입 | Source | Destination | 추가 작업 |
|---|---|---|---|---|
| 25 | git mv | `engine/research/backtest.py` | `engine/research/ensemble/backtest.py` | |
| 26 | git mv | `engine/research/backtest_cache.py` | `engine/research/ensemble/backtest_cache.py` | |
| 27 | git mv | `engine/research/pattern_refinement.py` | `engine/research/ensemble/pattern_refinement.py` | |
| 28 | git mv | `engine/research/market_retrieval.py` | `engine/research/ensemble/market_retrieval.py` | |
| 29 | git mv | `engine/research/similarity_ranker.py` | `engine/research/ensemble/similarity_ranker.py` | |
| 30 | git mv | `engine/research/experiment.py` | `engine/research/ensemble/experiment.py` | |
| 31 | EDIT | `engine/research/ensemble/__init__.py` | (동일) | __all__ 업데이트 |

### Phase C-4: artifacts/ 구성

| # | 타입 | Source | Destination | 추가 작업 |
|---|---|---|---|---|
| 32 | MKDIR | — | `engine/research/artifacts/` | |
| 33 | git mv | `engine/research/finding_store.py` | `engine/research/artifacts/finding_store.py` | |
| 34 | git mv | `engine/research/blocked_candidate_store.py` | `engine/research/artifacts/blocked_candidate_store.py` | |
| 35 | git mv | `engine/research/blocked_patterns.py` | `engine/research/artifacts/blocked_patterns.py` | |
| 36 | git mv | `engine/research/autoresearch_ledger_store.py` | `engine/research/artifacts/autoresearch_ledger_store.py` | |
| 37 | git mv | `engine/research/signal_event_store.py` | `engine/research/artifacts/signal_event_store.py` | ⚠️ W-0370 머지 확인 후 |
| 38 | git mv | `engine/research/state_store.py` | `engine/research/artifacts/state_store.py` | |
| 39 | git mv | `engine/research/feature_catalog.py` | `engine/research/artifacts/feature_catalog.py` | |
| 40 | git mv | `engine/research/feature_windows.py` | `engine/research/artifacts/feature_windows.py` | |
| 41 | git mv | `engine/research/feature_windows_builder.py` | `engine/research/artifacts/feature_windows_builder.py` | |
| 42 | git mv | `engine/research/feature_windows_supabase.py` | `engine/research/artifacts/feature_windows_supabase.py` | |
| 43 | git mv | `engine/research/tracker.py` | `engine/research/artifacts/tracker.py` | |
| 44 | git mv | `engine/research/dlq_replay.py` | `engine/research/artifacts/dlq_replay.py` | |
| 45 | git mv | `engine/research/capture_benchmark.py` | `engine/research/artifacts/capture_benchmark.py` | |
| 46 | CREATE | — | `engine/research/artifacts/__init__.py` | 아래 내용 |

### Phase C-5: 나머지 파일 처리 (top-level 유지 또는 적절 위치)

이동 후 `engine/research/` top-level에 남는 파일 목록 확인:
```bash
ls engine/research/*.py | grep -v "__init__"
```
남는 파일 처리 결정 기준:
- 1개 이하 sub-package에서 import → 해당 sub-package로 이동
- 2개 이상에서 import → top-level 유지 + shim에 포함

### Phase C-6: backward-compat __init__.py shim

| # | 타입 | 파일 | 추가 작업 |
|---|---|---|---|
| 47 | EDIT | `engine/research/__init__.py` | 모든 이동 심볼에 re-export + DeprecationWarning |

---

### `engine/research/discovery/__init__.py` 내용

```python
"""research.discovery — 새 패턴 후보 발견 책임."""
from engine.research.discovery.orchestrator import run_cycle  # W-0379 canonical entrypoint
from engine.research.discovery.autoresearch_runner import run_once
from engine.research.discovery.discovery_agent import run_discovery_cycle
from engine.research.discovery.live_monitor import scan_universe_live, scan_all_patterns_live

__all__ = [
    "run_cycle",
    "run_once",
    "run_discovery_cycle",
    "scan_universe_live",
    "scan_all_patterns_live",
]
```

### `engine/research/artifacts/__init__.py` 내용

```python
"""research.artifacts — 저장소 I/O 책임. 비즈니스 로직 없음."""
from engine.research.artifacts.finding_store import FindingStore
from engine.research.artifacts.signal_event_store import SignalEventStore
from engine.research.artifacts.autoresearch_ledger_store import AutoresearchLedgerStore
from engine.research.artifacts.state_store import StateStore
from engine.research.artifacts.blocked_candidate_store import BlockedCandidateStore

__all__ = [
    "FindingStore",
    "SignalEventStore",
    "AutoresearchLedgerStore",
    "StateStore",
    "BlockedCandidateStore",
]
```

### `engine/research/__init__.py` shim 예시 (DeprecationWarning)

```python
"""engine.research — backward-compat shim. Use sub-packages directly."""
import warnings as _warnings

def __getattr__(name):
    _warnings.warn(
        f"Import 'engine.research.{name}' is deprecated. "
        f"Use engine.research.discovery.*, validation.*, ensemble.*, or artifacts.* directly.",
        DeprecationWarning, stacklevel=2,
    )
    # lazy import to sub-package
    _sub_map = {
        "autoresearch_loop": "engine.research.discovery.autoresearch_loop",
        "orchestrator": "engine.research.discovery.orchestrator",
        "run_once": "engine.research.discovery.autoresearch_runner",
        "finding_store": "engine.research.artifacts.finding_store",
        # ... 전체 매핑
    }
    if name in _sub_map:
        import importlib
        mod = importlib.import_module(_sub_map[name])
        return mod
    raise AttributeError(f"module 'engine.research' has no attribute {name!r}")
```

## Import Path Update Map (이동 후 수정 필요 파일)

```bash
# 이동 후 깨진 import 찾기 (각 이동 파일마다 실행)
grep -rn "from research\.autoresearch_loop\|from engine\.research\.autoresearch_loop" engine/ --include="*.py" | grep -v "__pycache__"
grep -rn "from research\.signal_event_store\|from engine\.research\.signal_event_store" engine/ --include="*.py" | grep -v "__pycache__"
# → 이 파일들의 import를 sub-package 경로로 수정
```

**주의**: shim이 DeprecationWarning + lazy import 제공하므로 즉시 수정 없어도 동작은 함.
그러나 scanner/, verification/, api/ 내 직접 import는 이번 PR에서 sub-package 경로로 수정.

## Component Split Spec (sub-package 분해)

### discovery/__init__.py public API
책임: 새 패턴 후보 발견만.
금지 import: `engine.research.validation`, `engine.research.artifacts` (단방향)

### validation/__init__.py public API
책임: 통계적 유효성 검증만.
금지 import: `engine.research.discovery`, `engine.research.ensemble`

### ensemble/__init__.py public API
책임: 기존 패턴 조합/백테스트만.
import 허용: `engine.research.validation` (검증 결과 참조), `engine.research.artifacts` (저장)
금지 import: `engine.research.discovery`

### artifacts/__init__.py public API
책임: 저장소 I/O만. 비즈니스 로직 없음.
금지 import: discovery, validation, ensemble (모두 금지)

## Verification Commands

```bash
# 1. collect-only (ImportError 0 확인)
cd engine && uv run pytest --collect-only -q 2>&1 | grep -E "ERROR|error" | wc -l
# → 0

# 2. 이동 파일 import 확인
uv run python -c "
from engine.research.discovery import run_cycle, run_once
from engine.research.validation.runner import run_full_validation
from engine.research.ensemble.backtest import run_pattern_backtest
from engine.research.artifacts import FindingStore, SignalEventStore
print('all imports OK')
"
# → all imports OK

# 3. top-level from engine.research 직접 count 확인 (≤ 12)
grep -rn "from engine\.research import\|from engine\.research\." engine/ --include="*.py" \
  | grep -v "__pycache__\|research/discovery\|research/validation\|research/ensemble\|research/artifacts" \
  | wc -l
# → ≤ 12

# 4. import-linter (validation-no-discovery, artifacts-no-business-logic 위반 0)
uv run lint-imports --config .importlinter
# → 0 violations

# 5. 전체 pytest pass
uv run pytest engine/tests/ -q --tb=short 2>&1 | tail -5
# → 0 failed

# 6. 삭제된 top-level 파일 import 없음
python tools/import_audit.py 2>&1
# → from engine.research (top-level) count ≤ 12
```

## Commit & PR

```bash
# git mv 완료 후
git add engine/research/
git commit -m "refactor(W-0386-C): research/ → discovery/validation/ensemble/artifacts 4-subpackage"

gh pr create \
  --title "[W-0386-C] research/ 4-subpackage 분해" \
  --body "## Changes
- engine/research/discovery/: autoresearch_loop, orchestrator, discovery_agent, event_tracker/, pattern_scan/, proposer/ 등 이동
- engine/research/validation/: ratchet, alpha_quality, eval_protocol 추가
- engine/research/ensemble/: backtest, market_retrieval, similarity_ranker 추가
- engine/research/artifacts/: finding_store, signal_event_store, state_store 등 신규
- engine/research/__init__.py: DeprecationWarning shim

## Verification
- [ ] pytest --collect-only ImportError 0
- [ ] 4 sub-package import 확인
- [ ] from engine.research (top-level) ≤ 12
- [ ] import-linter 0 violations
- [ ] pytest pass

Requires W-0370 merged (signal_event_store.py)
Part of #ISSUE_NUM"
```

## Exit Criteria (Phase C)

- [ ] AC-C1: `discovery / validation / ensemble / artifacts` 4 sub-packages 각자 `__init__.py` + `__all__` ≥ 5 심볼
- [ ] AC-C2: `pytest --collect-only` ImportError 0
- [ ] AC-C3: `from engine.research` (직접 top-level) count 45 → ≤ 12
- [ ] AC-C4: import-linter `artifacts-no-business-logic`, `validation-no-discovery` 위반 0
- [ ] AC-C5: 전체 pytest pass
- [ ] PR merged
