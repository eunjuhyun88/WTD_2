# W-0296 — 자동화 하네스 runbook (hook + cycle-smoke 정착)

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

## Owner

meta (문서화 — 코드 변경 없음)

## Non-Goals

- hook 로직 변경 없음 (이미 동작 중)
- cycle-smoke.py 변경 없음

## Canonical Files

- `docs/runbooks/cycle-smoke.md` (신규)
- `docs/runbooks/post-edit-hook.md` (신규)
- `AGENTS.md` (회귀 가드 섹션 추가)

## Facts

- `.claude/hooks/post-edit-pytest.sh` 존재, 실행권한 ✅
- `tools/cycle-smoke.py` 5 AC, 17/17 PASS ✅
- `.claude/settings.json` PostToolUse Write/Edit hook 설정됨 ✅

## Assumptions

- docs/runbooks/ 디렉토리 존재 (기존 20개 runbook 있음)
- AGENTS.md 추가 후 CI 통과 필요

## Open Questions

- [ ] [Q-0292-1] cycle-smoke를 CI에 추가할지? (현재 수동 실행만)

## Decisions

- **[D-0292-1]** runbook 위치: docs/runbooks/ (기존 패턴 일치). 거절: `.claude/docs/` — repo-level가 더 공유 가능.
- **[D-0292-2]** AGENTS.md 회귀 가드: ≤15L 간결 섹션. 거절: 별도 파일 — AGENTS.md가 primary entry point.

## Next Steps

완료됨 — 추가 구현 없음.

## Handoff Checklist

- [x] docs/runbooks/cycle-smoke.md ✅
- [x] docs/runbooks/post-edit-hook.md ✅
- [x] AGENTS.md 회귀 가드 섹션 ✅

## Exit Criteria

- [ ] AC1: `docs/runbooks/cycle-smoke.md` 존재, ≤80L
- [ ] AC2: `docs/runbooks/post-edit-hook.md` 존재, ≤80L
- [ ] AC3: `grep -n "회귀 가드" AGENTS.md` 결과 있음
- [ ] AC4: `cd engine && uv run python ../tools/cycle-smoke.py` 17/17 PASS (변경 없으니 회귀 없음)
