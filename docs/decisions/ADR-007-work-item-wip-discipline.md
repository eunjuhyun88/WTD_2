# ADR-007: Work Item WIP Discipline

## Status

Accepted

## Context

`AGENTS.md` 는 "one thread, one active work item, one execution branch" 를 명시한다. 그러나 실제 `work/active/` 에는 114 개의 파일이 존재하고 `work/completed/` 에는 1 개만 있다.

조사 결과:

- 86 개의 유니크 W-번호, 23 개의 중복 번호 (engine + app 병렬 슬라이스)
- 약 15-20 개는 Exit Criteria 가 이미 만족됐으나 아카이브되지 않음
- 약 60-65 개는 진짜 진행 중
- 약 5-10 개는 paused / superseded
- 작업 유형: engine/ML 48, app/UX 32, contract 30, infra 10, docs 11

문제는 backlog 크기가 아니라 다음 두 가지다.

1. "Active" 의 의미가 정의되지 않아 backlog 와 in-flight 가 섞여있다.
2. 아카이브 규율이 깨져있다 (`work/completed/` 가 거의 비어있음).

이 상태에서는 사람도 에이전트도 "지금 무엇이 진행 중인지" 파일에서 답할 수 없다. 거버넌스 실패다.

## Decision

`work/` 하위를 다음 3-tier 로 분리한다.

```
work/
  wip/        ← 동시 in-flight, 최대 5개 cap
  active/     ← backlog, 작업 후보군
  completed/  ← Exit Criteria 만족 후 즉시 이동
```

### WIP cap

- `work/wip/` 동시 보유 work item 최대 5 개
- 새 work item 을 `wip/` 로 진입시키려면 기존 wip 항목 1개를 `completed/` 또는 `active/` 로 이동
- 단 1인 / 페어 팀의 경우 권장 cap 은 3 개

### 진입 규칙

- `wip/` 진입 시 owner / canonical files / next steps 가 명시되어야 함
- `wip/` 항목은 매주 업데이트 (Next Steps, Decisions)
- 2 주 이상 업데이트 없는 wip 항목은 `active/` 로 강제 demote

### 아카이브 규칙

- Exit Criteria 의 모든 항목이 만족되면 즉시 `completed/` 이동
- Superseded 된 항목은 `completed/` 가 아니라 `archive/superseded/` 로 분리
- 아카이브 시 head 에 `Resolved: <date>` 또는 `Superseded by: <W-xxxx>` 한 줄 추가

### 중복 번호 정책

- 동일 번호 다른 owner (engine + app 병렬 슬라이스) 는 허용되나 명시적 표기 필요
- 신규 work item 은 owner 별 monotonic 번호 권장 (예: `W-0088-engine`, `W-0088-app`)
- 기존 23 개 중복 번호는 점진적 정리 (강제 rename 금지)

## Consequences

### Positive

- 사람과 에이전트가 `work/wip/` 디렉토리만 보면 현재 in-flight 가 즉시 파악된다
- WIP cap 이 동시 컨텍스트 부담을 강제로 제한한다
- 아카이브 규율이 회복되어 `completed/` 가 실제 진행 증거가 된다
- backlog 는 보존되므로 제품 surface area (사업 자산) 가 유지된다

### Negative

- 초기 마이그레이션 비용 (114 개 항목 triage)
- 중복 번호 정리에 시간 필요
- 새 WIP 진입 시 기존 항목 강제 이동 → 작업 컨텍스트 스위칭 비용

### Migration Plan

1. `work/wip/` 디렉토리 생성
2. 약 15-20 개 done 항목을 `completed/` 로 이동 (Exit Criteria 검증 후)
3. 현재 진짜 진행 중인 3-5 개를 `wip/` 로 승격
4. 나머지는 `active/` 에 backlog 로 잔류
5. `AGENTS.md` 의 work item 섹션을 본 ADR 참조로 갱신

## Non-Goals

- backlog (`work/active/`) 항목 삭제 (보존)
- 중복 번호 강제 rename (선택적)
- archive 정책 변경 (`docs/archive/` 기존 규칙 유지)

## Related

- `AGENTS.md` Work Item Discipline 섹션
- `CLAUDE.md` Branch and Worktree Operating Rules
- `docs/product/business-viability-and-positioning.md` Feature Freeze List
