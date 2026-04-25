# 06 — Launch Plan (Closed Beta → Open Beta → GA)

**버전**: v1.0 (2026-04-25)
**상태**: canonical
**의도**: 런칭 단계별 gate, 목표, 중단 기준을 사전에 못 박는다

---

## 0. 원칙

### 0.1 Launch는 이벤트가 아니라 funnel이다

"출시일"이 목표가 아니다. 각 단계에서 **특정 검증 목표**가 있고, 그 목표를 달성하면 다음 단계로 간다. 목표 미달 시 slice 재설계.

### 0.2 Gated rollout

각 단계 진입 시 **필수 체크리스트**와 **진입 조건**. 이거 없이 넘어가면 나중에 scale에서 터짐.

### 0.3 Kill criteria 사전 정의

단계별 kill 기준을 미리 정한다. "좀 더 해보자"는 함정.

### 0.4 3 phase 진행

1. **Closed Alpha** — 내부 + 선별 10-20명
2. **Closed Beta** — 초대 기반 200명
3. **Open Beta** — public signup, 1000+
4. **GA** — pricing + 상업 운영

---

## 1. Timeline Overview

```
현재 (2026-04-25) — M0
 ↓ 6 weeks (Slice 1-5)
M1 (2026-06-06) — Closed Alpha start
 ↓ 6 weeks
M3 (2026-07-18) — Closed Beta start
 ↓ 12 weeks
M6 (2026-10-10) — Open Beta start
 ↓ 12 weeks
M9 (2027-01-02) — GA (paid launch)
 ↓ 12 weeks
M12 (2027-03-27) — Scale review
```

Total: 11 months from M0 to GA.

---

## 2. Phase 1 — Closed Alpha (M1 - M3)

### 2.1 Goal

> **P0 페르소나가 제품의 핵심 loop를 실제로 완주하는가를 검증.**

### 2.2 Entry Criteria (from Design Roadmap §07)

- [ ] Slice 1: Contract cleanup complete
- [ ] Slice 2: Durable state plane (shadow 7d, zero divergence)
- [ ] Slice 3: AI parser (schema compliance ≥95% on 50 samples)
- [ ] Slice 4: Save Setup canonical capture
- [ ] Slice 5: Split ledger records + migration clean
- [ ] Infra: observability + error tracking ready
- [ ] Legal: ToS + privacy policy + disclaimer 초안

### 2.3 User Onboarding

- **10-20 hand-picked alpha users**
- Selection criteria:
  - P0 persona match
  - 최근 3개월 active derivatives trading
  - 이미 CoinGlass or Hyblock 사용 중
  - 복기 습관 증거 (Telegram post, blog, or interview)
- Invitation: 1-on-1 30min onboarding call
- No pricing (free)
- Close Slack/Discord channel for feedback

### 2.4 Scope

**Only P0 features live**:
- Save Setup
- Pattern scanner (hardcoded library: 2-3 patterns)
- Durable state machine
- 기본 state_view + event_focus templates
- Verdict loop (5 categories)
- Basic ledger stats

**Excluded**:
- Team features
- Reranker (baseline sequence matcher만)
- LLM judge
- Advanced search templates
- Mobile (desktop only)
- Payment

### 2.5 Success Metrics

| Metric | Target | Kill |
|---|---|---|
| User activation (sign-up → first Save) | 80% | < 50% |
| D7 retention | 60% | < 30% |
| Verdict rate (capture → judgment 72h) | 40% | < 20% |
| Per-user WVPL | 1.5 | < 0.5 |
| Crash / error-free sessions | 95% | < 80% |
| P0 NPS [sample 15] | +30 | < -10 |

Kill 시 Slice 3-5 재설계 후 alpha restart.

### 2.6 Feedback Loops

- Weekly: 60min call with 3-5 alpha users (rotating)
- Daily: async feedback Slack channel
- Monthly: all-alpha survey
- **Feature flag system** to toggle WIP features per user

### 2.7 Exit Criteria (Alpha → Beta)

- [ ] NSM metrics above targets for 3 consecutive weeks
- [ ] No P0 bugs > 24h
- [ ] 5+ alpha users willing to act as beta reference
- [ ] 50+ verdicts in ledger (across alpha users)
- [ ] Reranker v1 trained (shadow mode)

