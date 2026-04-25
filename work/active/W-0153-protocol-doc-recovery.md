# W-0153 — Protocol Doc Recovery

## Goal

`codex/parking-20260423-mixed-lanes` snapshot에만 남아 있던 Cogochi Protocol 문서 세트를 현재 repo에 복구하고, 이후 별도 protocol lane에서 재사용할 수 있게 reference 상태로 보존한다.

## Owner

research

## Scope

- parking snapshot commit에서 protocol whitepaper/product/domain 문서 복구
- 현재 canonical lane과 번호 충돌 없이 recovery work item 생성
- contracts index에 protocol 문서 세트 재연결
- 현재 `CURRENT.md`에 assist/reference entry 추가

## Non-Goals

- protocol 구현 시작
- protocol work item을 active execution lane으로 승격
- 현재 `W-0148` / `W-0122` / `W-0142` execution order 변경
- old `W-0141` numbering 복원

## Canonical Files

- `work/active/W-0153-protocol-doc-recovery.md`
- `work/active/CURRENT.md`
- `docs/domains/contracts.md`
- `docs/product/cogochi-protocol-whitepaper-v2.md`
- `docs/product/cogochi-protocol-mvp-prd.md`
- `docs/product/cogochi-protocol-epics-and-tickets.md`
- `docs/product/cogochi-protocol-phase1-execution-spec.md`
- `docs/product/cogochi-protocol-phase1-implementation-split.md`
- `docs/domains/cogochi-protocol-extension-architecture.md`
- `docs/domains/cogochi-protocol-object-contracts.md`
- `docs/domains/cogochi-protocol-route-contracts.md`
- `docs/domains/cogochi-protocol-shared-state-schema.md`

## Facts

1. protocol 문서 세트는 현재 worktree에서는 사라졌지만 git history에는 남아 있었고, source commit은 `8e3944148ec2eeb09668d8dc1be9518dfcd35f79` (`codex/parking-20260423-mixed-lanes`) 이다.
2. 현재 `CURRENT.md`의 `W-0141`은 이미 `W-0141-market-data-plane.md`를 가리키므로 old `W-0141-cogochi-protocol-whitepaper-refresh.md`를 그대로 복원하면 번호 충돌이 생긴다.
3. 현재 canonical execution priority는 `W-0148 -> W-0122 / W-0145 / W-0142 -> W-0143 -> W-0139` 이며, protocol lane은 active execution lane이 아니다.
4. 복구 대상 문서는 whitepaper, MVP PRD, epics/tickets, phase1 execution split, architecture, object/route/shared-state schema를 포함한다.

## Assumptions

1. 지금 필요한 것은 문서 보존이며, active protocol implementation kickoff는 후속 lane에서 다시 결정한다.
2. protocol 문서 세트는 현재 repo truth와 100% 동기화된 active spec이 아니라 future lane reference로 읽어야 한다.

## Open Questions

1. protocol implementation이 실제로 시작될 때 새 canonical work item 번호를 `W-015x` 이후 어느 번호로 열지 추후 결정해야 한다.
2. 복구된 protocol 문서 중 어떤 부분을 현재 `W-0148` architecture와 다시 정렬할지 후속 세션에서 정해야 한다.

## Decisions

- protocol docs는 원래 `docs/product/*` / `docs/domains/*` 경로로 복구한다.
- old `W-0141` work item은 그대로 되살리지 않고, recovery는 `W-0153`에서 추적한다.
- `CURRENT.md`에는 assist/reference row만 추가하고 active lane 우선순위는 바꾸지 않는다.
- branch split reason: recovered protocol docs는 `W-0149`~`W-0152` engine commercialization lane과 primary change type이 다르므로 별도 doc/research branch로 보존한다.

## Next Steps

1. protocol lane을 실제로 열 때는 별도 새 work item으로 승격하고 implementation branch를 분리한다.
2. 필요 시 recovered doc set을 현재 `W-0148` plane architecture와 대조해 stale section을 정리한다.
3. protocol 문서를 deck 또는 investor memo로 다시 압축할 경우 `W-0153`이 아니라 새 execution lane에서 진행한다.

## Exit Criteria

- [x] protocol 문서 세트가 현재 worktree에 복구된다.
- [x] contracts index에서 protocol 문서 세트를 다시 찾을 수 있다.
- [x] 번호 충돌 없이 recovery work item이 `CURRENT.md` reference 영역에 기록된다.

## Handoff Checklist

- active work item: `work/active/W-0153-protocol-doc-recovery.md`
- branch: `codex/w-0153-protocol-doc-recovery`
- source snapshot: commit `8e3944148ec2eeb09668d8dc1be9518dfcd35f79` on `codex/parking-20260423-mixed-lanes`
- verification status: file recovery and doc index update only; no runtime verification
- remaining blockers: protocol lane is still non-canonical for active execution until separately promoted
