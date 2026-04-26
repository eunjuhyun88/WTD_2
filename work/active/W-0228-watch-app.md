# W-0228 — Watch App UI

## Goal
Verdict Inbox 패턴 카드에 Watch 버튼을 추가하고, WATCHING 섹션에 watching 목록을 표시.

## Owner
app

## Scope
- `app/src/routes/dashboard/+page.svelte` Watch 버튼 추가 (Verdict Inbox 카드)
- `app/src/routes/api/captures/[id]/watch/+server.ts` 신규 프록시
- dashboard WATCHING 섹션 — watching=true captures 목록 표시 (현재 placeholder)

## Non-Goals
- Unwatch 기능 (단방향, V2에서 추가)
- 알림 발송 (F-36, P2)
- watching 정렬/필터 UI

## Exit Criteria
- Verdict Inbox 카드에 [Watch] 버튼 표시
- 클릭 → optimistic UI (즉시 watching 상태) → POST /api/captures/{id}/watch
- WATCHING 섹션에 watching captures 표시 (`GET /api/captures?watching=true`)
- 중복 클릭 시 에러 없음 (idempotent)
- App CI 0 TS errors

## Facts
1. 엔진 `POST /captures/{id}/watch` Wave 1에서 완료 (PR #373)
2. `GET /captures?watching=true` 필터 완료
3. `app/src/routes/dashboard/+page.svelte` WATCHING 섹션 현재 BTC/ETH 2-item 정적 placeholder

## Assumptions
1. 인증 guard 적용 (`+server.ts`)
2. Supabase migration `023_capture_records_is_watching.sql` 실행 완료 가정

## Canonical Files
- `app/src/routes/dashboard/+page.svelte`
- `app/src/routes/api/captures/[id]/watch/+server.ts` (신규)

## 성능 / 보안 설계
- **Optimistic UI**: 클릭 즉시 버튼 상태 변경, 실패 시 rollback
- **보안**: `+server.ts` session guard, capture 소유권 확인 (JWT userId == capture.user_id)
- **RLS**: Supabase captures 테이블 — `user_id = auth.uid()` 정책 확인
- **페이징**: WATCHING 목록 최대 50개 (`limit=50`), SELECT 컬럼 명시 (SELECT * 금지)