---

## 3. Phase 2 — Closed Beta (M3 - M6)

### 3.1 Goal

> **제품이 P0 페르소나에게 paid-worthy한지 검증 + moat metric (verdict ledger) 축적.**

### 3.2 Entry Criteria

- [ ] Alpha exit criteria 달성
- [ ] Slice 6: Search engine stage 1+2 complete
- [ ] Slice 7: Visualization intent router (3 templates minimum)
- [ ] Slice 8: Verdict loop + refinement start
- [ ] Payment system integrated (Stripe)
- [ ] 초기 pricing decided (beta discount 50%)

### 3.3 User Onboarding

- **Invite-only, target 200 users**
- Sources:
  - Alpha users referrals (1-2 each)
  - Twitter/X waitlist (~500 sign-ups assumed)
  - Telegram crypto community ambassadors (2-3 key voices)
- **Paid** (beta discount: $14.50/mo vs $29 target)
- Onboarding: self-serve with video (5min) + 필요 시 office hours

### 3.4 Scope (전체 P0 + 일부 P1)

**Added**:
- All 6 visualization templates
- Search engine Stage 1+2 full
- Reranker v1 (shadow → primary after 2 weeks)
- Share capture via link
- Telegram alert push
- Mobile observe mode (responsive web)
- Personal variants (threshold override)

**Still excluded**:
- Team workspace
- LLM judge
- Auto-discovery

### 3.5 Pricing

| Tier | Beta price | Target GA price | Features |
|---|---|---|---|
| Free | $0 | $0 | 5 captures, 20 searches/day |
| Pro | $14.50/mo | $29/mo | Unlimited + personal variants |
| — | — | — | (Team tier not yet) |

Beta annual option: $99 (target $249) — "locked in for a year."

### 3.6 Success Metrics

| Metric | Target | Kill |
|---|---|---|
| Paid conversion rate | 15% | < 5% |
| D30 retention (paid) | 70% | < 40% |
| WAA | 100-150 | < 50 |
| Per-user WVPL | 3 | < 1 |
| MRR | $1-2K | < $500 |
| Support ticket rate | < 0.5/user/mo | > 1.5 |
| Reranker NDCG@5 gain | +0.03 | < 0 |

### 3.7 Exit Criteria (Beta → Open Beta)

- [ ] 100+ active paying users
- [ ] MRR $1.5K+
- [ ] Per-user WVPL ≥ 3
- [ ] NDCG@5 reranker gain confirmed
- [ ] 500+ verdicts accumulated
- [ ] Onboarding completion > 60% (self-serve)
- [ ] 1 positive press mention OR 3 positive community reviews

---

## 4. Phase 3 — Open Beta (M6 - M9)

### 4.1 Goal

> **Public access로 acquisition funnel 검증 + scale operations 준비.**

### 4.2 Entry Criteria

- [ ] Closed beta exit criteria 달성
- [ ] Slice 9: Reranker promoted to primary
- [ ] Slice 10: Personal variants stable
- [ ] Marketing site + pricing page 완성
- [ ] Support team (at least 1 part-time)
- [ ] Incident response playbook
- [ ] Data backup / disaster recovery tested

### 4.3 User Onboarding

- **Public signup with waitlist throttling**
- Batches of 200-500 per week
- Target: 1000-1500 active users by end of phase
- Referral program: 1 month free per invite (both sides)

### 4.4 Scope (전체 P0 + P1 대부분)

**Added**:
- Compare view template
- Flow view template
- Execution view template
- Telegram alert push
- Push notifications (web push)
- Pattern decay monitor
- Refinement proposal UI
- Multi-exchange data (Bybit read-only start)

**First team pilot**:
- 3-5 design partner teams (free)
- Feedback → Team tier design

### 4.5 Pricing

| Tier | Price | Features |
|---|---|---|
| Free | $0 | 5 captures, 20 searches/day, baseline search |
| Pro | $29/mo | Unlimited, personal variants, Telegram alerts |
| Pro Annual | $249 | 28% discount |
| Team Pilot | Free (design partner) | Shared library (limited) |

