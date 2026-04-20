# W-0117 — Security & Performance Hardening (500-user)

## Goal
인증 강제 적용 완료 후 발견된 보안·성능 병목을 우선순위순으로 제거한다.

## Scope
- `app/src/` 전체 서버 레이어
- `hooks.server.ts`, `authGuard.ts`, `distributedRateLimit.ts`, `hostSecurity.ts`, `hotCache.ts`, `db.ts`
- 클라이언트 코드 변경 없음

## Non-Goals
- 엔진(`engine/`) 수정
- 새 기능 추가
- CSP nonce 완전 구현 (scope 과도)

## Canonical Files
- `app/src/hooks.server.ts`
- `app/src/lib/server/distributedRateLimit.ts`
- `app/src/lib/server/hostSecurity.ts`
- `app/src/lib/server/hotCache.ts`
- `app/src/lib/server/db.ts`
- `app/src/lib/server/authGuard.ts`

## Facts
1. 현재 `distributedRateLimit.ts`는 Redis+DB 동시 실패 시 `true`(허용) 반환 → rate limit 완전 무효화
2. `hooks.server.ts` CSP에 `'unsafe-inline' 'unsafe-eval'` 이 prod에서도 적용 중
3. `hostSecurity.ts`가 trailing dot `example.com.` 등을 정규화하지 않음
4. `hotCache.ts`에 백그라운드 cleanup 없어 stale 항목 무한 누적
5. `db.ts` ON CONNECT `SET statement_timeout` 쿼리에 catch 없어 실패 시 조용히 무시됨

## Assumptions
- 세션 캐시 45s TTL은 이미 적용 완료 (authGuard.ts)
- 서버사이드 라우트 강제 인증은 이미 적용 완료 (hooks.server.ts)
- Turnstile이 설정된 prod 환경 기준으로 수정

## Decisions
- Rate limit 폴백: Redis+DB 모두 실패 → `false`(차단) 반환. 장애 중 안전 방향 우선.
- CSP: `dev` 환경에서만 unsafe-inline/eval 허용. prod는 inline script 최소화.
- hotCache: 5분 간격 setInterval 백그라운드 cleanup 추가.
- Host header: toLowerCase() + trailing dot 제거로 정규화.

## Completed
- [x] 서버사이드 라우트 강제 인증 (hooks.server.ts)
- [x] 세션 DB 조회 45s 캐시 (authGuard.ts)

## Next Steps
1. distributedRateLimit.ts 폴백 수정 (P0 보안)
2. hooks.server.ts CSP dev/prod 분리 (P0 보안)
3. hostSecurity.ts trailing dot 정규화 (P0 보안)
4. hotCache.ts 백그라운드 cleanup (P0 성능)
5. db.ts statement_timeout catch 추가 (P1 안정성)

## Exit Criteria
- svelte-check 0 errors
- 모든 수정 파일 서버 리로드 에러 없음
- distributedRateLimit: 폴백 시 `false` 반환 확인
