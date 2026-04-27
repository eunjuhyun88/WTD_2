# W-0222 — Multi-Agent Coordination via GitHub Issues

## Goal

병렬 에이전트가 같은 작업을 동시에 개발하는 충돌을 GitHub native 기능(Issue + assignee)을 mutex로 사용해 차단. 신규 OS/dispatcher 빌드 없이 기존 도구 사용으로 charter `Multi-Agent OS expansion frozen` 정책 준수.

## Owner

contract

## Primary Change Type

Process / coordination change (코드 영향 최소)

## Background

**관찰된 운영 사고 패턴**:
1. `inc-2026-04-25-current-md-만성-stale-*` — CURRENT.md 만성 stale, 7개 PR 누락
2. `inc-2026-04-26-stale-current-md-migration-misfire` — 같은 패턴 24h 재발, PR #360 rollback
3. PR #354 `tools/end.sh` silent unknown — A009-A016 8 에이전트 jsonl 손실
4. `spec/CONTRACTS.md` advisory lock — claim.sh 안 부르면 그만

**근본 원인**: 모든 coordination state가 git tree 안에 있음
- `state/current_agent.txt` worktree-local — 다른 worktree에선 안 보임
- `spec/CONTRACTS.md` 커밋 파일 — 두 에이전트 동시 claim 자체가 머지 충돌
- voluntary protocol — 관습 어기면 사고

**필요한 것**: git 외부의 중앙 상태 — 모든 에이전트가 실시간 fetch 가능

**해답**: GitHub Issue + assignee = 이미 존재하는 mutex
- GitHub 서버에 살아있음 (worktree 무관)
- assignee field = 자연스러운 단일 lock
- `gh issue list --state open` = 1초 내 글로벌 진실
- 신규 인프라 0, 비용 0
- charter `agent dispatcher 빌드 금지`와 무관 (도구 빌드 아님, 도구 사용)

## Scope

### 1. Charter clarification (`spec/CHARTER.md`)

새 섹션 `## 🤝 Coordination`:
- GitHub native (Issue + assignee + Project) 사용 = ✅ 허용 (도구 사용)
- 자체 dispatcher / handoff OS 신규 빌드 = ❌ frozen (도구 빌드)
- 기존 `tools/start.sh`, `tools/claim.sh` 등 인프라 안정화 = ✅ 허용 (case-by-case)

### 2. Runbook (`docs/runbooks/multi-agent-coordination.md`)

1-page protocol:
- 부팅: `gh issue list --state open --json number,title,assignees`로 누가 뭐하나 확인
- claim: `gh issue edit N --add-assignee @me`로 mutex 획득
- branch: `feat/issue-N-slug` naming convention
- PR: body에 `Closes #N`
- 종료: Issue close = lock 자동 해제

### 3. Tool 통합

- `tools/start.sh`: `gh issue list --assignee "*" --state open` 한 줄 추가 (boot 시 누가 뭐하나 즉시 표시)
- `tools/claim.sh`: file-domain claim 전에 Issue assignee 확인 단계 추가 (Issue 없으면 계속 작동, 있으면 본인 assigned 검증)

### 4. CONTRACTS.md 전환 안내

`spec/CONTRACTS.md` 상단에 deprecation 헤더 추가:
- 신규 작업: GitHub Issue assignee 사용
- 기존 file-domain lock: 호환성 위해 한시적 유지
- 향후 작업이 모두 Issue 기반 전환되면 폐기

## Non-Goals (Phase 1 제외)

- 9 NOT BUILT 이슈를 GitHub Issues로 일괄 등록 (별도 W-0222 후속)
- Project board 도입 (Phase 2 — assignee mutex만으로 충분)
- pre-commit hook enforcement (Phase 3 — 운영 데이터 보고 결정)
- spec/CONTRACTS.md 즉시 폐기 (전환 기간 두고 organic)
- tools/end.sh 변경 (Issue close는 사용자가 PR 머지로 자동, 별도 자동화 불필요)