### 4.6 Marketing / Content

- Weekly blog post (pattern research education)
- Twitter/X presence (@cogochi)
- 1 podcast per month (crypto trading podcasts)
- Telegram community channel (growing)
- Open-sourced small tool (e.g. pattern draft JSON schema on GitHub)

### 4.7 Success Metrics

| Metric | Target | Kill |
|---|---|---|
| WAA | 600-800 | < 300 |
| Paid conversion | 5% | < 2% |
| MRR | $10-15K | < $3K |
| D30 retention (paid) | 75% | < 50% |
| Per-user WVPL | 4 | < 2 |
| Organic signup / referral | 50% | < 20% |
| CAC | < $70 | > $150 |
| LTV (estimated) | $350 | < $150 |
| LTV/CAC | 5× | < 2× |

### 4.8 Exit Criteria (Open Beta → GA)

- [ ] 500+ paying users
- [ ] MRR $12K+
- [ ] Churn < 10% monthly
- [ ] LTV/CAC ≥ 3×
- [ ] Support SLA p95 < 24h
- [ ] Uptime 99.5%+ for 8 weeks
- [ ] Team tier spec finalized based on pilot feedback
- [ ] Legal review complete

---

## 5. Phase 4 — GA (M9+)

### 5.1 Goal

> **상업적 운영 + team tier launch + sustained growth.**

### 5.2 Entry Criteria

- [ ] Open Beta exit criteria 달성
- [ ] Team workspace feature complete
- [ ] Billing system robust (invoices, refunds, tax handling)
- [ ] Customer success process (onboarding for team, training)
- [ ] 24h support during business hours
- [ ] Security audit complete
- [ ] SOC2 Type 1 초기 준비 시작 (선택)

### 5.3 Scope (Full P0 + P1 전부 + 초기 P2)

**Added**:
- Team workspace full
- Shared pattern library with versioning
- Role-based permissions
- Team performance dashboard
- Pattern candidate review workflow
- LLM judge (stage 4) pilot
- Bybit/OKX data full
- API preview (P2 persona design partner)

### 5.4 Pricing

| Tier | Price | Features |
|---|---|---|
| Free | $0 | 5 captures, 20 searches/day |
| Pro | $29/mo | Full individual |
| Pro Annual | $249 | 28% off |
| Team Starter | $199/mo (3 seats) | Shared library, limited |
| Team Pro | $499/mo (10 seats) | Full team + priority |
| Team Enterprise | Custom | On-premise, SSO, SLA |
| API Preview | $99/mo | Rate-limited API access |

### 5.5 Marketing Scale

- Paid acquisition start (budget $5-10K/mo)
- Content marketing (2 posts/week)
- Partnership: 2-3 crypto education platforms
- YC application if applicable (timing Q2-Q3)
- Conference presence (e.g. Korea Blockchain Week)

### 5.6 Success Metrics (12 months post-GA)

| Metric | Target |
|---|---|
| WAA | 3,000-5,000 |
| Paid users | 1,500+ |
| MRR | $80K+ |
| Paying teams | 30-50 |
| ARR | $1M+ |
| Monthly churn | < 7% |
| NRR (net revenue retention) | > 100% |

---

## 6. Go/No-Go Checklists

### 6.1 Closed Alpha → Closed Beta

- [ ] 15+ alpha users retained through 6 weeks
- [ ] Core loop metrics above kill line
- [ ] Engine stability (uptime 99%+ during alpha)
- [ ] Payment system live
- [ ] Pricing validated with 5 user interviews
- [ ] No P0 bugs open
- [ ] Privacy/security basics checklist

### 6.2 Closed Beta → Open Beta

- [ ] 100+ paying users
- [ ] Conversion rate ≥ 10%
- [ ] Reranker working (NDCG gain confirmed)
- [ ] Self-serve onboarding video done
- [ ] Support playbook ready
- [ ] Incident response tested

### 6.3 Open Beta → GA

- [ ] 500+ paying users
- [ ] MRR $12K+
- [ ] Churn < 10%
- [ ] Team tier feature complete
- [ ] Legal review done (ToS, privacy, regulatory)
- [ ] Security audit done
- [ ] On-call rotation established

---

