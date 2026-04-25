# 08 — Pricing Validation Plan

**버전**: v1.0 (2026-04-25)
**상태**: canonical
**의도**: 가격을 직관이 아니라 데이터로 결정. Tier 구조와 가격 점프를 검증한다

---

## 0. 원칙

### 0.1 가격은 결정이 아니라 가설이다

"$29가 맞을 것"은 가설. 검증해야 함.

### 0.2 검증은 단계별

```
Pre-launch: Interview-based (qualitative)
Closed Beta: A/B test (quantitative, small N)
Open Beta: Cohort comparison (large N)
GA: Annual cohort revenue analysis
```

### 0.3 Anchoring 활용

P0 유저는 이미 $120-170/mo crypto data 지출. 우리 가격은 그 stack 안에서 평가됨.

### 0.4 비-목표

- 첫 가격에서 lock 결정
- Aggressive 할인으로 churn 위험 늘리기
- Enterprise pricing pre-negotiate
- 가격 차별 (price discrimination) 복잡 모델

---

## 1. 가설 (Initial Pricing)

### 1.1 가격 hypothesis

| Tier | 가격 | 가설 |
|---|---|---|
| Free | $0 | 5 captures + 20 searches/day → 부족함 인식 |
| Pro | $29/mo | P0 incremental spend 친숙 |
| Pro Annual | $249/yr ($20.75/mo) | 28% 할인 → 1년 lock-in |
| Pro Plus | $79/mo | Power user (variant + API + alerts) |
| Team Starter | $199/mo (3 seats) | 소규모 desk |
| Team Pro | $499/mo (10 seats) | 본격 desk |
| Team Enterprise | Custom | Bigger desks |

### 1.2 검증할 핵심 질문

1. **$29가 맞나?** ($19, $39, $49와 비교)
2. **$79 Pro Plus가 viable한가?** Velo $199 anchor에서 절반 위치
3. **연간 할인율 28%가 적절?** (20%, 35%와 비교)
4. **Free tier 제한 (5/20)이 맞나?** 너무 관대 vs 너무 박함
5. **Team $199가 시작 가격으로 맞나?**
6. **베타 50% 할인이 churn 줄이나?**

---

## 2. Phase 1: Pre-Launch Interview (M0-M1)

### 2.1 Goal

페르소나 가설 + 가격 sensitivity validate. **Sample N=15-25.**

### 2.2 Interview Script

총 45분, 다음 단계로:

#### Section A: Context (10min)
- 현재 어떤 도구 쓰는가
- 월 지출 얼만가
- 어떤 도구가 가장 지출 가치 있다고 느끼나
- 어떤 도구가 가장 아깝다고 느끼나

#### Section B: Problem validation (10min)
- 복기 어떻게 하나
- 비슷한 패턴 다시 찾는 데 어떻게 하나
- 그게 잘 안 될 때 비용이 뭔가

#### Section C: Product preview (10min)
- Cogochi 30초 demo
- "이거 쓰면 어디서 가치 느낄까"
- 가장 흥미로운 기능 3개

#### Section D: Pricing (10min) — 핵심

**Price Sensitivity Meter (PSM)** 4 questions:
1. 이 제품에 얼마면 너무 비싸서 안 쓰겠는가? (too expensive)
2. 얼마면 비싸지만 살 만한가? (expensive but acceptable)
3. 얼마면 저렴해서 의심스러운가? (suspiciously cheap)
4. 얼마면 너무 저렴해서 quality 의심되는가? (too cheap)

이 4 답으로 **acceptable price range**의 floor와 ceiling 도출.

#### Section E: Tier feedback (5min)
- $29 / $79 / $199 보여주고 reaction
- "본인은 어디 tier 갈 것 같나"
- "지금 vs 6개월 후"

### 2.3 Sample 분석

**P0 segment** (15-25명) 응답 분석:

```
optimal price point (OPP) = (PSM #2 floor + PSM #3 ceiling) / 2
acceptable range = [PSM #4 + 5%, PSM #1 - 5%]
```

가설:
- OPP for P0: $25-35
- Acceptable range: $15-60

