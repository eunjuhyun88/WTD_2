# W-0263 — Lock System Unification (Phase 4)

**Owner**: TBD
**Status**: PRD (구현 전)
**Depends on**: W-0260 (registry SSOT), W-0261 (end 5축)
**Branch (예상)**: `feat/W-0263-lock-unify`

## Goal

4중 lock 시스템 → 단일. 진실 출처 1개로 노이즈 제거.

## Current 4 Systems

1. **GitHub Issue assignee** — primary mutex (CHARTER §Coordination)
2. **`state/worktrees.json`** — registry (W-0260에서 추가됨)
3. **`state/agents/A###.live.json`** — live.sh heartbeat
4. **`spec/CONTRACTS.md`** — legacy text lock (DEPRECATED)

## Decision

**최종 형태**:
- **(1) GitHub Issue assignee** = 진실 출처 (cross-machine)
- **(2) registry** = 로컬 캐시 + 다른 declared 메타데이터 (issue/work_item/status)
- **(3) heartbeat** = 가시성 only (실시간 누가 살아있나)
- **(4) CONTRACTS.md** = **완전 제거**

## Scope

### In-Scope

- `tools/claim.sh`에서 `spec/CONTRACTS.md` 행 추가 코드 제거
- `tools/end.sh`에서 `spec/CONTRACTS.md` 행 삭제 코드 제거
- `tools/start.sh` 헤더에서 "Active locks (legacy CONTRACTS.md — DEPRECATED)" 섹션 제거
- `spec/CONTRACTS.md` 자체를 archive로 이동 또는 stub로
- `tools/live.sh` 강화:
  - heartbeat 1h+ idle → 자동 표식 (state stale)
  - 24h+ idle → 자동 삭제 (auto-release)
- `tools/worktree-registry.sh sweep` 명령 신규 도입 + cron/post-merge hook 등록 (W-0260에서 분리)
- (이 항목은 #442 F-7 ②번 "worktree cron 매일 00:00 → 10개+ 경고"와 통합)
- `AGENTS.md` / `CLAUDE.md` "legacy locks" 모든 언급 제거

### Non-Goals

- registry를 git tracked로 (cross-machine 협업은 GitHub state로 충분)

## Exit Criteria

- [ ] `spec/CONTRACTS.md`가 archive 또는 stub
- [ ] `tools/claim.sh` — CONTRACTS.md 쓰기 코드 ❌
- [ ] `tools/end.sh` — CONTRACTS.md 삭제 코드 ❌
- [ ] `tools/start.sh` — "legacy locks" 섹션 ❌
- [ ] `tools/live.sh release-stale` 명령 추가 + post-merge hook에서 호출
- [ ] heartbeat 24h+ idle → 자동 release (테스트)
- [ ] 룰 문서 (AGENTS.md, CLAUDE.md) "legacy" 언급 모두 제거
- [ ] CI 통과 + smoke test (claim → end → 다른 agent claim 같은 issue) 정상

## Risks

| 위험 | 완화 |
|---|---|
| 다른 PR이 CONTRACTS.md 의존 | grep -r CONTRACTS.md 결과 확인 후 진행. 의존 0이어야. |
| 자동 release가 활성 agent 잘못 죽임 | heartbeat 임계값 24h (관대). 매뉴얼 release도 가능. |
| Issue assignee를 진실로 가정해도 race 가능 | gh CLI로 last-write-wins. 사용자 confirm flow 추가 가능. |

## CTO 점검표

| 영역 | 평가 |
|---|---|
| 성능 | 불필요한 sed/grep 호출 제거 → start.sh 5-10ms 단축 |
| 안정성 | 시스템 4개 → 1.5개 (registry + GitHub). 진실 drift 위험 ↓ |
| 보안 | 변화 없음 |
| 유지보수성 | **큰 향상** — 더 이상 "이 lock은 어느 시스템?" 안 물어봄 |
| Charter 부합 | §Coordination 명확화 — Issue assignee = 단일 mutex |
