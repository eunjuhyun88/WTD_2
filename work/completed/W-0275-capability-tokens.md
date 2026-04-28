# W-0275 — Capability Tokens (Phase 5)

> Wave: Meta / Tooling | Priority: **P1** | Effort: M
> Charter: ✅ governance / runbook (In-Scope)
> Status: 🟡 Design Draft (사용자 검토 대기)
> Parent: W-0270 §Pillar 3
> Created: 2026-04-28 by Agent A070
> Depends on: W-0271 (Event Store) ✅, W-0274 (Optimistic Concurrency) ✅

## Goal (1줄)

work item 단위로 scoped capability token을 발급해 sub-agent가 필요한 최소 권한만 갖도록 강제한다 — 현재 `settings.json` allowlist는 전체 에이전트에 적용되는 coarse-grained 권한이라 scope creep 차단 불가.

## Scope

### 포함
- `tools/capability-issuer.mjs` — work item별 capability token JSON 발급/검증/취소
- `state/capabilities.json` — 활성 token registry (발급/만료/취소 상태)
- `.claude/agents/worker-with-capability.md` — token-aware sub-agent 정의 예시
- token 유효성을 `tools/start.sh` 부트 시점에 확인하는 guard hook

### 파일/모듈
- `tools/capability-issuer.mjs` (신규)
- `state/capabilities.json` (런타임 생성)
- `.claude/agents/worker-with-capability.md` (신규 예시)
- `tools/start.sh` — token guard 2줄 추가 (기존 파일 최소 수정)

### Token 구조
```json
{
  "token_id": "cap_<ulid>",
  "work_item": "W-####",
  "agent_id": "A###",
  "issued_at": "ISO",
  "expires_at": "ISO",
  "nonce": "<hex8>",
  "scope": {
    "allowed_tools": ["Bash", "Edit", "Write", "Read", "Glob", "Grep"],
    "allowed_paths": ["engine/validation/", "app/src/components/"],
    "allowed_commands": ["git commit", "git push", "pytest"],
    "forbidden_paths": ["spec/CHARTER.md", "engine/core/"]
  },
  "status": "active | expired | revoked",
  "revoked_at": null,
  "revoke_reason": null
}
```

## Non-Goals

- ❌ 런타임 tool 호출 인터셉트 — Claude Code SDK가 지원하지 않음; token은 audit + pre-commit guard 수준
- ❌ 암호화 서명 (JWT 수준) — 로컬 dev 환경, over-engineering; nonce + revocation list로 충분
- ❌ 사용자 대면 권한 UI — 에이전트 내부 메커니즘
- ❌ settings.json 자동 수정 — 별도 `.claude/agents/` 정의와 직교

## CTO 관점 (Engineering)

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| token replay attack (만료 token 재사용) | 낮 | 중 | monotonic nonce + `revoked_at` check |
| 발급 없이 start.sh 실행 → guard 차단 | 중 | 중 | guard는 warning-only (soft mode); hard mode는 opt-in |
| token 과발급으로 revocation list 비대 | 낮 | 낮 | 7d TTL + cleanup cron (W-0263 Phase 4에서 sweep) |
| GitHub Issue mutex와 scope 충돌 | 낮 | 중 | token scope ⊆ work_item scope; mutex 해제 시 token revoke |

### Dependencies

- 선행: W-0271 Event Store ✅ — token 발급/취소 이벤트를 event store에 기록
- 선행: W-0274 Conflict Detector ✅ — `allowed_paths`는 conflict-detector claim과 동기화
- 차단: W-0278 통합 (token guard가 7-pillar 공통 entry point)

### Rollback Plan

- `state/capabilities.json` 삭제 → token guard skip (soft degradation)
- `.claude/agents/worker-with-capability.md` 미사용 → 기존 agent 정의 그대로 동작

### Files Touched (예상)

- `tools/capability-issuer.mjs` — 신규 ~300줄
- `state/capabilities.json` — 런타임 생성 (gitignore 대상 아님 — audit trail)
- `.claude/agents/worker-with-capability.md` — 신규 ~50줄
- `tools/start.sh` — +5줄 (token guard, soft mode)

## AI Researcher 관점 (Data/Model)

### Data Impact

- 스키마 변경 없음 (state/ JSON은 agent infra, product DB와 무관)
- token audit log가 event store에 기록됨 → `agent action trace coverage` KPI 개선

### Statistical Validation

- KPI: `capability scope creep` = 0 (W-0270 §KPI 목표)
- 측정: audit log에서 `allowed_paths` 밖 Edit/Write 이벤트 수 카운트

### Failure Modes

1. **Token 발급 없이 작업 시작**: soft guard → warning만, 작업 차단 안 함 (phase 1 soft rollout)
2. **Scope too narrow**: 실제 필요 path가 `allowed_paths` 밖 → agent 멈춤; 발급자가 scope 재정의

## Decisions

- [D1] Token scope = work_item 단위 (agent ID 단위 ✗ — work item state machine과 mismatch)
- [D2] Guard mode = soft (warning-only); hard mode는 W-0278 통합 후 opt-in
- [D3] 암호화 서명 생략 — nonce + revocation list로 로컬 환경에 충분 (JWT ✗ over-engineering)
- [D4] `expires_at` default = 발급 후 8h (1 세션); 연장 가능

## Open Questions

- [ ] [Q1] allowed_paths를 work item 설계문서에서 자동 추출할 수 있을까? (§Files Touched 파싱)
- [ ] [Q2] hard mode 전환 시 `settings.json` allowlist와 어떻게 병행할 것인가?

## Implementation Plan

1. `tools/capability-issuer.mjs` — `issue / revoke / check / list` CLI
2. `state/capabilities.json` — token registry CRUD
3. `.claude/agents/worker-with-capability.md` — 예시 agent 정의
4. `tools/start.sh` — token guard guard hook (soft)
5. smoke test: issue → check → revoke → check(revoked) = fail

## Exit Criteria

- [ ] AC1: `capability-issuer.mjs issue --work-item W-#### --agent A### --scope '{...}'` → token JSON
- [ ] AC2: `capability-issuer.mjs check <token_id>` → valid/expired/revoked
- [ ] AC3: `capability-issuer.mjs revoke <token_id>` → revoked + event store 기록
- [ ] AC4: `start.sh` token guard 동작 (soft: warning 출력)
- [ ] AC5: smoke test end-to-end

## References

- Parent: W-0270 §Pillar 3
- Dennis J., Van Horn E. (1966). Programming Semantics for Multiprogrammed Computations. CACM.
- Mark Miller et al. Capability Myths Demolished (2003)
- 선행: W-0271 (#504), W-0274 (#515)
