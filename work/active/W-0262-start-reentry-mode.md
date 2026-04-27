# W-0262 — `/start` 재진입성 강화 (Phase 3)

**Owner**: TBD
**Status**: PRD (구현 전)
**Depends on**: W-0260 (registry SSOT)
**Branch (예상)**: `feat/W-0262-start-reentry`

## Goal

이 worktree에 다시 들어갔을 때 "어디까지 했지?"를 머리쓰지 않게. registry 매핑 + 마지막 jsonl을 자동 요약.

## Scope

### In-Scope

- `tools/start.sh` 헤더 확장:
  - **재진입 모드** (registry status=active + 같은 agent_id 또는 work_item):
    - 마지막 jsonl event 3개 표시
    - "이어가기" hint (claim된 issue 상태, 다음 단계 추론)
    - 이전 세션 lesson (있으면)
  - **신규 모드** (registry empty 또는 status=done):
    - 기존 P0/P1 추천 표시
- 새 명령: `tools/worktree-registry.sh resume` — 가장 최근 active worktree로 이동 hint
- `state/agents/A###.live.json` heartbeat과의 정합성 검증

### Non-Goals

- AI 자동 plan 생성 (별도 PRD)
- 다른 worktree로 이동 자동화 (사용자 결정 영역)

## Exit Criteria

- [ ] 두 번째 `/start` 호출 시 "재진입 모드" 표시 (이전 jsonl 3개 + last_active 시각)
- [ ] 새 worktree에서 `/start` → "신규 모드" (P0 목록)
- [ ] registry status=active이지만 7d+ idle → "stale 재진입" 경고 + sweep 권장
- [ ] `tools/worktree-registry.sh resume` — 내 active worktree 중 last_active 최신 표시 + path

## Risks

| 위험 | 완화 |
|---|---|
| 세션이 무한 루프 (start → 재진입 → start) | 재진입 메시지는 단 1회. heartbeat 갱신 후 다음부터는 평이 출력. |
| registry vs heartbeat drift | registry가 진실. heartbeat는 가시성. 충돌 시 registry 우선. |

## CTO 점검표

| 영역 | 평가 |
|---|---|
| 성능 | jq 1회 + jsonl tail 1회. 즉시. |
| 안정성 | jsonl 손상 시 graceful (head -n 0). |
| 보안 | 영향 없음 |
| 유지보수성 | start.sh 헤더 섹션 분리 권장 |
| Charter 부합 | §Context Discipline — 재진입 시 컨텍스트 재구성 자동화 |