## 7. Launch Channels & Tactics

### 7.1 Channels by Phase

| Phase | Primary | Secondary | Tertiary |
|---|---|---|---|
| Alpha | 1-on-1 outreach | — | — |
| Closed Beta | Referrals + Twitter waitlist | Telegram key voices | 1 podcast |
| Open Beta | Organic + referral | Content marketing | Community partners |
| GA | Paid + content | Partnerships | Conferences |

### 7.2 Twitter/X Strategy

- Alpha: invite-only posts (exclusivity)
- Closed Beta: "This is what we're building" — screenshots, testimonials
- Open Beta: educational threads (pattern research, derivatives thinking)
- GA: customer stories, feature launches

Target: 5K followers by Open Beta, 15K by GA.

### 7.3 Content Pillars

1. **Pattern Education** — "How TRADOOR/PTB pattern works"
2. **Engine Behind** — technical deep-dives (developer audience)
3. **Verdict Ledger Insights** — "What 1000 verdicts taught us"
4. **Team Use Cases** — B2B angle
5. **Anti-copy-trading** — positioning content

### 7.4 PR Targets (M6+)

- CoinDesk / The Block (crypto native)
- Fortune / Bloomberg (Surf did this, possible template)
- Podcasts: Bankless, Empire, Unchained, Korean crypto podcasts
- YC launch (if accepted, Q2 2027 batch)

---

## 8. Risk Register (Launch-specific)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Alpha users churn in week 2 | Medium | High | 1-on-1 weekly call, rapid iteration |
| Beta→OB low conversion | Medium | High | Onboarding flow test, pricing A/B |
| Surf launches competing feature | Medium | High | Accelerate sequence matcher moat |
| Regulatory scare (SEC, KR FSC) | Low | High | Non-advisory disclaimer strong |
| Infra cost spike | Low | Medium | Rate limits, tier enforcement |
| Negative community review (Twitter storm) | Medium | Medium | Community management, rapid response |
| Key alpha user drops | Medium | Medium | Replace with 2 waitlist users |
| Payment provider issue (Stripe holds) | Low | High | Backup: Lemon Squeezy |

---

## 9. Launch Day (Open Beta) Checklist

T-30 days:
- [ ] Marketing site copy finalized
- [ ] Pricing page tested
- [ ] Onboarding video recorded
- [ ] Legal docs live
- [ ] Support docs (help center) 20+ articles
- [ ] Sample patterns pre-loaded
- [ ] Telegram/X community threads ready

T-7 days:
- [ ] Load testing (200 concurrent users minimum)
- [ ] Incident response runbook reviewed
- [ ] Backup verified
- [ ] Error tracking alerts configured
- [ ] Launch blog post draft
- [ ] PR outreach started (embargoed)

T-1 day:
- [ ] Beta users → Pro migration (grandfather discount)
- [ ] Waitlist early access email (12h before public)

Launch day:
- [ ] Blog post live
- [ ] Twitter thread pinned
- [ ] Telegram announcement
- [ ] Product Hunt (optional, Tuesday recommended)
- [ ] On-call rotation active
- [ ] Support channel monitored

T+7 days:
- [ ] Post-launch review (metrics vs target)
- [ ] Press mentions tracked
- [ ] Churn analysis (first week churners 인터뷰)
- [ ] Roadmap adjust if needed

---

## 10. Communications Plan

### 10.1 Internal

- Weekly all-hands (30min)
- Slack #launches channel
- Milestone retrospectives

### 10.2 External — User

- Beta invite email
- Monthly product updates (email)
- Launch day announcement
- Feature launch threads (Twitter)
- Community digest (Telegram weekly)

### 10.3 External — Investors (if raising)

- Monthly investor update email
- Quarterly video call
- Data room: MRR, WAA, retention, cohorts

---

## 11. Pricing Validation Plan

Pricing은 사전에 pre-decide하지 않고 validation한다.

### 11.1 Alpha Phase

- Free, no pricing hints
- Exit interview: "얼마 받아야 제품이 fair해?"
- Data: 중앙값 response

### 11.2 Closed Beta

- $14.50/mo (50% discount)
- A/B test: $14.50 vs $19 vs $29
- Target: 10-15% conversion
- Learn: price elasticity

