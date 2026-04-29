# W-0248 — F-18: Stripe + x402 이중 결제 시스템 + Tier Enforcement

> Wave: 4 | Priority: P0 | Effort: L
> Charter: In-Scope L0 (SaaS subscription — copy_trading subscription 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-29
> Issue: #445 (UPDATE — 기존 issue 재사용)

## Goal

Jin이 신용카드(Stripe $29/mo) 또는 USDC 지갑(x402 pay-per-bundle) 중 한 가지로 결제하면 즉시 Pro tier가 활성화되어 capture/search rate limit이 해제된다.

## Owner

engine + app

## Scope

### 포함

**Stripe 경로 (D1 lock-in)**
- `app/src/routes/api/billing/checkout/+server.ts` — Stripe Checkout Session 생성
- `app/src/routes/api/billing/webhook/+server.ts` — `checkout.session.completed` + `customer.subscription.deleted` 처리
- `app/src/routes/api/billing/status/+server.ts` — 현재 구독 상태 조회
- `app/src/lib/server/stripe.ts` — Stripe SDK client wrapper

**x402 경로 (크립토 네이티브)**
- `app/src/routes/api/billing/x402/setup/+server.ts` — wallet 연결 + 번들 구매
- `app/src/routes/api/billing/x402/verify/+server.ts` — Base on-chain 결제 검증 (facilitator 호출)
- `engine/api/middleware/x402_gate.py` — pay-per-use 번들 잔량 차감

**Enforcement (공통)**
- `engine/api/middleware/tier_gate.py` — FastAPI Depends, tier 우선순위 (Stripe Pro > x402 credits > Free limit)
- `engine/api/routes/captures.py`, `search.py`, `patterns.py` — `Depends(tier_gate)` 적용

**DB (Supabase)**
- `app/supabase/migrations/029_stripe_x402_tier.sql`
  - `ALTER TABLE user_preferences ADD COLUMN tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro'))`
  - `ALTER TABLE user_preferences ADD COLUMN stripe_customer_id TEXT`
  - `ALTER TABLE user_preferences ADD COLUMN subscription_active BOOLEAN NOT NULL DEFAULT FALSE`
  - `ALTER TABLE user_preferences ADD COLUMN subscription_expires_at TIMESTAMPTZ`
  - `CREATE TABLE user_credits (id UUID PK, user_id UUID FK, credit_type TEXT CHECK (credit_type IN ('x402')), bundle_size INT, remaining INT, expires_at TIMESTAMPTZ, tx_hash TEXT, chain TEXT DEFAULT 'base', created_at TIMESTAMPTZ DEFAULT now())`
  - `CREATE INDEX idx_user_credits_user_active ON user_credits(user_id) WHERE remaining > 0`

**API 변경**
- 모든 quota-gated endpoints에 tier check 추가 (Free: 20 search/day, 5 captures/day; Pro: unlimited)
- HTTP 402 Payment Required 반환 (x402 표준 준수, Free 한도 초과 시 동일)
- `GET /api/billing/status` 응답: `{ tier, source: 'stripe'|'x402'|'free', credits_remaining, expires_at }`

### Non-Goals

- **Annual plan**: M3까지는 monthly만. annual은 retention 데이터 후 결정 (Q-0248-3).
- **Team plan**: 1인 SaaS만. team/seat-based는 frozen 검토 후 별도 work item.
- **자동 환불 정책**: 수동 처리. Stripe Dashboard 사용. (이유: M3 MRR < $1K 단계에서 자동화 ROI 낮음)
- **x402 multi-chain**: Base chain only. Ethereum/Polygon은 사용자 demand 검증 후.
- **Apple/Google in-app purchase**: 모바일 앱 미존재. PWA만 지원.

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Stripe webhook 누락 → tier mismatch | M | H | webhook signature 검증 + idempotency key + 5초 내 reconciliation cron |
| webhook replay 공격 | L | H | Stripe-Signature timestamp tolerance 300s 강제 |
| x402 facilitator down → 결제 hang | M | M | 60s timeout + Stripe fallback 안내 UI |
| Base chain reorg → 잔액 mismatch | L | M | 6 confirmation 대기 후 credit 부여 |
| tier check가 every request에서 DB hit → latency | M | M | Redis cache 60s TTL (`tier:{user_id}`) |
| Free user가 x402 bypass 시도 | M | M | middleware는 tier='pro' OR credits>0만 통과, 양쪽 모두 검증 |
| `subscription_active=true`인데 expired | L | H | webhook `customer.subscription.deleted` + nightly cron `subscription_expires_at < now()` 검사 |
| 029 migration 실수로 기존 user tier 변경 | L | H | DEFAULT 'free' + 기존 row UPDATE 금지, migration dry-run on staging |

### Dependencies
- 선행: JWT Auth (W-0162 완료) ✅
- 선행: `user_preferences` 테이블 ✅
- 후행: tier-gated 기능 (Watching candidates W-0283, Pattern lifecycle W-0308 등 — Pro 전용 기능 분기 적용 가능)

### Rollback Plan
1. Stripe webhook endpoint 비활성화 (`STRIPE_WEBHOOK_SECRET` env 제거)
2. tier_gate middleware feature flag (`TIER_GATE_ENABLED=false`) → 모든 request bypass
3. migration 029 rollback: `ALTER TABLE user_preferences DROP COLUMN tier, stripe_customer_id, subscription_active, subscription_expires_at` + `DROP TABLE user_credits` (사전 백업 필수)
4. 결제 환불은 Stripe Dashboard 수동 처리 (M3 단계 정책)

### Files Touched
- `app/src/routes/api/billing/checkout/+server.ts` (신규)
- `app/src/routes/api/billing/webhook/+server.ts` (신규)
- `app/src/routes/api/billing/status/+server.ts` (신규)
- `app/src/routes/api/billing/x402/setup/+server.ts` (신규)
- `app/src/routes/api/billing/x402/verify/+server.ts` (신규)
- `app/src/lib/server/stripe.ts` (신규)
- `app/src/lib/server/x402.ts` (신규)
- `app/supabase/migrations/029_stripe_x402_tier.sql` (신규)
- `engine/api/middleware/tier_gate.py` (신규)
- `engine/api/middleware/x402_gate.py` (신규)
- `engine/api/routes/captures.py` (Depends(tier_gate) 추가)
- `engine/api/routes/search.py` (Depends(tier_gate) 추가)
- `engine/api/routes/patterns.py` (Depends(tier_gate) 추가)

## AI Researcher 관점

### Data Impact
- 결제 데이터는 ledger 분리: Stripe = `stripe_events` 테이블, x402 = `user_credits` 테이블 (독립 추적)
- conversion funnel 계측: signup → first_search → quota_hit_402 → checkout → tier=pro 단계 logging (`engine/observability/funnel.py` 후속 W-item)
- D1/D7/D30 retention by payment method (Stripe vs x402) → M6에서 비교 (Q-0248-2)

### Statistical Validation
- 가설: x402 경로가 크립토 네이티브 1차 사용자의 conversion을 +X% 올린다.
- 측정: 결제 전 wallet_connected event 비율, post-payment 7일 활성도
- 데이터 부족 (M0 trader cohort 미달) → M3까지 단순 conversion rate만 측정, A/B는 M6+
- Free→Pro 전환율 5% @ M6 = 정량 게이트 (PRIORITIES.md 기준)

### Failure Modes
- **결제는 됐는데 tier 미반영**: webhook 5초 SLA 위반. mitigation: client-side polling `GET /billing/status` until `tier=pro` (max 30s) + manual sync endpoint `POST /api/billing/sync` (사용자 트리거 가능).
- **x402 onchain 결제 후 facilitator 응답 없음**: tx_hash 직접 검증 fallback (`base.publicrpc.org` eth_getTransactionReceipt)
- **Subscription 갱신 실패 (카드 만료)**: Stripe `invoice.payment_failed` 이벤트 → tier='free' 즉시 전환 + UI 알림 배너

## Decisions

- [D-0248-1] **Stripe Checkout (Hosted) 채택, Stripe Elements 거절**.
  - 거절 이유: PCI 부담 + UI 빌드 시간. Hosted는 Stripe 페이지 redirect → 5분 구현. M0 단계 ROI 우선.
- [D-0248-2] **tier 컬럼은 user_preferences에 ADD, 별도 테이블 거절**.
  - 거절 이유: JOIN 비용. user_preferences는 매 request 조회되는 핫 테이블이므로 같은 row에 위치시키면 latency 최적.
- [D-0248-3] **x402 = pay-per-bundle, recurring subscription 거절**.
  - 거절 이유: 크립토 사용자는 일회성 결제 선호 + onchain recurring은 ERC-4337 의존 → 복잡도. 50회 번들 = USDC 5 = 약 $5 (Stripe와 가격 분리 가능).
- [D-0248-4] **HTTP 402 사용 (Free 한도 초과 시 + x402 자체 표준)**.
  - 거절 이유 (429): rate limit이 아니라 결제가 필요하다는 시그널. x402 표준과 의미 일치.
- [D-0248-5] **JWT custom claim 미사용, DB lookup + Redis cache 60s 채택**.
  - 거절 이유 (JWT claim): tier 변경 시 토큰 재발급 필요 → Supabase JWKS rotation 비용. DB+cache가 단순.

## Open Questions

- [ ] [Q-0248-1] Stripe Tax 자동 계산 enable? (Korea VAT 10% 의무 — 결정 후 M0 launch)
- [ ] [Q-0248-2] x402 vs Stripe conversion ratio 가설 — M6 시점에 어느 채널이 우세한지 hypothesis 측정 방법
- [ ] [Q-0248-3] Annual plan 도입 시기 — D7 retention 어느 수준에서 launch? (e.g. D7 ≥ 40%)
- [ ] [Q-0248-4] Free tier에서 verdict 제출도 quota에 포함시킬지 — "verdict 50개 total" 제한이 PRIORITIES.md에 있으나 적절한가?
- [ ] [Q-0248-5] x402 번들 가격 = 50회 / 5 USDC가 맞는가? Stripe $29 = unlimited라면 break-even이 어디?

## Implementation Plan

1. **migration 029** 작성 + staging dry-run + RLS policy (user only own row)
2. **Stripe path** 구현 (`app/src/lib/server/stripe.ts`, 3 endpoints)
3. **Stripe webhook** signature 검증 + DB 업데이트 (idempotent on event_id)
4. **engine middleware `tier_gate.py`** + Redis cache 통합
5. **x402 path** 구현 (Coinbase facilitator 연동, Base chain only)
6. **engine middleware `x402_gate.py`** + 번들 차감 로직
7. **HTTP 402 응답 통합** + 클라이언트 측 upgrade modal
8. **테스트**:
   - pytest: tier_gate, x402_gate (unit + integration with mocked DB)
   - vitest: checkout/+server.ts, webhook signature 검증
   - manual: Stripe test card → tier=pro DB 반영 ≤ 5초
   - manual: x402 testnet bundle → middleware 통과 확인
9. **observability**: `funnel.py` events emit (signup, search_quota_hit, checkout_started, payment_completed)
10. **PR 머지 + CURRENT.md SHA 업데이트**

## Exit Criteria

- [ ] **AC1**: Stripe Checkout 결제 완료 → DB `tier='pro'` 반영 시간 ≤ 5초 (P95) — webhook 측정
- [ ] **AC2**: Free tier 사용자가 6번째 capture 시도 → HTTP 402 + `{ "error": "quota_exceeded", "upgrade_url": "..." }` 반환
- [ ] **AC3**: x402 50-credit bundle 구매 → 번들 부여 후 즉시 quota-gated endpoint 호출 통과 (`remaining` 1 차감)
- [ ] **AC4**: migration 029 적용 후 기존 user 100% `tier='free'` (DEFAULT 유지) — staging 검증 SQL 결과 첨부
- [ ] **AC5**: Stripe webhook replay 공격 방어 (timestamp tolerance 300s 초과 시 401 반환) — vitest
- [ ] **AC6**: `subscription_active=true` 사용자가 카드 만료 → `invoice.payment_failed` 이벤트 → 1분 내 tier='free' 전환
- [ ] **AC7**: tier_gate middleware Redis cache hit ratio ≥ 90% — 1주 운영 후 측정
- [ ] CI green (pytest + vitest)
- [ ] PR merged + CURRENT.md SHA 업데이트
- [ ] env vars 등록 (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO_MONTHLY`, `X402_FACILITATOR_URL`, `X402_TREASURY_ADDRESS`)

## Facts

(grep 실측 결과 — 2026-04-29)
1. `engine/api/routes/captures.py:55` — `from capture.token import sign_verdict_token, verdict_deeplink_url` ✅
2. `engine/api/routes/captures.py:708-729` — `POST /{capture_id}/verdict-link` HMAC 구현 존재
3. `app/supabase/migrations/028_telegram_connect.sql` — 마지막 migration. 다음은 029.
4. `engine/api/routes/patterns.py:872` — `POST /{slug}/promote-model` 존재 (W-0308 사용)
5. 결제 코드 0개 (`grep -r "stripe\|x402" engine/ app/src/lib/server/` → empty)
6. tier 컬럼 user_preferences 미존재 (실측: 028까지 schema)

## Assumptions

- Stripe live API key는 Vercel + Cloud Run env var로 별도 관리 (운영자 수동 입력)
- x402 Coinbase facilitator는 production 안정 (https://docs.cdp.coinbase.com/x402)
- Korean VAT 처리는 Stripe Tax 활성화로 자동 (Q-0248-1 결정 대기)
- Pro tier가 unlimited라는 정의는 "rate limit 없음"을 의미 (DDoS 방어용 일반 limit은 별도)
- baseline conversion 추정 5% @ M6는 PRIORITIES.md 기준 그대로 사용 (재검증 X)

## Canonical Files

- 계약: `docs/domains/billing.md` (신규 작성 필요 — W-0248 머지 후 동시)
- 결정: `docs/decisions/D-0248-stripe-x402.md` (신규)
- 코드 truth: `engine/api/middleware/tier_gate.py`, `app/src/routes/api/billing/`

## Next Steps

1. Issue #445 body update (이 문서 본문 + Stripe→Stripe+x402로 확장)
2. work_issue_map 업데이트 (status=design)
3. F-3/F-5/F-12/F-14 work item과 병렬 가능 (파일 충돌 없음)
4. 사용자 승인 후 implementation Wave 4 P0 우선 착수

## Handoff Checklist

- [ ] 사용자가 D-0248-1~5 결정 검토 완료
- [ ] Q-0248-1~5 답변 또는 Open Loop로 ack
- [ ] migration 029 staging 적용 계획 (downtime 없음)
- [ ] Stripe production account + Tax 설정 (운영자 작업)
- [ ] Coinbase x402 facilitator 등록 (treasury wallet 주소 결정)
- [ ] PR 분리: (a) migration 029 (b) Stripe path (c) x402 path (d) tier_gate middleware (e) routes wiring — 5개 PR로 분리 권장
