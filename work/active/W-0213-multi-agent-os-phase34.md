# W-0213 — Multi-Agent OS Phase 3-4

## Goal

Multi-Agent OS v2 Phase 3-4 구현: `.gitattributes` conflict resolution 자동화 + design invariants 확장 + agent handoff 프로토콜 강화.

## Scope

- Phase 3: `.gitattributes` merge driver 설정 (CURRENT.md, PRIORITIES.md union merge)
- Phase 4: Design invariants 확장 (현재 9개 → 15개 목표)
- Agent handoff: `agent-handoff` MemKraft 커맨드 CI 연동

## Non-Goals

- W-0145 Search Corpus (별도 work item)
- W-0212 Chart UX (별도 work item)

## Exit Criteria

- [ ] `.gitattributes` merge driver 적용 → CURRENT.md 충돌 자동 해결
- [ ] Design invariants 15개 이상 + CI pass
- [ ] `agent-handoff` 커맨드 동작 확인

## Status

🔴 IN-PROGRESS — A009 세션에서 파일 생성, Phase 3-4 구현 대기

## Agent

A009 (초안) → A010 (구현)

## References

- `spec/PRIORITIES.md` — P0 Multi-Agent OS v2
- `memory/sessions/agents/A009-session-record.md`
