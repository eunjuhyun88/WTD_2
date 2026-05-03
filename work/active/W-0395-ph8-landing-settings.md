# W-0395-Ph8 — Landing LiveStat + Settings 5탭 + API Keys

> Wave: 6 | Priority: P0 | Effort: XL
> Parent Issue: #955
> Status: 🟡 Design Draft
> Created: 2026-05-04

## Goal
Landing에서 live 지표로 신뢰를 증명하고, Settings에서 구독 tier + API Keys로 결제 funnel을 완성한다.

## Owner
app

## CTO 관점 — API Keys 보안 아키텍처 (D-0005)

결정: Supabase 내장 pgcrypto 사용 (외부 KMS 불필요).

```sql
-- api_keys 테이블
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange text NOT NULL,  -- 'binance' | 'bybit'
  api_key text NOT NULL,
  secret_encrypted bytea NOT NULL,  -- pgcrypto encrypt
  permissions_json jsonb,  -- validated permissions snapshot
  validated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, exchange)
);

-- 서버에서만 decrypt
SELECT pgp_sym_decrypt(secret_encrypted, current_setting('app.encryption_key')) ...
```

보안 규칙:
1. POST /api/keys → CCXT 호출 → permission 검증 → trade/withdraw 감지 시 reject (400)
2. GET /api/keys → api_key masked, secret 절대 반환 안 함
3. Rate limit: 5 additions/user/24h
4. 거절: libsodium (외부 의존성 불필요), KMS (과도한 복잡도)

## PR 분해 계획

### Landing PR 1 — LiveStatStrip + /api/landing/stats (Effort: S)
신규: `lib/components/landing/LiveStatStrip.svelte`, `routes/api/landing/stats/+server.ts`
수정: `routes/+page.svelte` (HomeHero 직후 삽입)
주의: prerender=true → 클라이언트 SWR only (SSR fetch 금지)
stats API: { active_patterns, verdict_accuracy_7d, active_users_24h }, Cache-Control 30s
Exit Criteria:
- AC1: stats API p50 ≤150ms (cached), p95 ≤400ms
- AC2: skeleton → data CLS ≤0.05
- AC3: 30s refresh vitest fake timer

### Landing PR 2 — MiniLiveChart + CTA 4위치 tracking (Effort: M)
신규: `lib/components/landing/MiniLiveChart.svelte`, `lib/components/landing/ctaTracking.ts`
수정: HomeHero / LiveStatStrip / HomeLearningLoop / HomeFinalCta (4 위치 CTA wrapper)
Bundle delta ≤25KB
Exit Criteria:
- AC1: chart paint ≤500ms, 60bar 채워짐
- AC2: 4 CTA 각각 landing_cta_click{position} GA4 emit
- AC3: bundle delta ≤25KB

### Settings PR 1 — 5탭 shell (기존 옵션 이전, Effort: M)
신규: `lib/hubs/settings/SettingsHub.svelte`, `lib/hubs/settings/panels/GeneralPanel.svelte`
5탭: General / Subscription / API Keys / Passport / Status
URL: ?tab=general|subscription|api-keys|passport|status
Subscription / API Keys = placeholder ("Coming PR2/PR3")
수정: `routes/settings/+page.svelte` → `<SettingsHub />`
Exit Criteria:
- AC1: 기존 옵션 7개 동작 동일 (vitest 7케이스)
- AC2: /settings/passport → /settings?tab=passport redirect
- AC3: svelte-check 0

### Settings PR 2 — Subscription tier + usage bar (Effort: M)
신규: `lib/hubs/settings/panels/SubscriptionPanel.svelte`, `routes/api/billing/usage/+server.ts`
tier_gate.py 기존 limit 재사용, Stripe portal link (W-0248 endpoint)
usage bar 색상: 0-80% g4, 80-95% amb, 95%+ neg
Exit Criteria:
- AC1: usage API p50 ≤300ms
- AC2: Free tier limit 정확 표시, Quant "Unlimited"
- AC3: settings_upgrade_click GTM emit

### Settings PR 3 — API Keys READ-ONLY + AC10 badge (Effort: M)
신규: `lib/hubs/settings/panels/ApiKeysPanel.svelte`, `lib/hubs/settings/panels/Ac10Badge.svelte`, `routes/api/keys/+server.ts`, migration 054_api_keys.sql
D-0005 보안 아키텍처 적용 (위 참조)
Exit Criteria:
- AC1: trade 권한 키 reject + 명시적 에러 메시지
- AC2: secret 평문 클라이언트 미도달 (network log)
- AC3: AC10 badge DOM 항상 존재 (Playwright)
- AC4: 잔고 동기화 1회 동작

## Open Questions
- [ ] [Q-5] Subscription tier 한도 수치 — tier_gate.py에서 grep 후 확정
- [ ] [Q-6] Landing stats 데이터 소스 — Supabase view vs Cloud Run aggregation

## Handoff Checklist
- [ ] Settings PR3 보안 리뷰 필수 (encryption_key env var 설정 확인)
- [ ] Landing prerender=true 확인 → 클라이언트 SWR 사용
