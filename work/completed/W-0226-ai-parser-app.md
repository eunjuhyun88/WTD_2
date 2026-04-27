# W-0226 — AI Parser App UI

## Goal
사용자가 자유 텍스트로 트레이딩 메모를 입력하면 PatternDraft가 생성되고 Capture로 저장되는 UI 제공.

## Owner
app

## Scope
- `app/src/lib/components/PatternParser.svelte` 신규 컴포넌트
- `app/src/routes/api/patterns/parse/+server.ts` 엔진 프록시 신규
- `app/src/routes/terminal/+page.svelte` 또는 적절한 페이지에 컴포넌트 마운트
- `app/src/lib/types/pattern.ts` PatternDraftBody 타입 추가

## Non-Goals
- 멀티턴 대화 UI
- Draft 편집 (1차 read-only 미리보기만)
- 자동 capture 저장 (사용자 확인 후 저장)

## Exit Criteria
- 텍스트 입력 → Parse 버튼 → PatternDraft 미리보기 표시
- "저장 → Capture" 버튼 → POST /api/captures 성공
- App CI 0 TS errors
- 로딩 상태 / 에러 상태 UI 처리

## Facts
1. 엔진 `POST /patterns/parse` Wave 1에서 완료 (PR #371, main=365341eb)
2. `engine/api/schemas_pattern_draft.py` PatternDraftBody 스키마 존재
3. `app/src/routes/api/captures/+server.ts` capture POST 프록시 존재

## Assumptions
1. 인증: `requireAuth()` 또는 동등한 guard 적용 필수 (JWT)
2. 엔진 URL: `ENGINE_URL` 환경변수 사용

## Canonical Files
- `app/src/lib/components/PatternParser.svelte` (신규)
- `app/src/routes/api/patterns/parse/+server.ts` (신규)
- `app/src/lib/types/pattern.ts` (수정 또는 신규)

## 성능 / 보안 설계
- **응답 시간**: Claude API ~2s → 로딩 스피너 필수, 타임아웃 10s
- **보안**: `+server.ts`에 session 확인 → 미인증 시 401
- **입력 검증**: zod schema — `text: z.string().min(10).max(2000)`
- **에러 처리**: 422(파싱 실패) → "다시 시도" 버튼, 503(API 키 없음) → 관리자 알림
