# Backend Security Review (2026-02-25)

## Scope
- Auth: `/api/auth/*`
- Session/cookie handling
- Rate limiting (local + distributed)
- Input validation and request guard rails
- Secret handling in DB
- DB connection and privilege model

## Checklist Results

### 1) Authentication / Session
- [x] Nonce + signature verification exists for EVM auth flow.
- [x] Session token is random UUID and validated server-side.
- [x] Session revocation path exists (`revoked_at` + expiry).
- [x] CSRF origin verification for cookie-authenticated state-changing endpoints.
- [ ] Session binding policy (IP/UA drift threshold + forced re-auth).

### 2) Rate Limit / Abuse
- [x] Per-instance in-memory limiter.
- [x] Distributed limiter exists.
- [x] Redis backend path added (REST API based), DB/local fallback retained.
- [x] Cloudflare threat score + static IP blocklist gate added.
- [x] Turnstile verification hook added for auth endpoints (env-driven).

### 3) Input Validation
- [x] Auth request fields length and format validation.
- [x] Request body size cap added to key endpoints.
- [ ] Common schema validation layer (e.g., zod) for all write APIs.

### 4) Secret / Key Handling
- [x] Polymarket L2 credentials now encrypted at rest (`SECRETS_ENCRYPTION_KEY` required for new writes).
- [ ] Legacy plaintext rows re-encryption batch migration job.
- [ ] KMS/HSM backed key management (env-only key is interim stage).

### 5) DB Privilege and Migrations
- [x] Runtime DDL removed from request path (`auth_nonces`, `request_rate_limits`).
- [x] New migration added for `request_rate_limits`.
- [ ] Dedicated app role with `CREATE` privilege removed in production.
- [ ] Periodic query-plan/index review pipeline.

## Findings (Severity Ordered)

### P0 (Critical)
1. DB TLS certificate verification disabled by default
   - File: `src/lib/server/db.ts`
   - Risk: MITM 가능성 증가 (원격 DB 구간).
   - Action: 기본값을 검증 ON으로 변경하고, `PGSSL_INSECURE_SKIP_VERIFY=true`일 때만 완화.
   - Status: Fixed in this patch.

2. Polymarket API credentials stored as plaintext
   - Files:
     - `src/routes/api/positions/polymarket/auth/+server.ts`
     - `src/routes/api/positions/polymarket/submit/+server.ts`
     - `src/routes/api/positions/polymarket/status/[id]/+server.ts`
   - Risk: DB 유출 시 사용자 거래 자격증명 직접 노출.
   - Action: AES-256-GCM at-rest encryption helper 도입, read/write 암복호화 적용.
   - Status: Fixed in this patch.

### P1 (High)
1. Runtime schema creation in request path
   - Files:
     - `src/lib/server/walletAuthRepository.ts`
     - `src/lib/server/distributedRateLimit.ts`
   - Risk: 앱 계정에 과도한 DB 권한 필요, 운영 오작동 시 요청 지연/실패.
   - Action: 런타임 DDL 제거, migration-only로 전환.
   - Status: Fixed in this patch.

2. Bot/abuse filtering missing on high-risk auth routes
   - Files:
     - `src/routes/api/auth/nonce/+server.ts`
     - `src/routes/api/auth/register/+server.ts`
     - `src/routes/api/auth/login/+server.ts`
     - `src/routes/api/auth/verify-wallet/+server.ts`
   - Risk: credential stuffing/automation abuse.
   - Action: Turnstile + CF threat score gate + body size cap 추가.
   - Status: Fixed in this patch.

### P2 (Medium)
1. CSRF origin/referrer strict check 부재
   - Scope: cookie 기반 쓰기 API 전반
   - Risk: 브라우저 컨텍스트에서 예외 케이스 CSRF 가능성.
   - Action: same-origin origin check + fetch-site guard 공통 훅 적용.
   - Status: Fixed in this patch.

2. Legacy plaintext secrets may remain
   - Scope: 기존 `users.poly_*` 데이터
   - Risk: 과거 데이터 노출면 유지.
   - Action: one-off re-encryption migration.
   - Status: Open.

## Immediate Next Actions
1. `SECRETS_ENCRYPTION_KEY` 설정 후 배포.
2. `db/migrations/0005_request_rate_limits.sql` 및 `supabase/migrations/012_request_rate_limits.sql` 적용.
3. Turnstile/CF 정책 값을 staging에서 튜닝 후 production 반영.
4. CSRF strict mode 설계/적용.
   - Status: 완료 (hooks 기반 origin/fetch-site guard 적용)