만일 OPP < $20 → 가설 reject, 더 낮은 anchor
만일 OPP > $50 → 가설 reject, premium tier 강조

### 2.4 Output

- Pricing memo 1 page
- "선택 가격 + 이유"
- Closed beta 시작 가격

---

## 3. Phase 2: Closed Beta A/B Test (M3-M6)

### 3.1 Setup

**Sample N**: 200 paid users (closed beta)
**Statistical power**: 80%, p<0.1 (closed beta는 directional만)

### 3.2 Test 1: Beta entry price

각 사용자 random하게 3 group:

| Group | Price | N |
|---|---|---|
| A | $14.50/mo (50% off $29) | 70 |
| B | $19/mo (35% off $29) | 65 |
| C | $29/mo (no discount) | 65 |

**Primary metric**: 30-day conversion rate (signup → paid)
**Secondary**: 90-day retention rate

**Decision**:
- A 가장 높으면: 베타 가격 $14.50 확정, GA $29 유지
- C 가장 높으면: 가격 elasticity 낮음, 처음부터 $29
- B middle: 중간값으로

### 3.3 Test 2: Annual discount

3 group:

| Group | Annual price | Monthly equivalent | Discount |
|---|---|---|---|
| A | $199 | $16.58 | 43% |
| B | $249 | $20.75 | 28% |
| C | $279 | $23.25 | 20% |

**Primary**: % users choosing annual over monthly
**Secondary**: Annual cohort 12-month retention

### 3.4 Test 3: Free tier limits

3 group on signup:

| Group | Capture limit | Search limit |
|---|---|---|
| A | 5 captures total | 20/day |
| B | 10 captures total | 30/day |
| C | 3 captures total | 10/day |

**Primary**: Free → Paid conversion at 14 days
**Secondary**: D7 active rate

가설:
- 너무 관대 (B) → conversion 낮음
- 너무 박함 (C) → churn 높음
- A가 sweet spot

### 3.5 Test 보호 조치

- 가격 노출 transparent (혼란 없게)
- Existing users grandfather (기존 가격 유지)
- 동일 페르소나 cohort 분리 (P0 only test 1)

---

## 4. Phase 3: Open Beta Cohort (M6-M9)

### 4.1 Pricing 확정

Closed beta 결과 기반:
- Pro tier: 확정 (probably $29 or $19)
- Annual: 확정
- Free limit: 확정

### 4.2 New tier exploration

이 phase에서 추가 검증:

#### Test 4: Pro Plus tier 도입 시점

A/B:
- A: Pro만 ($29)
- B: Pro + Pro Plus ($29 + $79)

**Primary**: ARPU
**Secondary**: Pro → Pro Plus upgrade rate, churn

#### Test 5: Team Starter tier

**Sample N**: 5-10 design partner teams
**Format**: Qualitative + small quantitative

각 팀에:
- 1개월 free trial
- 다양한 가격 제안 ($99, $199, $399, $499)
- Reaction: "이 가격이면 결제하겠나"

이 단계는 sales call이지 pure A/B test 아님.

### 4.3 Cohort retention by price

90일 후:

| Tier | Active retention | MRR |
|---|---|---|
| Free | 40% | $0 |
| Pro $19 | 75% | high revenue |
| Pro $29 | 75% | best ratio |
| Pro $39 | 50% | margin↑ but volume↓ |

LTV/CAC 비교로 결정.

---

## 5. Phase 4: GA & Beyond (M9+)

### 5.1 Annual cohort analysis

GA 후 12개월:
- Cohort 별 LTV
- Churn curve
- Expansion revenue (Pro → Pro Plus, Team upgrade)

### 5.2 Geographic / Persona 분석

가격 elasticity가 segment별 다른지:
- Korea vs US vs SEA
- P0 vs P1
- Crypto bull vs bear regime

### 5.3 가격 인상 전략

GA 후 1년 검토:
- Existing users grandfather 1년
- New signups 새 가격
- Annual users 자동 lock-in

가격 인상 trigger:
- LTV/CAC > 5×
- D90 retention > 80%
- Demand exceeds capacity

---

## 6. Pricing Strategy Decisions

