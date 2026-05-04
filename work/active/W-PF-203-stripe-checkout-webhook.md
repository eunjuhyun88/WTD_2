# W-PF-203 — Stripe Checkout + Webhook (PropFirm P2)

> Wave: 6 | Priority: P0 | Effort: M
> Charter: In-Scope (PropFirm Eval Challenge 결제)
> Issue: #1005
> Depends on: W-PF-201 ✅ W-PF-202 ✅ W-PF-204 ✅
> Status: 🟡 Ready (rules engine 완료)
> Created: 2026-05-04

## Goal

사용자가 `/challenge/checkout` 에서 Stripe로 결제하면 webhook이 evaluation을 자동으로 ACTIVE 전이시킨다. 수동 confirm 엔드포인트 없이 완전 자동화.

## Owner

engine + app

## Scope

**파일:**
- `engine/api/routes/propfirm.py` (233줄) — `/stripe/webhook` POST 엔드포인트 추가
- `engine/propfirm/checkout.py` (신규) — Stripe Session 생성 로직
- `app/src/routes/challenge/checkout/+page.svelte` (신규) — Stripe Elements UI
- `app/src/routes/challenge/checkout/+page.server.ts` (신규) — session_id SSR load

**DB:**
- `evaluations.stripe_session_id text` — 결제-eval 연결 (migration 필요 시 067 이후)
- `evaluations.stripe_payment_intent text` — 이미 `/payment/confirm` 에서 사용

## Non-Goals

- x402 USDC (W-PF-206 — P3)
- PDF 인증서
- 환불 자동화 (ops 수동)

## Exit Criteria

1. `POST /stripe/webhook` — Stripe signature 검증 통과, `payment_intent.succeeded` 이벤트 수신 시 evaluation PENDING→ACTIVE 자동 전이
2. webhook 재시도 3회 실패해도 idempotent (이미 ACTIVE면 skip)
3. `/challenge/checkout` 페이지 — Stripe Elements 렌더, 결제 성공 시 `/dashboard` 리디렉트
4. `engine/tests/propfirm/test_stripe_webhook.py` — 4 케이스 (성공 / sig 실패 / 중복 / 이미ACTIVE)

## Facts (실측)

```
engine/api/routes/propfirm.py:233줄 — /payment/confirm 수동 endpoint 있음
engine/api/routes/propfirm.py:10~12 — webhook 언급만 있고 실제 엔드포인트 없음
app/src/routes/ — challenge/ 디렉터리 없음
```

## Canonical Files

```
engine/api/routes/propfirm.py       ← webhook 엔드포인트 추가
engine/propfirm/checkout.py         ← 신규 (Stripe Session 생성)
engine/propfirm/evaluation.py       ← activate() 재사용 (CAS 이미 수정됨 #1145)
app/src/routes/challenge/checkout/+page.svelte
app/src/routes/challenge/checkout/+page.server.ts
engine/tests/propfirm/test_stripe_webhook.py
```

## CTO 설계 결정

- webhook 먼저, checkout UI 나중: webhook이 없으면 결제해도 eval이 안 켜짐 → 서버사이드 먼저
- Stripe signature 검증 필수: `stripe.WebhookSignature.verify_header()` — 없으면 보안 이슈
- idempotency: `stripe_payment_intent` UNIQUE 제약 or ACTIVE check before CAS — 중복 webhook 방지
- `evaluation.activate()` 재사용: 이미 CAS 보장, 직접 DB 업데이트 금지

## AI Researcher 리스크

없음 (결제 로직은 Stripe SDK 래핑, rules engine은 이미 검증됨)
