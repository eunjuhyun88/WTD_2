# W-0088 Flywheel Closure — Capture Wiring (Phase A)

## Goal

App `Save Setup` 이 engine canonical capture store 에 도달하도록 하여 flywheel 1축을 닫는다.

## Owner

contract

## Scope

- `app/src/lib/server/terminalPersistence.createPatternCapture` 를 engine HTTP 호출로 교체
- `app/src/lib/server/terminalPersistence.listPatternCaptures` 를 engine HTTP 호출로 교체
- App `terminal_pattern_captures` 테이블을 dual-write phase 로 운영 (canonical = engine)
- E2E 검증: Save Setup → engine `LEDGER:capture` row appended

## Non-Goals

- App DB 테이블 제거 (Phase A 는 dual-write 만)
- Outcome resolver 구현 (Phase B)
- Verdict UI 구현 (Phase C)
- Refinement trigger (Phase D)
- 새 pattern slug 추가
- Cogochi / RAG / mobile 확장

## Canonical Files

- `docs/product/flywheel-closure-design.md`
- `app/src/routes/api/terminal/pattern-captures/+server.ts`
- `app/src/lib/server/terminalPersistence.ts`
- `app/src/lib/contracts/terminalPersistence.ts`
- `engine/api/routes/captures.py`
- `engine/capture/store.py`
- `engine/ledger/store.py`

## Facts

- Engine `/captures` POST 는 `candidate_transition_id` 검증과 LEDGER append 를 이미 수행한다 (`engine/api/routes/captures.py:82`)
- App `createPatternCapture` 는 `terminal_pattern_captures` 테이블에 직접 INSERT 하며 engine 을 호출하지 않는다 (`app/src/lib/server/terminalPersistence.ts:347`)
- Engine 측 `CaptureStore` / `LEDGER_RECORD_STORE` / `PatternStateStore` 는 이미 구현되어 있다
- App route 는 이미 `transitionId` 류 필드를 zod 검증한다 (`app/src/routes/api/terminal/pattern-captures/+server.ts:44`)

## Assumptions

- Engine HTTP base URL 은 `ENGINE_URL` 환경변수로 app 에서 접근 가능
- Engine 측 인증은 internal token 또는 service-to-service 신뢰 (user_id 는 app 이 검증 후 전달)

## Open Questions

- Dual-write 실패 처리: app DB 성공 + engine 실패 시 retry vs reject?
- Engine HTTP 응답 latency 가 Save Setup UX 에 미치는 영향 (현재 sync, 필요 시 async queue 검토)

## Decisions

- Engine 이 capture single source of truth.
- App DB 테이블은 view 로 격하 예정 (Phase A 종료 후 별도 work item 에서 처리).
- 인증은 app 이 cookie 검증 후 user_id 를 engine 에 신뢰 가능하게 전달.

## Next Steps

1. App `createPatternCapture` 안에 engine HTTP POST 추가 (dual-write, engine 응답 우선)
2. App `listPatternCaptures` 를 engine GET 로 교체 (read-through)
3. E2E 테스트 추가: Save Setup → engine ledger row 검증

## Exit Criteria

- App Save Setup 호출 시 engine `LEDGER:capture` row 가 1건 append 된다
- App route 에서 engine 호출 실패 시 사용자에게 명확한 에러 응답
- 기존 app DB 테이블 행 수와 engine ledger 행 수가 동일하게 증가한다 (dual-write 검증)

## Handoff Checklist

- 설계 문서 (`docs/product/flywheel-closure-design.md`) 가 다음 단계 모두 정의함
- Phase B-E work item 은 본 work item 종료 후 신규 발행 (W-0089~)
- 기존 W-0036, W-0064, W-0042 는 본 work item 으로 통합 또는 후속 phase 로 이전
