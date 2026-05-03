# W-1004 — 에이전트 격리 + 소유권 + 소통 프로토콜

> Wave: 7 | Priority: P0 | Effort: M
> Charter: In-Scope (운영 규율)
> Status: 🟡 Design Draft
> Created: 2026-05-04
> Issue: #1031

## Goal

각 에이전트가 자기 claim 파일만 수정·커밋·머지·푸쉬하고, 타 에이전트와는 inbox jsonl 비동기 메시지로만 통신하며, 위반 시 로컬 hook이 즉시 차단하는 강제 시스템.

## AI Researcher 진단 — 왜 지금 구조가 부족한가

LLM은 human developer와 근본적으로 다릅니다:

| 특성 | Human | LLM Agent |
|---|---|---|
| 상태 | 지속적 | context window = 전부 |
| 실패 감지 | 화면 보면 앎 | silent — 모르고 넘어감 |
| 소통 | 말로 즉시 | 다음 세션에 읽어야 함 |
| 범위 인식 | 암묵적으로 앎 | context에 없으면 0 |

**LLM의 3가지 고유 실패 모드**:
1. Context 부족으로 범위 이탈
2. Silent overwrite — 에이전트가 실패를 모름
3. 핸드오프 손실 — 다음 에이전트가 이전 상태를 알 수 없음

현재 `file-lock-check.sh`가 advisory인 이유는 기술 부채가 아니라 LLM이 경고를 읽고도 무시할 수 있기 때문. 해결책은 hook 레벨에서 물리적으로 차단.

## Scope

**신규 파일 8종**:
- `tools/own.sh` — claim/release/list/share CLI
- `tools/check-ownership.mjs` — pre-commit에서 호출, ownership 검증
- `tools/pr-merge-guard.sh` — gh pr merge wrapper, PR author 검증
- `tools/agent-message.sh` — send/read/list/mark-read CLI
- `state/file-ownership.jsonl` — append-only ownership claim log
- `state/agent-inbox/.gitkeep` — 개별 {agent}.jsonl 자동 생성 디렉토리
- `.claude/commands/메시지.md`
- `docs/runbooks/agent-isolation.md`

**수정 파일 4종**:
- `.githooks/pre-commit` — ownership check 추가
- `.githooks/pre-push` — branch ownership check
- `AGENTS.md` — §에이전트 격리 룰 1페이지 신설
- `tools/start.sh` / `tools/end.sh` — inbox 통합

## Non-Goals

- 실시간 통신 (LLM은 persistent process 아님 — 비동기로 충분)
- 중앙 orchestrator 데몬 (추가 실패 모드)
- GitHub server-side branch protection (org admin 권한 별도)
- 자동 ownership 선점 (file open 감지) — false positive 많음

## AI Researcher 관점

### 왜 ownership.jsonl이 필요한가

LLM의 context window는 세션마다 초기화됩니다. "내가 이 파일 작업 중"이라는 상태는 어딘가에 외부화되어야 합니다. Human developer가 IDE를 열면 파일이 잠기는 것처럼, LLM은 `own.sh claim`으로 외부화. 이게 없으면 두 에이전트가 같은 파일을 동시에 수정하고 있다는 사실을 둘 다 모릅니다.

### 왜 inbox가 필요한가

LLM 에이전트가 협업하는 유일한 방법은 다음 세션의 context에 정보를 주입하는 것입니다. 지금은 CURRENT.md 댓글로 하는데 — CURRENT.md는 전체 에이전트가 읽는 shared state라 노이즈가 됩니다. inbox는 특정 에이전트에게만 전달되는 directed signal. Token 관점에서도 inbox는 lazy read — 안 읽으면 0 token.

### 왜 pr-merge-guard가 필요한가

현재 `gh pr merge` 는 어떤 에이전트도 실행 가능합니다. LLM은 "이 PR이 내 것인지" 판단하는 신뢰할 수 있는 메커니즘이 context 안에 없습니다. wrapper가 `gh pr view --json author`로 확인하는 것이 유일한 강제점.

### 실패 모드 계층

```
Level 0 (지금): advisory 경고 → LLM이 무시 가능
Level 1 (PR1):  pre-commit 차단 → staged 시점 차단
Level 2 (PR2):  pre-push 차단 → push 시점 한 번 더
Level 3 (PR4):  CI post-merge audit → 사후 감지
```

### Statistical Validation Targets

- Ownership 충돌 false-positive ≤ 5%
- Ownership 충돌 false-negative ≤ 1%
- Inbox read latency P50 ≤ 1h, P95 ≤ 24h
- Override-owner 주당 2회 이상 = ownership 입자도 재검토 신호

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Hook bypass (--no-verify) | 중 | 고 | CI post-merge audit |
| Ownership TTL 만료 미정리 | 고 | 중 | TTL 24h + PR close 시 auto-release |
| jsonl 동시 append race | 중 | 중 | W-0274 CAS 패턴 재사용 |
| 합법적 cross-agent edit | 고 | 저 | --override-owner + 감사 로그 |
| inbox 메시지 폭주 | 저 | 중 | sender×receiver 시간당 5/일당 50 한도 |

### Codex 룰 매핑

