# Active File-Domain Locks (DEPRECATED — Phase 4에서 제거 예정)

> ⚠️ **이 표는 단계적 폐기 중**입니다 (W-0260, 2026-04-27 도입).
> 새로운 진실 출처는 다음 3축:
>
> 1. **GitHub Issue assignee** — primary mutex (CHARTER §Coordination)
> 2. **`state/worktrees.json`** — worktree 4축 registry SSOT (`tools/worktree-registry.sh`)
> 3. **`state/agents/A###.live.json`** — heartbeat 가시성 (`tools/live.sh`)
>
> `tools/claim.sh`는 이 파일에 lock 행을 계속 쓰지만, 동시에 worktree registry에도 매핑을 기록합니다.
> `tools/end.sh`는 종료 시 두 곳 모두 자동 정리합니다.
> 1시간 이상 stale인 행은 다른 에이전트가 직접 행을 삭제해도 됩니다 (조정 후).

| Agent | Domain | Branch | Started |
|---|---|---|---|
| A026 | .git/hooks/, tools/, .github/workflows/, work/active/W-0221-* | docs/agent8-session-20260426 | 11:42 |
