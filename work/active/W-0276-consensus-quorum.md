# W-0276 — Consensus / Quorum (Phase 6)

> Wave: Meta / Tooling | Priority: **P1** | Effort: M
> Charter: ✅ governance / runbook (In-Scope)
> Status: 🟡 Design Draft (사용자 검토 대기)
> Parent: W-0270 §Pillar 7
> Created: 2026-04-28 by Agent A070
> Depends on: W-0271 (Event Store) ✅, W-0272 (Tracing) ✅

## Goal (1줄)

`/검증` 슬래시 커맨드의 결과를 단일 에이전트 의존에서 벗어나 **N of M quorum**으로 결정해, 1개 에이전트의 오판이 설계 승인 또는 PR 머지로 직결되는 리스크를 제거한다.

## Scope

### 포함
- `tools/quorum-validator.mjs` — 복수 에이전트의 `/검증` 결과 집계 → 다수결 판정
- `state/quorum-sessions.json` — 진행 중인 quorum 세션 상태
- `/검증` 슬래시 커맨드 — quorum 모드 opt-in 플래그 추가 (기존 단독 모드 유지)
- Quorum 결과를 event store에 기록 (trace_id 포함)

### 적용 범위 (한정)

**적용**: `/검증 --quorum` 호출 시만  
**비적용**: 일반 코드 작업, commit, PR 생성, 파일 편집 — quorum이면 모든 결정이 느려짐 (F3 falsifiable 기준)

### Quorum 세션 구조
```json
{
  "session_id": "qrm_<ulid>",
  "trace_id": "trc_<ulid>",
  "subject": "W-#### design | PR #NNN",
  "threshold": { "n": 2, "of": 3 },
  "votes": [
    { "agent_id": "A041", "vote": "PASS", "reason": "...", "ts": "ISO" },
    { "agent_id": "A042", "vote": "PASS", "reason": "...", "ts": "ISO" }
  ],
  "status": "open | decided | timeout",
  "decision": "PASS | FAIL | TIMEOUT",
  "decided_at": null
}
```

### 파일/모듈
- `tools/quorum-validator.mjs` (신규 ~250줄)
- `state/quorum-sessions.json` (런타임 생성)
- `.claude/commands/검증.md` — `--quorum` 플래그 추가 (~5줄 수정)

## Non-Goals

- ❌ 모든 결정에 quorum 적용 — 1인 사용자 환경에서 over-engineering (D3)
- ❌ Raft 리더 선출 — 에이전트 수 < 10, 불필요
- ❌ Byzantine fault tolerance — 악의적 에이전트 없는 환경
- ❌ 실시간 투표 UI — CLI로 충분

## CTO 관점 (Engineering)

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| quorum timeout (에이전트 응답 안 함) | 중 | 중 | timeout_sec 설정 (default 600s) + TIMEOUT 결정 = 단독 모드 fallback |
| split-brain (2:1로 충돌) | 낮 | 중 | tie-breaker = 가장 최근 main SHA 기준 fresh agent 투표 우선 |
| quorum이 단독보다 2x 느림 (F3 기준) | 중 | 중 | 선택적 opt-in만 (`--quorum` 플래그) — 기본값은 단독 |
| 투표 후 결과 기록 누락 | 낮 | 높음 | event store 기록 필수 (AC3) |

### Dependencies

- 선행: W-0271 Event Store ✅ — quorum 세션/투표/결정을 event store에 기록
- 선행: W-0272 Tracing ✅ — quorum 세션이 parent trace_id 상속
- 차단: W-0278 통합 (quorum validator가 통합 시나리오 핵심 검증 단계)

### Rollback Plan

- `.claude/commands/검증.md` 에서 `--quorum` 플래그 제거 → 단독 모드만 동작
- `quorum-sessions.json` 삭제 → 영향 없음

### Files Touched (예상)

- `tools/quorum-validator.mjs` — 신규 ~250줄
- `state/quorum-sessions.json` — 런타임 생성
- `.claude/commands/검증.md` — +5줄 (`--quorum` 플래그 문서화)

## AI Researcher 관점 (Data/Model)

### Data Impact

- 스키마 변경 없음 (product DB 무관)
- quorum 결과가 event store에 기록 → agent action trace coverage KPI 반영

### Statistical Validation

- KPI: `/검증` 1-agent 의존도 < 50% (W-0270 §KPI, 현재 100%)
- 측정: quorum 사용 비율 = quorum 세션 수 / 전체 `/검증` 호출 수

### Failure Modes

1. **timeout**: 3 에이전트 중 1개 응답 없음 → TIMEOUT → 단독 모드 재시도 권장
2. **2:1 split**: FAIL이 과반 → 설계 재검토 필수, 자동 머지 차단
3. **0 vote**: 에이전트 없이 quorum 개시 → session open 후 24h timeout

## Decisions

- [D1] 기본 quorum = **2 of 3** (1인 환경에서 최소 과반 보장)
- [D2] 적용 범위 = `/검증 --quorum` opt-in만 (모든 결정 ✗ over-engineering)
- [D3] tie-breaker = fresh agent (가장 최근 start.sh 실행 에이전트) 우선
- [D4] timeout default = 600s (10분); 초과 시 TIMEOUT → 단독 fallback 권장

## Open Questions

- [ ] [Q1] 3 에이전트를 어떻게 spawning? main agent가 3개 sub-agent를 isolation=worktree로? 아니면 이미 진행 중인 에이전트들이 자발적으로 투표?
- [ ] [Q2] quorum 결과가 PR auto-merge와 어떻게 연결되나? (W-0278 통합에서 결정 가능)

## Implementation Plan

1. `tools/quorum-validator.mjs` — `open / vote / status / decide / list` CLI
2. `state/quorum-sessions.json` — session registry CRUD
3. event store 연동 (session open/vote/decide 이벤트)
4. `.claude/commands/검증.md` — `--quorum` 플래그 추가
5. smoke test: open session → 2 votes PASS → auto-decide PASS

## Exit Criteria

- [ ] AC1: `quorum-validator.mjs open --subject "W-#### design" --threshold 2:3` → session JSON
- [ ] AC2: `quorum-validator.mjs vote <session_id> --agent A### --vote PASS --reason "..."` → recorded
- [ ] AC3: 2 PASS votes → auto-decide PASS + event store 기록
- [ ] AC4: timeout 후 `status` → TIMEOUT
- [ ] AC5: `/검증 --quorum` 호출 시 quorum 세션 자동 개시 (smoke test)

## References

- Parent: W-0270 §Pillar 7
- Ongaro D., Ousterhout J. (2014). In Search of an Understandable Consensus Algorithm (Raft). USENIX ATC.
- 간소화 기준: 1인 사용자 환경 → full Raft ✗, quorum vote ✅
- 선행: W-0271 (#504), W-0272 (#515)