### 6.1 무료 tier (필수)

**왜 free 유지하는가**:
- 친구가 추천할 수 있음 (no risk)
- "Try before buy" 행동 가능
- Network effect (verdict ledger 데이터)
- Anti-piracy (없으면 leak)

**제한 디자인**:
- 5 captures: 1주일 정도면 limit 도달
- 20 searches/day: 본격 사용 시 부족
- No personal variants
- No team features
- No API
- 60일 inactive 시 capture archive

### 6.2 Pro tier (single)

**Pro의 가치**:
- Unlimited captures
- Unlimited searches
- Personal variants (1)
- Telegram alerts
- Push notifications
- 90-day capture history
- Email support

**Pro 가격 가설**:
- $29 default
- 30+ 시 churn 증가 가설
- 19+ 시 quality perception 약함 가설

### 6.3 Pro Plus tier (선택)

**Pro Plus의 가치 (Pro 위에 추가)**:
- 다중 personal variants (5)
- API access (rate-limited)
- Advanced search (LLM judge)
- Priority alerts
- 180-day history
- Priority support
- (annual) 포함 사은품

**Pro Plus 가격 가설**:
- $79 default
- Velo $199 API의 절반 anchor
- Power user (~10-20% of Pro)

### 6.4 Team tier (P1)

**Team Starter ($199/3 seats)**:
- Shared pattern library
- Team workspace
- Shared verdict
- 3 seats, additional $50 each

**Team Pro ($499/10 seats)**:
- Above + role permissions
- Audit log
- API access
- Priority support

**Team Enterprise (custom)**:
- Above + on-premise option
- SSO
- Dedicated infra
- SLA
- Custom integration

### 6.5 가격 점프 합리성

```
$0 → $29   (free → pro): 1단계 commit
$29 → $79  (pro → pro plus): 2.7× — 약간 큼, 하지만 가치 명확
$79 → $199 (pro plus → team): 2.5× — 팀 가치 + 3 seats
```

가격 ratio가 너무 크면 jump 어려움. 우리 ratio는 합리적.

---

## 7. Persona-specific Pricing

### 7.1 P0 (개인 프로)

- Free → Pro $29 (primary path)
- 일부 power user → Pro Plus $79

### 7.2 P1 (팀)

- Team Starter $199 (3 seats start)
- 성장 시 Team Pro $499 upgrade

### 7.3 P2 (Quant/API)

- Pro Plus $79 (API 포함)
- 큰 사용량은 Team Enterprise

---

## 8. Discount Strategy

### 8.1 Beta discount

- Closed beta: 50% off ($14.50 → $29 GA 시점)
- Open beta: 30% off ($19.99 → $29)
- 만료: GA 30일 후 grandfather + 점진 인상

### 8.2 Annual discount

- 28% off (Pro: $29 → $20.75/mo equiv)
- 33% off (Pro Plus: $79 → $52.92/mo equiv)
- Team annual: 33% off

### 8.3 Student discount

- Pro 50% off ($14.50/mo)
- 학교 이메일 verify 필요
- 1년 limit, renew 가능

### 8.4 친구 초대

- 둘 다 1개월 무료 (Pro)
- 가입자 unlimited
- Existing user 1개월 추가 무료
- 5명 초대 시 6개월 무료 (cap)

### 8.5 OS 안티패턴 (금지)

- ❌ 카운트다운 timer ("only 24 hours!")
- ❌ Black Friday 할인 (cheapen brand)
- ❌ 정기 50% off (anchor 무너짐)
- ❌ "Last chance" 협박 메시지

---

## 9. Pricing Page Design

### 9.1 구조

```
HERO: "Plans for every type of pattern researcher"

[ Free ]   [ Pro ]   [ Pro Plus ]   [ Team ]
  $0/mo    $29/mo     $79/mo        $199/mo

Free:
- 5 captures
- 20 searches/day
- Basic features
[Start free]

Pro (HIGHLIGHTED):
- Unlimited everything
- Personal variants (1)
- Telegram alerts
[Start 7-day trial]

Pro Plus:
- All Pro
- Multiple variants
- API access
- LLM judge
[Try Pro Plus]

Team:
- 3 seats start
- Shared library
- Workspace
[Contact for demo]

ANNUAL TOGGLE: "Save 28% with annual"

FAQ:
- Cancel anytime
- Refund policy
- Pricing change policy
- Beta discount info
```

