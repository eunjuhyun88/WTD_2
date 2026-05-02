# W-0386-A — Phase A: Boundary Audit

> Parent: W-0386 | Status: 🟡 Ready
> Pre-conditions: 없음
> Estimated files: 4개 | Estimated time: 1일

## 이 Phase가 하는 일

`import-linter`로 engine/ 내부 의존 경계를 CI에 강제하고, 현재 import 그래프(baseline)를 캡처한다.

## Pre-conditions Checklist

- [ ] `git status` clean (stash 또는 commit 상태)
- [ ] `cd engine && uv run pytest` pass (baseline 확인)
- [ ] 브랜치 생성: `git checkout -b feat/W-0386-A-boundary-audit`

## Setup Commands

```bash
# import-linter 설치 (pyproject.toml에 추가할 것)
cd engine
uv add --dev import-linter

# 현재 from engine.research import 수 baseline 캡처
grep -rn "from engine\.research" engine/ --include="*.py" | grep -v "__pycache__" | wc -l
# → 현재: 45 (이 숫자를 docs/architecture/import_graph_2026-05-02.md에 기록)

grep -rn "from engine\.research" engine/ --include="*.py" | grep -v "__pycache__" | awk -F: '{print $1}' | sort -u
# → 호출자 파일 목록 기록
```

## Operations Table (exact, ordered)

| # | 타입 | Source 경로 | Destination 경로 | 추가 작업 |
|---|---|---|---|---|
| 1 | CREATE | — | `engine/pyproject.toml` | `[tool.importlinter]` 섹션 추가 |
| 2 | CREATE | — | `engine/.importlinter` | 아래 규칙 내용 |
| 3 | CREATE | — | `tools/import_audit.py` | 아래 스크립트 내용 |
| 4 | CREATE | — | `docs/architecture/import_graph_2026-05-02.md` | baseline 수치 기록 |

### `.importlinter` 내용

```ini
[importlinter]
root_package = engine

[importlinter:contract:core-loop-no-scanner]
name = core_loop must not import scanner
type = forbidden
source_modules =
    engine.core_loop
forbidden_modules =
    engine.scanner

[importlinter:contract:scanner-no-research-direct]
name = scanner must not import research sub-modules directly (use ports)
type = forbidden
source_modules =
    engine.scanner
forbidden_modules =
    engine.research.autoresearch_loop
    engine.research.autoresearch_runner
    engine.research.orchestrator
    engine.research.discovery_agent

[importlinter:contract:artifacts-no-business-logic]
name = artifacts sub-package must not import discovery or ensemble
type = forbidden
source_modules =
    engine.research.artifacts
forbidden_modules =
    engine.research.discovery
    engine.research.ensemble

[importlinter:contract:validation-no-discovery]
name = validation must not import discovery
type = forbidden
source_modules =
    engine.research.validation
forbidden_modules =
    engine.research.discovery

[importlinter:contract:no-circular-research]
name = research sub-packages no circular import
type = layers
layers =
    engine.research.artifacts
    engine.research.validation
    engine.research.ensemble
    engine.research.discovery
independence = False

[importlinter:contract:pipeline-thin-facade]
name = pipeline.py must not import research internals directly
type = forbidden
source_modules =
    engine.pipeline
forbidden_modules =
    engine.research.autoresearch_loop
    engine.research.orchestrator
    engine.research.pattern_search
    engine.research.live_monitor
```

### `pyproject.toml` 추가 (기존 파일의 `[tool]` 섹션 아래)

```toml
[tool.importlinter]
root_package = "engine"
include_external_packages = true
```

### `tools/import_audit.py` 내용

