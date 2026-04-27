# W-0260 — Worktree Registry SSOT + Auto-rename Branch Policy (Phase 0+1)

**Owner**: A052 (CTO loop)
**Status**: In Progress (PR open)
**Decision**: ADR-0005
**Branch**: `feat/W-0260-agent-os-registry-overhaul`

## Goal

Agent OS의 4축(worktree / branch / issue / work_item)을 단일 진실 출처(`state/worktrees.json`)로 묶고, Claude Code SDK / codex CLI의 자동 worktree 생성과의 마찰을 제거한다.

## Scope

### In-Scope (이번 PR)

1. `state/worktrees.json` 스키마 v2 (declared + derived 필드 통합)
2. `tools/refresh_state.sh` — declared 보존 + derived 갱신 merge
3. `tools/worktree-registry.sh` (new) — register/set/get/list/remove CLI (sweep은 W-0263 Phase 4에서 도입, Charter §Frozen 250줄 한도 준수)
4. `tools/start.sh` — 자동 register, 헤더에 매핑 표시, 가드 합리화
5. `tools/end.sh` — `status=done` 표식 + branch push hint
6. `tools/claim.sh` — registry에 issue/work_item 매핑
7. `.githooks/pre-push` — warning only (block ❌)
8. 룰 개편: `AGENTS.md`, `CLAUDE.md` §Worktree Registry, §Branch Naming
9. `spec/CONTRACTS.md` — DEPRECATED 표식
10. `docs/decisions/0005-worktree-registry-ssot-2026-04-27.md`

### Non-Goals (이번 PR 외 — 별도 W-026X로 분리)

- `/end`가 work item md 자동 이동 (active → completed) — **Phase 2**
- PR 자동 생성 옵션 (`/end --pr`) — Phase 2
- `/start` 재진입 모드 (이 worktree의 마지막 진행 자동 요약) — **Phase 3**
- legacy CONTRACTS lock 완전 제거 — **Phase 4**
- heartbeat stale 자동 release (1h+) — Phase 4
- `tools/worktree-registry.sh sweep` cron 등록 — Phase 4

## Exit Criteria

- [ ] `tools/refresh_state.sh` 호출 후 `state/worktrees.json`에 declared + derived 필드 모두 존재
- [ ] `tools/worktree-registry.sh register/set/get/list/remove` 5개 명령 정상 동작 (sweep은 W-0263)
- [ ] `./tools/start.sh` — `claude/*` `codex/*` 브랜치에서 차단 없이 부팅 + registry 자동 등록
- [ ] `./tools/start.sh` 헤더에 "This worktree (registry):" 섹션 출력 (agent/issue/work_item/status)
- [ ] `./tools/end.sh` — `status=done` 갱신 + 본인 commit 있고 PR 없으면 push hint 출력
- [ ] `./tools/claim.sh "..." --issue N` — registry에 `issue=N` 매핑 + branch에서 W-NNNN 추출 시 work_item 매핑
- [ ] `git push` (claude/* 브랜치) — pre-push hook은 warning만, 차단 ❌
- [ ] `AGENTS.md` / `CLAUDE.md` / `spec/CONTRACTS.md` 룰 갱신 반영
- [ ] `docs/decisions/0005-...md` 결정 기록 존재
- [ ] PR CI 통과

## Facts

- 현재 73개 worktree (`state/worktrees.json` 자동생성본 기준)
- 73개 중 `claude/*` `codex/*` `worktree-agent-*` 자동생성 ≈ 50%+
- 절반 이상이 stale 추정 (ahead 1-19, modified 0-422)
- A026의 legacy lock이 11:42부터 4시간+ stale로 남아있음

## Assumptions

- macOS의 case-insensitive FS에서 path 정규화는 inode 기반 매칭으로 처리 (registry가 `git worktree list`의 path를 keyset으로 사용)
- `gh` CLI 인증은 옵션 (없으면 graceful skip)
- multi-machine 협업은 GitHub state(issue/PR)로 충분 — 로컬 registry는 머신별 캐시

## Canonical Files

- `tools/worktree-registry.sh` — registry CLI
- `tools/refresh_state.sh` — derived/declared merge
- `state/worktrees.json` — gitignored, 머신 로컬 SSOT
- `docs/decisions/0005-worktree-registry-ssot-2026-04-27.md` — 결정 근거

## Tests (smoke)

```bash
# 1. refresh state — schema v2 확인
./tools/refresh_state.sh
jq 'first | keys' state/worktrees.json
# expected: 14개 키 (declared 7 + derived 7)

# 2. registry CRUD
./tools/worktree-registry.sh register --agent A052 --work-item W-0260
./tools/worktree-registry.sh get | jq '.work_item'
# expected: "W-0260"
./tools/worktree-registry.sh list --mine
./tools/worktree-registry.sh sweep

# 3. start.sh — claude/* 브랜치에서 차단 없이 부팅
git branch -m feat/W-0260-agent-os-registry-overhaul claude/test-restore
./tools/start.sh                 # 차단 없이 부팅 + 정보 메시지만
git branch -m claude/test-restore feat/W-0260-agent-os-registry-overhaul

# 4. end.sh — status=done + push hint (있다면)
./tools/end.sh "PR #X" "next" "lesson"
./tools/worktree-registry.sh get | jq '.status'
# expected: "done"
```

## CTO 점검표

| 영역 | 평가 |
|---|---|
| **성능** | jq merge O(N×M) — 73 worktree × 1 path 비교 = 즉시. atomic write `mv` 안전. |
| **안정성** | declared 보존 로직이 핵심. derived 갱신은 매번 git에서 fresh. orphan은 폐기 표식 후 사용자 결정. |
| **보안** | 새 권한 영역 ❌. local file write만. shell injection 가능 영역(register $value)은 jq `--arg`로 escape. |
| **유지보수성** | 단일 SSOT 도입 → 다른 시스템(legacy CONTRACTS)을 점진 제거 가능. |
| **Charter 부합** | CHARTER §Coordination = "GitHub Issue assignee primary mutex" 유지. registry는 보조 캐시. |

## Risks

| 위험 | 완화 |
|---|---|
| `state/worktrees.json` 스키마 변경으로 다른 도구 깨짐 | grep 결과: 이 파일 reader는 `tools/refresh_state.sh` 자기 자신뿐. BC 위험 ❌ |
| 동시 multi-agent registry 쓰기 race | atomic `mv` (POSIX). race 창은 ms 단위. 중요 데이터 손실 위험 낮음. flock는 후속 PR. |
| Legacy CONTRACTS와 registry 간 drift | claim.sh/end.sh가 두 곳 동시 갱신. Phase 4에서 legacy 제거. |
