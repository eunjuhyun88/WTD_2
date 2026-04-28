# Runbook: post-edit-pytest hook

## 목적

`engine/` 아래 `test_*.py` 파일을 Write 또는 Edit할 때 pytest를 자동 실행한다. 실패 시 exit 2로 결과를 모델에 즉시 전달해 다음 편집 전에 오류를 인지하게 한다.

## 위치

- Hook 스크립트: `.claude/hooks/post-edit-pytest.sh`
- Hook 설정: `.claude/settings.json` → `PostToolUse[Write|Edit]`

## 동작 방식

```
Write/Edit tool 호출
        ↓
stdin으로 JSON 수신: { "inputs": { "file_path": "..." } }
        ↓
file_path 파싱 → 조건 체크:
  1. */engine/* 경로인가?
  2. basename이 test_*.py인가?
        ↓ (둘 다 true일 때만)
engine root (pyproject.toml 위치) 탐색 (최대 5단계 상위)
        ↓
uv run pytest <rel_path> -q --tb=short
        ↓
exit 0 (PASS) → silent
exit 2 (FAIL) → stderr를 모델에 표시 (Claude가 오류 인지)
```

## exit code 의미

| exit | 의미 | 모델 동작 |
|---|---|---|
| 0 | 통과 또는 비대상 파일 | 아무 표시 없음 |
| 2 | pytest 실패 | stderr 결과 표시 → 다음 편집 전 오류 인지 |

## 트리거 조건

```
트리거 O: engine/tests/test_ledger.py
트리거 O: engine/research/validation/test_runner.py
트리거 X: engine/ledger/store.py (test_ 아님)
트리거 X: app/src/routes/patterns/+page.svelte (engine/ 아님)
트리거 X: tools/cycle-smoke.py (engine/ 아님)
```

## 직접 테스트

```bash
# 성공 케이스 시뮬레이션
echo '{"inputs":{"file_path":"/path/to/engine/tests/test_ledger.py"}}' \
  | bash .claude/hooks/post-edit-pytest.sh
echo "exit: $?"

# 비대상 파일 (exit 0 silent)
echo '{"inputs":{"file_path":"/path/to/app/src/lib/store.ts"}}' \
  | bash .claude/hooks/post-edit-pytest.sh
echo "exit: $?"
```

## 주의사항

- timeout=60s — 무거운 통합 테스트는 timeout 도달 후 exit 0 (silent)
- hook은 전체 test suite가 아닌 편집된 파일 1개만 실행 (빠름)
- 전체 suite: `cd engine && uv run pytest -q`

## 관련 runbook

- `docs/runbooks/cycle-smoke.md` — 1사이클 전체 회귀 검증
