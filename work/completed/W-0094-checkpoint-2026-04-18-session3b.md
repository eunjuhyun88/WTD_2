# W-0094 Checkpoint — 2026-04-18 Session 3b

## Session Summary

W-0088 Phase A 완료: app Save Setup → engine canonical capture store 연결 (flywheel 1축 닫힘).

## Commit

| hash | description |
|------|-------------|
| `fb3ccf6` | feat(W-0088-A): flywheel closure — engine dual-write for pattern captures |

## What Changed

### engine/api/routes/captures.py
- `CaptureCreateBody.pattern_slug`: `str` → `str = ""` (default)
- `CaptureCreateBody.phase`: `str` → `str = ""` (default)
- `manual_hypothesis` capture_kind 이 transition 검증 없이 engine에 저장 가능해짐

### app/src/lib/server/engineClient.ts
- `engine.createCapture(body)` 추가 — POST /captures
- `engine.listCaptures(params)` 추가 — GET /captures?user_id=...

### app/src/lib/server/terminalPersistence.ts
- `createPatternCapture`: engine POST 먼저(canonical), 성공 시 app DB INSERT
  - engine 실패 → 사용자에게 5xx 에러 전달 (W-0088 exit criteria 충족)
  - chart_context에 app 전용 필드 매립: contextKind, triggerOrigin, snapshot, decision, evidenceHash, sourceFreshness
- `listPatternCaptures`: engine GET read-through (primary) + app DB fallback
  - engine 미응답 시 기존 app DB 행 유지 (graceful degradation)
  - client-side 필터: timeframe, verdict, id (engine이 미지원하는 쿼리)
- `mapEngineCaptureRow` 추가: engine CaptureRecord → app PatternCaptureRecord 변환

## Verified
- engine: 746/746 tests green
- app: svelte-check 0 errors, vitest 112/112 green

## Flywheel Status
- Axis 1 (Capture): **CLOSED** — Save Setup → engine LEDGER:capture ✓
- Axis 2 (Outcome): open — outcome_resolver.py 미구현
- Axis 3 (Verdict): partially closed — W-0092 live-signals verdict UI 있음, engine verdict route 미연결
- Axis 4 (Refinement): open — refinement_trigger.py 미구현

## Remaining in W-0088
- E2E 테스트: Save Setup → engine ledger row 검증 (vitest mock 또는 integration)
- Phase B: outcome_resolver.py (engine/scanner/jobs/)
- Phase C: verdict dashboard inbox (axis 3 완전 연결)
- Phase D: refinement_trigger.py

## Next Recommended
W-0088 Phase B — `engine/scanner/jobs/outcome_resolver.py` + `engine/patterns/outcome_policy.py`
