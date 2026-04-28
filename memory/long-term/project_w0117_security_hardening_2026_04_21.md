---
name: W-0117 보안·성능 하드닝 완료 (2026-04-21)
description: 서버사이드 인증 강제 + 500명 규모 보안·성능 병목 7개 패치. PR #134 생성. rebase-113 브랜치.
type: project
---

## W-0117 완료 (2026-04-21, PR #134, rebase-113)

**핵심 변경:**
- `hooks.server.ts`: 비인증 페이지 → `/?auth=required` 303 리다이렉트, 비인증 API → 401. 100% 서버사이드 강제 (클라이언트 우회 불가)
- `app.d.ts`: `App.Locals.user` 타입 선언
- `authGuard.ts`: 세션 45초 hot cache → DB auth 쿼리 ~97% 감소
- `distributedRateLimit.ts`: Redis+DB 동시 장애 시 fail-closed (`false` 반환, 기존: local in-memory fallback으로 bypass 가능)
- `hooks.server.ts` CSP: `unsafe-inline/unsafe-eval` dev 전용 분리 (prod XSS 표면 제거)
- `hostSecurity.ts`: Host 헤더 port 제거 + trailing dot 정규화 (`example.com.` 등 우회 차단)
- `hotCache.ts`: 5분 백그라운드 cleanup (메모리 무한 누수 방지)
- `db.ts`: `statement_timeout` SET 실패 시 에러 로깅 (기존: `.catch(() => {})` 조용히 무시)
- `+page.svelte`: `?auth=required` 파라미터 감지 → WalletModal 자동 팝업

**공개 API (인증 불필요):** `/api/auth/*`, `/api/market/ohlcv|sparklines|funding|oi|trending|news|events|flow|derivatives`, `/api/coingecko/*`, `/api/feargreed`, `/api/cogochi/*`, `/api/coinalyze`, `/api/macro/*`, `/api/polymarket/*`, `/api/onchain/*`, `/api/etherscan/*`, `/api/patterns/*`, `/api/senti/*`, `/api/doctrine`

**보호 API (인증 필요):** 위 목록 외 모든 `/api/*` → 401

**남은 P1 보안 항목 (미구현):**
- originGuard `null` origin CSRF 강화
- Turnstile env 미설정 시 강제 차단 (현재 경고만)
- CSP nonce 완전 구현 (style-src unsafe-inline 잔존)

**Why:** 500명 사용자 대상 앱에서 인증 없이 모든 페이지 접근 가능했던 구조적 문제 해결. Claude 등 AI가 클라이언트 코드를 수정해도 서버 훅 우회 불가.

**How to apply:** 다음 세션에서 인증 관련 이슈 발생 시 이 구조(hooks → locals.user → 라우트) 기준으로 진단.
