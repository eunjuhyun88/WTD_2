# W-0088 — Verdict Inbox UI (flywheel axis 3 product surface)

## Goal

`/patterns` 페이지에 Verdict Inbox 섹션 추가 — outcome_ready 상태 capture 를 나열하고 창업자가 valid/invalid/missed 로 레이블할 수 있게 한다.

## Owner

app / patterns

## Why

엔진 backend (W-0088 Phase C) 은 `GET /captures/outcomes` + `POST /captures/{id}/verdict` 로 완성됐지만, UI 없이는 flywheel axis 3 이 실질적으로 돌지 않는다. 창업자가 매일 Verdict Inbox 를 리뷰해야 axis 4(ML refinement) 인풋이 쌓인다.

## Scope

### `/patterns` 페이지 — Verdict Inbox 섹션

Engine proxy 활용: `/api/engine/captures/outcomes` → engine `GET /captures/outcomes`

**컴포넌트 구조**:
- `VerdictInboxSection.svelte` (신규) — list + submit
  - 헤더: "Verdict Inbox" + count badge
  - 빈 상태: "no pending captures" 메시지
  - 캡처 카드 목록:
    - symbol, pattern_slug, phase, captured_at
    - outcome: resolution(win/loss), fwd_peak_pct, realistic_pct, eval_window_bars
    - 3 버튼: VALID | MISSED | INVALID
  - 제출 후: 카드 제거 (optimistic update)

**API calls** (direct engine proxy):
- `GET /api/engine/captures/outcomes?status=outcome_ready&limit=100`
- `POST /api/engine/captures/{id}/verdict` `{verdict, user_note?}`

### 변경 파일

- `app/src/components/patterns/VerdictInboxSection.svelte` — 신규
- `app/src/routes/patterns/+page.svelte` — 섹션 추가

## Non-Goals

- Auth gating (창업자 전용이지만 MVP 에선 미적용)
- Pagination (100개 limit 으로 충분)
- User note 입력 UI (버튼만, note 는 null)

## Exit Criteria

- [x] `/patterns` 에서 outcome_ready capture 목록이 보인다
- [x] VALID/MISSED/INVALID 버튼 클릭 시 engine API 호출 후 카드 제거
- [x] 빈 상태 UI 표시
- [x] 로딩/에러 상태 처리
