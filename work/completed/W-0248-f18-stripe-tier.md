# W-0248 — F-18: Auth + Stripe 결제 + Tier Enforcement

> Wave 4 P1 | Owner: app+engine | Branch: `feat/F18-stripe-tier`

---

## Goal

SaaS Pro $29/mo 결제 연동 + Free/Pro tier 분기 + API rate limit per tier. D1 lock-in: $29/mo Pro.

## Owner

app+engine

---

## CTO 설계

### Tier 분기

```typescript
// Pro features gate
const isPro = user.tier === 'pro' || user.subscription_active

// Free limits
const FREE_LIMITS = {
  captures_per_day: 5,
  search_per_day: 20,
  verdicts_total: 50,
}
```

### Stripe 연동

- `POST /api/billing/checkout` → Stripe Checkout Session
- `POST /api/billing/webhook` → Stripe webhook (구독 상태 sync)
- `GET /api/billing/status` → 현재 구독 상태

### DB

```sql
-- user_preferences에 tier 컬럼 추가
ALTER TABLE user_preferences ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE user_preferences ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE user_preferences ADD COLUMN subscription_active BOOLEAN DEFAULT FALSE;
```

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/routes/api/billing/checkout/+server.ts` | 신규 |
| `app/src/routes/api/billing/webhook/+server.ts` | 신규 — Stripe webhook |
| `app/src/routes/api/billing/status/+server.ts` | 신규 |
| `app/src/lib/server/stripe.ts` | 신규 — Stripe client |
| `app/supabase/migrations/028_stripe_tier.sql` | 신규 |
| `engine/api/middleware/tier_gate.py` | 신규 — rate limit per tier |

## Exit Criteria

- [ ] Stripe Checkout 결제 완료 → tier = 'pro' 업데이트
- [ ] Pro tier: rate limit 없음 / Free: 5 captures/day
- [ ] `STRIPE_SECRET_KEY` env var
- [ ] webhook signature 검증
- [ ] App CI ✅

## Facts

1. O-01~O-08 Auth 전부 완료 (W-0162).
2. `user_preferences` 테이블 존재.
3. `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` env var 신규.

## Canonical Files

- `app/src/routes/api/billing/`
- `app/src/lib/server/stripe.ts`
- `app/supabase/migrations/028_stripe_tier.sql`
