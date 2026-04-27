# ADR-0005 — Worktree Registry SSOT + Auto-rename Branch Policy

**Date**: 2026-04-27
**Author**: A052 (CTO loop)
**Status**: Accepted
**Related**: W-0260, ADR-002 (app-engine boundary)

## Context

73개 worktree가 누적된 상태에서 진단해보니, agent OS의 마찰점이 4축 비동기에서 비롯됨:

- **worktree** (filesystem) — Claude Code SDK / codex CLI가 자동 생성한 무작위 이름
- **branch** (git) — `claude/*` `codex/*` 자동, 또는 `feat/{ID}` 수동
- **issue** (GitHub) — `gh issue assignee`가 primary mutex
- **work item** (markdown) — `work/active/W-NNNN-*.md`

이 4축이 서로를 모르고, 단일 진실 출처(SSOT)가 없어서 다음 증상 발생:

1. **stale worktree 누적** — `/end`가 worktree 폐기 표식 안 함 → 50+ 커밋 뒤처진 stale 누적
2. **이중 worktree 생성** — 룰이 "claude/* 금지"라 매번 새 worktree 만듦 → 더 많은 stale
3. **legacy lock 표류** — `spec/CONTRACTS.md` (deprecated) 행이 영원히 남음 (A026 케이스)
4. **재진입 시 매핑 망각** — 이 worktree가 어느 issue/work_item을 담당했는지 불투명
5. **start.sh 가드 모순** — 자동 sync 단계는 안전한데, 브랜치명 차단 단계가 무해한 worktree까지 차단

## Decision

### 1. `state/worktrees.json` 을 4축 SSOT로 격상

스키마 (각 entry):

```json
{
  "path": "...",         // PK (git worktree list 기준 정규화)
  "branch": "...",       // derived (auto)
  "head_sha": "...",     // derived
  "ahead": N,            // derived
  "behind": N,           // derived
  "modified": N,         // derived
  "exists": true,        // derived
  "agent_id": "A052",    // declared (start/claim)
  "issue": 442,          // declared (claim --issue)
  "work_item": "W-0260", // declared (claim --work-item or branch parse)
  "status": "active|done|stale|orphan",
  "claimed_at": "...",
  "last_active": "...",
  "notes": ""
}
```

`tools/refresh_state.sh`가 매 호출마다 derived 갱신, declared는 path 키로 보존(merge).

### 2. Auto-generated 브랜치명 허용 (rename으로 정상화)

`claude/*` `codex/*` `worktree-agent-*` 차단 ❌. 이유:
- Claude Code SDK가 자동 worktree 생성 → 강제 차단 시 매번 사용자가 별도 worktree를 만들어야 함 → 이중 생성 누적
- rename 1줄로 해결: `git branch -m feat/{ID}-{slug}`. worktree는 그대로 유지.
- pre-push hook은 정보 메시지만 표시 (block ❌).
- 진실 추적은 PR 본문 + worktree registry로 충분.

### 3. `/start`, `/claim`, `/end` 의 registry 자동 갱신

| 명령 | registry 작업 |
|---|---|
| `/start` (`tools/start.sh`) | `register --agent <NEXT_ID>` (auto). 헤더에 매핑 표시. |
| `/claim --issue N` (`tools/claim.sh`) | `register --issue N --work-item <branch에서 추출>` |
| `/end` (`tools/end.sh`) | `set status done` + branch push hint (PR 미생성 + 본인 commit 있으면) |

추가: `tools/worktree-registry.sh sweep`으로 24h+ idle → stale, 7d+ → 폐기 권장 표식.

### 4. `start.sh` 가드 합리화

- 브랜치명 차단 ❌ → 정보 메시지로 격하
- `AHEAD > 50 exit 1` 제거 → `AHEAD > 200` warning만
- 단계 1(`LOCAL_AHEAD=0` AND `DIRTY=0` → 자동 fast-forward)이 이미 안전망

### 5. `spec/CONTRACTS.md` 점진 폐기

DEPRECATED 표식. `claim.sh`/`end.sh`가 두 곳에 동시 갱신 (host 호환). Phase 4 PR (W-026X)에서 완전 제거.

## Alternatives Considered

| 대안 | 기각 이유 |
|---|---|
| **A. 브랜치명 차단 그대로 유지** | Claude Code SDK 자동 생성 현실과 충돌. 이중 worktree 누적의 직접 원인. |
| **B. registry를 git tracked로** | 충돌 위험 + jsonl과 같은 회귀. local SSOT + GitHub로 cross-machine 진실 분담이 안전. |
| **C. legacy CONTRACTS lock 즉시 제거** | 기존 claim/end flow 깨짐. 점진 폐기가 안전. Phase 4로 분리. |
| **D. registry 없이 `gh` CLI만 SSOT** | 매번 네트워크 호출 + offline 작동 불가. 로컬 캐시 필수. |

## Consequences

### Positive
- ✅ Claude Code/codex SDK 자동 worktree와 마찰 0
- ✅ 재진입 시 이 worktree가 어느 issue/work_item을 담당하는지 즉시 보임
- ✅ stale worktree 자동 감지 → 폐기 가시화
- ✅ 가드 약화의 안전망이 registry sweep으로 제공됨

### Negative
- ⚠️ `state/worktrees.json` 스키마가 v1 → v2로 변경 (path 키 단일, declared 필드 7개 추가)
  - **mitigation**: refresh_state.sh가 이전 array 형식 자동 마이그레이션
- ⚠️ legacy `spec/CONTRACTS.md` 행이 한동안 공존
  - **mitigation**: claim.sh가 두 곳 동시 갱신. 사용자는 새 시스템(registry)만 보면 됨.

## Follow-ups (별도 PR)

- **Phase 2 (W-026X)**: `/end`가 work item md 자동 이동 (active → completed) + PR 자동 생성 옵션
- **Phase 3 (W-026X)**: `/start` 재진입성 — 이 worktree의 마지막 진행 자동 요약 + 재진입/신규 분기
- **Phase 4 (W-026X)**: legacy CONTRACTS lock 완전 제거 + heartbeat stale 자동 release

## References

- `tools/worktree-registry.sh` — registry CRUD
- `tools/refresh_state.sh` — derived/declared merge
- `tools/start.sh` — auto-register on entry
- `tools/end.sh` — status=done + push hint
- `tools/claim.sh` — issue/work_item mapping
- `.githooks/pre-push` — warning only
- `CLAUDE.md` §Worktree Registry, §Branch Naming
- `AGENTS.md` §Worktree Registry (SSOT)
- `spec/CONTRACTS.md` — DEPRECATED 표식
