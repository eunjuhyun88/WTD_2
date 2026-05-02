# ADR-012 — Core Loop Spine & research/ 4-subpackage Boundary

Date: 2026-05-02
Status: Accepted
Supersedes: (부분) ADR-006, ADR-009
Linked: W-0386

## Context

`engine.research` 가 내부 import 45회 허브로 굳어, 새 시그널 도메인 추가마다 결합 누적.
17개+ 경쟁 진입점으로 재현 가능한 코어루프 실행 불가.

## Decision

1. `engine/core_loop/` 신규 패키지: Stage Protocol + CoreLoop + Ports (ADR-002 app-engine-boundary 준수)
2. `engine/research/` → `discovery/validation/ensemble/artifacts` 단방향 의존 레이어
3. import-linter CI gate로 경계 강제
4. `pipeline.py`는 CoreLoop facade (DeprecationWarning 4주)

## Consequences

- `from engine.research` top-level: 45 → ≤ 12
- 신규 시그널 도메인: `research/discovery/` 또는 `research/artifacts/` 에만 추가
- 새 진입점 금지: `CoreLoopBuilder` 사용 강제 (import-linter `pipeline-thin-facade`)

## Cross-links

- [ADR-006](ADR-006-core-loop-runtime-adapter-boundary.md): core_loop/ports.py가 Port Protocol로 구현
- [ADR-009](ADR-009-core-runtime-ownership.md): CoreLoop이 canonical owner