### 9.2 시각적 강조

- Pro tier 항상 highlight
- "Most popular" badge
- Annual 토글 prominent

### 9.3 회피해야 할 anti-patterns

- ❌ 너무 많은 plans (5+)
- ❌ Feature matrix 모든 칸 채움
- ❌ "Custom enterprise" 첫 페이지 강조
- ❌ Hidden cost
- ❌ Annual auto-renew 명시 부족

---

## 10. Refund & Cancellation Policy

### 10.1 정책

- 7일 무조건 refund (Pro)
- 30일 prorated refund (annual)
- Cancel anytime (no contracts)
- Data export 가능 (이별 시 무료)

### 10.2 Cancel flow

- "Why are you leaving?" optional 1-question
- "Pause for 1 month" 옵션 (subscription pause)
- 다시 활성 시 데이터 그대로

---

## 11. Pricing Communication

### 11.1 소셜 메시지

- "Cogochi Pro: $29/mo. Cancel anytime."
- "Pro Plus: $79/mo. Power user."
- "Team: starts at $199/mo."

### 11.2 이메일 sequence (paid)

D1 (after upgrade):
- Welcome to Pro
- 새 기능 소개
- 도움 요청 way

D7:
- Pro 첫 주 stats
- Most-used feature
- Tip

D30:
- Renewal notification
- Year-to-date stats
- Pro Plus upgrade option

### 11.3 Downgrade 시

- "We saved your data" reassurance
- Free tier에서 어느 기능 잃는지 명확
- 6개월간 1-click reactivate

---

## 12. Pricing Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 가격 너무 낮음 (under-monetize) | Medium | High | A/B test 결과로 조정 |
| 가격 너무 높음 (low conversion) | Low | High | 베타 할인 + 단계 인상 |
| Free tier 너무 관대 | Medium | Medium | Capture limit 조정 |
| Free tier 너무 박함 | Low | Medium | Search limit 조정 |
| Annual lock-in 너무 강함 | Low | Low | Refund policy 명확 |
| 경쟁사 가격 인하 (Surf 등) | Medium | Medium | Value 차별화 강조 |
| 환율 변동 (Korea KRW) | Low | Low | USD 기준 유지 |

---

## 13. Cogochi vs Competitor Pricing 비교 표

| Service | Free | Entry paid | Pro | Top |
|---|---|---|---|---|
| Cogochi (target) | $0 (5/20) | $29 | $79 | $199 (team) |
| CoinGlass | Strong | $12 | $29-99 | $599+ |
| Hyblock | Volume-based | $50 | $100 | $200+ |
| Velo | Strong | $0 / $199 (API) | $199 | Custom |
| Surf | Limited | $19 (Plus) | $49 (Pro) | $499 (Max) |
| TrendSpider | None | $89 | $149 | $197 |

Cogochi positioning: **mid-tier** ($29-79), **lower than Surf $499 Max**, **higher than CoinGlass $12**.

---

## 14. Pricing Roadmap Timeline

| Phase | Action |
|---|---|
| M0 | Pre-launch interviews (15-25명) |
| M1 alpha | Pricing memo 작성, 기준 가격 결정 |
| M3 closed beta | A/B test 시작 (Test 1, 2, 3) |
| M5 | A/B 결과 분석, GA 가격 결정 |
| M6 open beta | 확정 가격 + Pro Plus 도입 |
| M7 | Team tier pilot (5-10 teams) |
| M9 GA | All tiers live |
| M12 | Annual cohort 첫 분석, 가격 조정 검토 |

---

## 15. 한 줄 결론

> **가격은 결정이 아니라 가설. 검증 단계: Interview → A/B test → Cohort analysis.**
> **시작 가설: $29 Pro, $79 Plus, $199 Team. 베타 50% 할인.**
> **6개월 동안 검증해서 GA 가격 확정.**
