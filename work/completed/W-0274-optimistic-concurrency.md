# W-0274 — Optimistic Concurrency (Phase 4)

> Wave: Meta / Tooling | Priority: **P1** | Effort: M
> Parent: W-0270 §Pillar 2
> Status: ✅ COMPLETE
> Branch: feat/W-0272-tracing (Phase 2-4 묶음 PR)

## Goal

두 sub-agent가 동시에 같은 파일을 수정하는 race condition을 commit 시점에 감지한다.
CAS(Compare-And-Swap) 모델: claim 등록 시 파일 hash 기록 → commit 전 hash 재확인.
→ G1 사고 (2026-04-27 A045) 재발 방지 자동화.

## Scope

### 구현 파일

| 파일 | 역할 |
|---|---|
| `tools/conflict-detector.mjs` | claim 등록 / CAS check / release CLI |
| `state/claims.json` | 활성 claim 레지스트리 (런타임 생성) |
| `.githooks/pre-commit` | W-0274 check 추가 (기존 agent ID check에 병렬) |

### 두 가지 보호 레이어

1. **Pre-flight claim check**: `claim <file>` 시점에 다른 agent 소유 감지 → 경고
2. **Commit-time CAS**: `check-staged` — staged 파일 hash vs claim 시점 base_sha 비교

### Claim 구조

```json
{
  "claims": {
    "engine/foo.py": {
      "agent_id": "A042",
      "work_item": "W-0272",
      "claimed_at": "ISO",
      "base_sha": "<git object hash>"
    }
  }
}
```

### CLI Examples

```bash
# 작업 시작 시 파일 claim
node tools/conflict-detector.mjs claim engine/foo.py app/bar.ts --agent "A042" --work-item "W-0272"

# 다른 agent 충돌 확인
node tools/conflict-detector.mjs check-file engine/foo.py --agent "A043"

# pre-commit에서 자동 호출 (상태 확인)
node tools/conflict-detector.mjs check-staged --agent "A042"

# 모든 claim 조회
node tools/conflict-detector.mjs list

# agent 작업 완료 후 release
node tools/conflict-detector.mjs release --agent "A042"
```

### pre-commit 통합

`.githooks/pre-commit`에 다음 로직 추가:
- Agent ID 정상 확인 후 `conflict-detector.mjs check-staged --agent $AGENT` 호출
- 충돌 시 commit 거절 + 해결 방법 안내
- node 미설치 환경 → soft degradation (skip, 경고 없음)

## Exit Criteria ✅

- [x] `claim / release / check-staged / list / check-file` 동작
- [x] 다른 agent claim 파일 재claim 시 충돌 감지
- [x] `.githooks/pre-commit` W-0274 체크 통합
- [x] smoke test: claim → conflict → release → claim 정상

## References

- Parent: W-0270 §Pillar 2
- Lamport L. (1979). How to Make a Multiprocessor Computer That Correctly Executes Multiprocess Programs
- MVCC (Multi-Version Concurrency Control): Bernstein & Goodman 1983
- G1 사고 (2026-04-27 A045): W-0257+W-0258 commit이 W-0259 branch에 쌓인 사건