### 11.3 Open Beta

- $29/mo standard
- Annual discount test ($249 vs $299)
- Team pilot pricing collected (anchoring)

### 11.4 GA

- Individual: $29 Pro confirmed
- Team: $199 starter, $499 pro (based on pilot)
- Possibly increase if demand strong

---

## 12. Retention Playbook (per phase)

### Alpha → Beta

- Personal outreach to dropouts
- Feature request fast-track
- "Founders' week" (weekly 30min office hours)

### Beta → Open Beta

- Onboarding series (3 emails over 14 days)
- Week 2 check-in email
- Inactive user re-engagement (day 30)

### Open Beta → GA

- Automated onboarding flow
- In-app tooltips / feature discovery
- Churn intervention: cancel flow with feedback
- Win-back campaign (after cancel, 30 day)

---

## 13. What We WON'T Do at Launch

- ❌ Aggressive discounting (cheapens product perception)
- ❌ "Free forever" promises
- ❌ Growth hack tricks (referral loops가 product-first)
- ❌ Pay for influencer posts without product fit
- ❌ Over-promise features not shipped
- ❌ Launch without incident playbook
- ❌ ProductHunt launch without beta users ready to upvote (falls flat)
- ❌ Crypto native pump content ("Get rich")

---

## 14. Post-GA Roadmap (M12+)

After GA stable:

### Track A: Team & Enterprise expansion
- SSO, audit logs, on-premise option
- Customer success team
- Sales team (2-3 reps)

### Track B: API & Developer ecosystem
- Public API docs
- SDK (Python, TypeScript)
- Webhooks
- Integration partners (TradingView, Pine Script?)

### Track C: Advanced AI features
- LLM judge production-grade
- Chart interpreter
- Personal LoRA adapters for Pro Plus tier
- Auto-discovery agent

Pick ONE. All three spreads focus.

---

## 15. Kill Criteria (제품 레벨)

Launch가 실패했다고 판단할 기준.

| Stage | Kill If |
|---|---|
| Alpha | NPS ≤ -10 OR retention D7 < 30% |
| Closed Beta | Conversion < 5% OR per-user WVPL < 1 |
| Open Beta | MRR < $3K at end of phase |
| GA | Churn > 20% monthly for 2 months OR LTV/CAC < 1.5× |

Kill 시 검토:
- Positioning 재정의
- Persona pivot (P1 → P0로?)
- Feature 축소
- 최악: 프로젝트 종료

---

## 16. Budget (rough)

[estimate, will need fundraising or bootstrap decision]

### Pre-GA (11 months)

| Cost | Monthly | Total |
|---|---|---|
| Infra (Vercel, Postgres, LLM) | $500 → $3K | $15K |
| Tools (Stripe, monitoring, design) | $500 | $5K |
| Salary (2 FTE) | $10-15K | $120K |
| Marketing pre-GA | $1K | $10K |
| Legal / accounting | — | $5K |
| **Total** | — | **$155K** |

### Post-GA (next 12 months)

| Cost | Monthly | Total |
|---|---|---|
| Infra scale | $5-10K | $90K |
| Salary (4-5 FTE) | $25-35K | $360K |
| Marketing | $5-10K | $90K |
| Ops | $2K | $24K |
| **Total** | — | **~$564K** |

Target revenue Y2: $1M+ ARR → cash flow positive possible at $80K MRR.

---

## 17. Decision Log

| Decision | Rationale |
|---|---|
| 4-phase gated launch | Validate before scale |
| Paid beta (not free) | Filter seriousness + validate WTP |
| Korea/Asia first | P0 concentration + language |
| Team tier at GA only | P0 validate 먼저 |
| No PH launch until OB | Need fan base ready |
| Bootstrap-friendly budget | Fundraise as option, not necessity |
| API tier last | P2 lowest priority |

---

## 18. 한 줄 요약

> **Closed Alpha (10명) → Closed Beta (200 paid) → Open Beta (1000 paid) → GA (with team tier). 각 phase는 정량 gate로 열리고, kill criteria는 사전 정의.**
> **목표: 11개월 내 GA, M12 MRR $80K+, ARR $1M+.**