```python
#!/usr/bin/env python3
"""Import coupling audit — run before and after W-0386 phases."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent / "engine"

def count_imports(pattern: str) -> list[str]:
    result = subprocess.run(
        ["grep", "-rn", pattern, str(ROOT), "--include=*.py"],
        capture_output=True, text=True
    )
    lines = [l for l in result.stdout.splitlines() if "__pycache__" not in l]
    return lines

def main():
    checks = [
        ("from engine.research", "engine.research hub imports"),
        ("from research.autoresearch_loop", "autoresearch_loop direct imports"),
        ("from research.orchestrator", "orchestrator direct imports"),
    ]
    for pattern, label in checks:
        hits = count_imports(pattern)
        print(f"{label}: {len(hits)}")
        for h in hits[:5]:
            print(f"  {h}")
        if len(hits) > 5:
            print(f"  ... ({len(hits) - 5} more)")
        print()

if __name__ == "__main__":
    main()
```

### `docs/architecture/import_graph_2026-05-02.md` 내용

```markdown
# Engine Import Graph — Baseline (2026-05-02)

## Coupling Counts (before W-0386)

| 패턴 | count |
|---|---|
| `from engine.research` (top-level) | 45 |
| `from engine.scanner` | (측정) |
| `from engine.ledger` | (측정) |

## Target (after W-0386-D)

| 패턴 | target |
|---|---|
| `from engine.research` (top-level, non-sub-pkg) | ≤ 12 |
| `from engine.research.discovery` | 자유 (서브패키지 내부) |
| `from engine.research.validation` | 자유 |

## 경쟁 진입점 (before W-0386)

17개+ — pipeline.py, scanner.realtime, scanner.jobs.{3개}, research.autoresearch_runner,
research.autoresearch_loop, research.orchestrator, research.discovery_agent,
research.live_monitor, research.pattern_search, research.pattern_scan.scanner,
research.event_tracker.detector, research.validation.{2개}, research.pattern_refinement,
research.backtest, research.market_retrieval
```

## Verification Commands

```bash
# 1. import-linter 실행 (현재 위반 목록 확인 — 이 단계에서는 위반 있어도 OK, baseline 기록용)
cd engine && uv run lint-imports --config .importlinter 2>&1 | tee /tmp/W-0386-A-linter-baseline.txt

# 2. import_audit.py 실행
uv run python tools/import_audit.py 2>&1 | tee /tmp/W-0386-A-audit-baseline.txt

# 3. 기존 테스트 여전히 통과
uv run pytest engine/tests/ -q --tb=short 2>&1 | tail -5
# → X passed, 0 failed

# 4. pyproject.toml syntax 확인
cd engine && uv run python -c "import tomllib; tomllib.load(open('pyproject.toml','rb'))"
# → 에러 없음
```

**주의**: 이 Phase에서 lint-imports 위반이 있어도 실패가 아님. 현재 baseline 기록이 목적.
CI gate는 Phase B부터 위반을 0으로 요구하는 새 계약으로 추가한다.

## Commit & PR

```bash
git add .importlinter engine/pyproject.toml tools/import_audit.py docs/architecture/
git commit -m "chore(W-0386-A): import-linter setup + boundary baseline audit"
gh pr create \
  --title "[W-0386-A] Boundary Audit — import-linter + baseline graph" \
  --body "## Changes
- .importlinter: 6 contract rules 등록
- pyproject.toml: import-linter dev dependency 추가
- tools/import_audit.py: coupling count 스크립트
- docs/architecture/import_graph_2026-05-02.md: baseline (from engine.research = 45)

## Verification
- [ ] uv run lint-imports 실행 및 baseline 기록
- [ ] import_audit.py 출력 문서화
- [ ] 기존 pytest pass"
```

## Exit Criteria (Phase A)

- [ ] AC-A1: `.importlinter` 6 contract rules 등록
- [ ] AC-A2: `tools/import_audit.py` 실행 → `from engine.research` baseline count 기록됨
- [ ] AC-A3: `docs/architecture/import_graph_2026-05-02.md` 수치 채워짐
- [ ] AC-A4: 기존 pytest 전부 통과 (행위 변경 0)
- [ ] PR merged
