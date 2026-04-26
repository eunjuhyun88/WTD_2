# W-0213 — Multi-Agent OS Phase 3-4

## Goal

Multi-Agent OS v2 Phase 3-4 구현: `.gitattributes` conflict resolution 자동화 + design invariants 확장.

## Owner

A009 (초안) → A010 (구현)

## Scope

- Phase 3: `.gitattributes` merge driver 설정 (CURRENT.md, PRIORITIES.md union merge)
- Phase 4: Design invariants 확장 (현재 9개 → 15개 목표)
- Agent handoff 프로토콜 강화 — `agent-handoff` MemKraft CI 연동

## Non-Goals

- W-0145 Search Corpus (별도)
- W-0212 Chart UX (별도)

## Canonical Files

- `work/active/W-0213-multi-agent-os-phase34.md`
- `.gitattributes`
- `spec/INVARIANTS.md`
- `spec/PRIORITIES.md`
- `tools/start.sh`

## Facts

- PR #335 (c0ab48dc)로 Multi-Agent OS Phase 0-2 머지 완료.
- 현재 design invariants 9개 (spec/INVARIANTS.md).
- CURRENT.md 충돌은 여전히 수동 해결 필요 (merge driver 미설정).
- MemKraft `agent-handoff` 커맨드 존재하지만 CI 연동 안 됨.

## Assumptions

- `.gitattributes` union merge driver로 CURRENT.md 충돌 90% 이상 자동 해결 가능.
- invariants 15개는 현재 아키텍처 결정들로 채울 수 있음.

## Open Questions

- union merge driver가 CURRENT.md의 테이블 형식에서 중복 행 발생 가능성?
- `agent-handoff` 커맨드 CI 체크 방식 (파일 존재 확인 vs 내용 검증)?

## Decisions

- (pending) merge driver 전략 선택: union vs custom script.

## Next Steps

1. `.gitattributes`에 CURRENT.md, PRIORITIES.md merge=union 추가
2. `spec/INVARIANTS.md` — 9→15개 invariants 정의
3. `tools/start.sh` — `agent-handoff` 출력 포함 검증
4. Contract CI pass 확인

## Exit Criteria

- [ ] `.gitattributes` merge driver 적용 → CURRENT.md 충돌 자동 해결
- [ ] Design invariants 15개 이상 + CI pass
- [ ] Contract CI ✓, Engine Tests ✓, App CI ✓

## Handoff Checklist

- [ ] `./tools/claim.sh ".gitattributes, spec/INVARIANTS.md"`
- [ ] `feat/w-0213-multi-agent-os-phase34` 브랜치 생성
- [ ] 기존 open loop `feature_materialization_job corpus` 확인 후 W-0145로 이관