| Codex 개념 | WTD 구현 |
|---|---|
| 3-level rules (allow/prompt/forbidden) | 본인=allow / 미claim=prompt / 타인=forbidden |
| AGENTS.md precedence | 1페이지 한도 + agents/coordination.md 상세 |
| Subagent 격리 | worktree-per-agent + ownership manifest |
| Verification 우선 | 각 PR AC + false-positive 5% 실측 |
| Token cost 인식 | inbox = lazy read (안 읽으면 0 token) |

## Decisions

- [D-7100] 소유권 강제는 pre-commit + pre-push hook 두 단계 / 거절: CI-only — 로컬 즉시 차단이 목적
- [D-7101] PR 머지 권한은 PR creator only, admin override 시 감사 / 거절: GitHub branch protection — admin 권한 필요
- [D-7102] Inter-agent 통신은 file-based inbox jsonl / 거절: Slack/webhook — 외부 의존, audit 어려움
- [D-7103] Ownership claim은 명시적 `own.sh claim` / 거절: 자동 선점 — false positive 많음
- [D-7104] Codex 3-level (allow/prompt/forbidden) 채택 / 거절: 2-level — prompt 중간층이 신규 파일 마찰 줄임

## Open Questions

- [ ] [Q-7100] rebase conflict 해결 시 cross-agent merge 케이스 → --admin + 감사로 충분한가?
- [ ] [Q-7101] inbox retention — 30일 후 `state/agent-inbox/_archive/`?
- [ ] [Q-7102] CURRENT.md Files 컬럼 vs ownership.jsonl — single source로 통합?

## PR 분해 계획

> 각 PR 독립 배포 가능. shell → data → audit 순서.

### PR 1 — Ownership Manifest + pre-commit gate (Effort: S)

**목적**: 자기 claim 파일만 commit 가능하게 강제
**검증 포인트**: 타인 소유 파일 staged → reject 동작 확인

**신규**:
- `state/file-ownership.jsonl`
- `tools/own.sh` — claim/release/list/share
- `tools/check-ownership.mjs`

**수정**: `.githooks/pre-commit` — ownership check 추가

**Exit Criteria**:
- [ ] AC1-1: 타인 소유 파일 staged → exit 1 + 명확한 메시지
- [ ] AC1-2: `--override-owner` → `state/ownership-overrides.jsonl` 기록 후 통과
- [ ] AC1-3: TTL 24h 자동 만료
- [ ] AC1-4: bash test 5케이스 PASS (own/release/conflict/expired/share)
- [ ] CI green

### PR 2 — pre-push branch gate + PR Merge Guard (Effort: S)

**목적**: 자기 branch만 push, 자기 PR만 merge
**검증 포인트**: 타인 PR merge 시도 → wrapper reject

**신규**: `tools/pr-merge-guard.sh`

**수정**:
- `.githooks/pre-push` — branch slug check
- `AGENTS.md` — `gh pr merge` 직접 호출 금지, wrapper 명시

**Exit Criteria**:
- [ ] AC2-1: PR author ≠ current agent → reject
- [ ] AC2-2: `--admin` 시 `state/merge-overrides.jsonl` 기록
- [ ] AC2-3: bash test 4케이스 PASS
- [ ] CI green

### PR 3 — Inter-agent Inbox (Effort: M)

**목적**: 비동기 directed 메시지 채널
**검증 포인트**: send → list → read, start.sh unread count, end.sh 미답 경고

**신규**:
- `state/agent-inbox/.gitkeep`
- `tools/agent-message.sh` — send/read/list/mark-read
- `.claude/commands/메시지.md`

**수정**:
- `tools/start.sh` — unread count 표시
- `tools/end.sh` — 미답 메시지 경고

**Exit Criteria**:
- [ ] AC3-1: send → 수신자 jsonl 즉시 append (CAS 적용)
- [ ] AC3-2: read → status=read + read_at 타임스탬프 (append)
- [ ] AC3-3: rate-limit 초과 시 reject
- [ ] AC3-4: bash test 6케이스 PASS
- [ ] CI green

### PR 4 — Audit + AGENTS.md 룰 페이지 (Effort: S)

**조건**: PR 1-3 머지 후 1주일 운영 데이터 수집

**신규**:
- `tools/audit-ownership.sh`
- `docs/runbooks/agent-isolation.md`

**수정**:
- `AGENTS.md` — §에이전트 격리 룰 1페이지
- `agents/coordination.md`

**Exit Criteria**:
- [ ] AC4-1: false-positive < 5% (실측)
- [ ] AC4-2: inbox read latency P50 < 1h (실측)
- [ ] AC4-3: CI post-merge audit job green

## 전체 Exit Criteria (Wave-level)

- [ ] 타인 소유 파일 commit/push/merge 시도 시 자동 차단 (3중)
- [ ] inbox 메시지 송수신, start/end 통합
- [ ] AGENTS.md §에이전트 격리 룰 1페이지
- [ ] false-positive < 5%, latency P50 < 1h (실측)
- [ ] CI green (App + Engine + Contract)
- [ ] CURRENT.md SHA 업데이트

## Handoff Checklist

- [ ] PR 1 → 2 → 3 순차 머지 (→ 1주 운영 → PR 4)
- [ ] 각 PR 머지 후 CURRENT.md SHA 업데이트
- [ ] PR 3 직후 all agents에게 "신규 룰 활성화" inbox 메시지
- [ ] state/file-ownership.jsonl, state/agent-inbox/.gitkeep git 추적 확인
