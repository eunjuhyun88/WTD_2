# memory/long-term/ — Claude Code Long-Term Memory Backup

이 디렉토리는 `~/.claude/projects/-Users-ej-Projects-wtd-v2/memory/` 의 git-tracked 백업이다.

## 목적

Claude Code 데스크톱앱을 지우거나 머신을 옮길 때 long-term memory(세션 기록, feedback rule, project context)가 사라지는 것을 방지한다.

## 동기화 방향

**Source of truth**: `~/.claude/projects/-Users-ej-Projects-wtd-v2/memory/` (live, 자동 갱신)
**Backup**: 이 디렉토리 (수동 sync, PR 단위)

Live memory가 자동 갱신되므로 이 백업은 항상 stale일 수 있다. 정기적 sync PR로 따라잡는다.

## 복원 방법

새 머신/앱 재설치 후:

```bash
mkdir -p ~/.claude/projects/-Users-ej-Projects-wtd-v2
cp -r memory/long-term/ ~/.claude/projects/-Users-ej-Projects-wtd-v2/memory/
# MEMORY.md 가 인덱스 — Claude Code가 자동 읽음
```

## 갱신 방법

세션 종료 후 큰 변경이 있으면:

```bash
rsync -a --delete \
  ~/.claude/projects/-Users-ej-Projects-wtd-v2/memory/ \
  memory/long-term/
git add memory/long-term/
git commit -m "chore(memory): sync long-term memory backup"
```

## 파일 분류

- `MEMORY.md` — 인덱스 (Claude Code가 매 세션 시작 시 자동 로드)
- `project_*.md` — 프로젝트 세션 기록 (PR/main SHA/lesson)
- `feedback_*.md` — 사용자 피드백 룰 (행동 가이드)
- `reference_*.md` — 외부 시스템 포인터
- `session_*.md` — 작업 체크포인트
- `audit_*.md`, `worktree_*.md`, `modified_*.md` — 기타 컨텍스트

## 주의

- live memory와 이 백업이 다를 수 있다 (sync 시점 차이)
- 충돌 시 live memory 우선, 그 후 이 백업으로 sync
- 이 디렉토리는 repo memory/ 시스템(`decisions/`, `sessions/`, `incidents/`)과 별개
