# W-0292 — 자동화 하네스 runbook (hook + cycle-smoke 정착)

> Wave: 5 (Productivity) | Priority: P2 | Effort: XS (1시간)
> Charter: In-Scope (문서화 — 이미 빌드된 것)
> Status: 🟡 Design Approved
> Created: 2026-04-29
> Issue: #584

---

## Goal

이미 설치된 `post-edit-pytest.sh` hook + `tools/cycle-smoke.py`를 신규 에이전트가 즉시 활용 가능하도록 runbook 2개 + AGENTS.md 섹션 추가.

---

## 현재 상태 (실측)

| 파일 | 상태 | 기능 |
|---|---|---|
| `.claude/hooks/post-edit-pytest.sh` | ✅ 존재, 실행권한 | Write/Edit 시 engine test_*.py 자동 pytest, exit 2 = 모델에 결과 |
| `tools/cycle-smoke.py` | ✅ 존재 | 1사이클 5 AC 17/17 PASS 검증 |
| `.claude/settings.json` | ✅ 존재 | 49 allow + PostToolUse/Stop hooks |

runbook 없어서 신규 에이전트가 이 자산을 모르고 수동으로 pytest 실행.

---

## Scope

### A. docs/runbooks/cycle-smoke.md (신규, ≤80L)

내용:
- `tools/cycle-smoke.py` 목적 (5 AC 설명)
- 호출 방법: `cd engine && uv run python ../tools/cycle-smoke.py`
- 호출 시점: PR 머지 전, GAP 관련 코드 변경 후
- 실패 시 대응 (AC별 조치)

### B. docs/runbooks/post-edit-hook.md (신규, ≤80L)

내용:
- hook 동작 방식 (stdin JSON → file_path 파싱 → engine test_*.py 탐지)
- exit code 의미: 0=silent(pass), 2=모델에 결과 출력(fail)
- 트리거 조건: `*/engine/*` 경로 + `test_*.py` basename
- 비트리거 케이스 (app/, non-test 파일)
- hook 직접 테스트: `echo '{"inputs":{"file_path":"engine/tests/test_foo.py"}}' | bash .claude/hooks/post-edit-pytest.sh`

### C. AGENTS.md "회귀 가드" 섹션 (≤15L 추가)

```markdown
## 회귀 가드

| 도구 | 트리거 | 효과 |
|---|---|---|
| `.claude/hooks/post-edit-pytest.sh` | engine test_*.py Write/Edit | 자동 pytest, exit 2 = 실패 결과 모델 전달 |
| `tools/cycle-smoke.py` | PR 머지 전 수동 실행 | 1사이클 5 AC (GAP-A/B/C/D/E) 17/17 검증 |

cycle-smoke 실행: `cd engine && uv run python ../tools/cycle-smoke.py`
상세: docs/runbooks/cycle-smoke.md, docs/runbooks/post-edit-hook.md
```

---

## 파일 목록

| 파일 | 변경 유형 |
|---|---|
| `docs/runbooks/cycle-smoke.md` | 신규 (≤80L) |
| `docs/runbooks/post-edit-hook.md` | 신규 (≤80L) |
| `AGENTS.md` | 수정 (≤15L 추가) |

---

## Exit Criteria

- [ ] AC1: `docs/runbooks/cycle-smoke.md` 존재, ≤80L
- [ ] AC2: `docs/runbooks/post-edit-hook.md` 존재, ≤80L
- [ ] AC3: `grep -n "회귀 가드" AGENTS.md` 결과 있음
- [ ] AC4: `cd engine && uv run python ../tools/cycle-smoke.py` 17/17 PASS (변경 없으니 회귀 없음)