## Canonical Files

- `work/active/W-0222-coordination-via-github-issues.md` (this)
- `spec/CHARTER.md` — Coordination 섹션 추가
- `spec/CONTRACTS.md` — deprecation 헤더
- `docs/runbooks/multi-agent-coordination.md` (NEW)
- `tools/start.sh` — gh issue 통합
- `tools/claim.sh` — Issue assignee 검증 추가

## Facts

1. PR #350 (W-0215 ledger backfill) 이미 main 머지. PRIORITIES.md P0 갱신 별개 작업.
2. PR #346 (W-0145 search corpus) 이미 main 머지. CURRENT.md 갱신 별개 작업.
3. PR #356 (W-0220 PRD v2.2) open 상태. 본 PR은 PR #356과 파일 충돌 없음 (다른 파일군).
4. `gh` CLI 인증 OK, project scope 보유 (사용자가 refresh 완료).
5. Repo `eunjuhyun88/WTD_2` (private personal). Issue 무료, 무제한.

## Assumptions

1. PR #356이 본 PR 이전에 또는 이후에 머지돼도 충돌 없음 (파일 disjoint)
2. 모든 에이전트가 `gh` CLI 사용 가능 (Codex sandbox 포함 — 검증 필요)
3. Issue assignee는 단일 사용자 계정 사용 (eunjuhyun88) — 멀티유저는 Phase 4

## Open Questions

1. Codex sandbox에서 `gh issue list` 작동? — `tools/start.sh`에서 graceful fallback 필요
2. `gh issue edit --add-assignee` 시 본인이 다른 issue assigned 상태면 multi-assign 허용? — 정책 결정 필요
3. PR auto-link `Closes #N` 만으로 issue close 충분? — 또는 PR template 강제 필요?

## Decisions

- D1: Charter는 PR이지만 1줄 명시로 충분 (전면 재작성 X)
- D2: CONTRACTS.md는 즉시 폐기 X, deprecation 헤더만
- D3: tools/start.sh는 `gh issue list` 추가만, 기존 로직 보존
- D4: tools/claim.sh는 `gh issue edit --add-assignee @me` 옵션 추가, file-domain claim 그대로 유지
- D5: 9 NOT BUILT 이슈 일괄 등록은 W-0222 후속 (PR #356 머지 의존)

## Next Steps

1. ✅ W-0222 work item 작성 (this file)
2. `spec/CHARTER.md` Coordination 섹션 추가
3. `docs/runbooks/multi-agent-coordination.md` 작성
4. `spec/CONTRACTS.md` deprecation 헤더 추가
5. `tools/start.sh` gh issue 표시 추가
6. `tools/claim.sh` Issue assignee 통합 (optional 모드)
7. Commit + PR 오픈
8. PR 머지 후 — 사용자가 직접 W-0222 후속 (9 NOT BUILT 이슈 등록) 결정

## Exit Criteria

- [ ] CHARTER.md `## 🤝 Coordination` 섹션 머지됨
- [ ] runbook 1-page 작성됨
- [ ] CONTRACTS.md deprecation 헤더 노출됨
- [ ] start.sh가 `gh issue list` 결과 표시 (gh 미인증 시 graceful fallback)
- [ ] claim.sh가 `--issue N` 옵션으로 assignee 자동 설정 가능
- [ ] PR 머지 + main SHA 갱신
- [ ] memkraft `mk.log_event` 기록

## Handoff Checklist

다음 에이전트가 이어받을 때:
- 본 PR 머지 후 Issue 기반 작업 가능
- W-0222 후속: 9 NOT BUILT 이슈를 GitHub Issues로 등록 + 도메인별 assignee 분배
- Phase 2 후속: Project board 도입 (선택)
- Phase 3 후속: pre-commit hook enforcement (운영 데이터 보고)
