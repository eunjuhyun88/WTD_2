# 04 — Success Metrics (NSM + Input Metrics)

**버전**: v1.0 (2026-04-25)
**상태**: canonical
**의도**: 제품 성공을 정량화하고 측정 불가능한 성공 주장을 차단한다

---

## 0. 원칙

### 0.1 NSM은 딱 하나

여러 metric이 동률로 중요하면 사실상 NSM이 없는 것이다. 하나만 고른다.

### 0.2 Input metrics는 NSM을 선행한다

NSM은 후행 지표. Input metrics는 NSM을 만든다. Input이 먼저 움직여야 NSM이 따라온다.

### 0.3 모든 metric에는 kill criteria

"이 숫자 이하면 해당 slice/track 중단"을 사전에 정한다.

### 0.4 Vanity metric 금지

- ❌ "누적 회원 수"
- ❌ "총 page view"
- ❌ "AI가 처리한 쿼리 수"
- ✅ "주간 verdict 제출 수"

활동이 아니라 **가치 발생**을 잰다.

---

## 1. North Star Metric (NSM)

### 1.1 선정

> **Weekly Verified Pattern Loops (WVPL)**

정의:

> "한 유저가 한 주 동안 완료한 `capture → outcome → verdict` 전체 사이클 수"

한 WVPL = 유저가:
1. Save Setup으로 capture 저장 (or 시스템이 candidate 생성)
2. 72h 또는 outcome window가 닫힘
3. 유저가 VALID/INVALID/NEAR_MISS/TOO_EARLY/TOO_LATE 중 하나 제출

### 1.2 왜 이게 NSM인가

- **moat 직결**: verdict 데이터가 쌓여야 reranker 개선, personal variant 생성
- **engagement 진지함**: 단순 view가 아니라 72h 후 재방문 + 판단
- **제품 본질 반영**: capture만이 아니라 loop closure
- **scaleup 의미 있음**: 10배 하려면 파이프라인 전체가 건강해야 함

### 1.3 왜 다른 metric이 아닌가

| 후보 | 왜 NSM 아닌가 |
|---|---|
| WAU (weekly active users) | 활동만 측정, 가치 측정 안 함 |
| Captures per user | 저장은 쉬움. Verdict가 어려움 |
| Revenue / MRR | 후행 지표, product market fit의 결과지 원인 아님 |
| Retention (D7/D30) | 이미 input metric. NSM으로 너무 광범위 |
| Search queries | 가치 불명확, bot-like behavior 포함 |
| Accuracy / hit rate | 시장 regime에 의존, 유저 행동 아님 |

### 1.4 Target

| Milestone | Target WVPL per user | Total WVPL (weekly) |
|---|---|---|
| M1 (internal alpha) | 2 | ~100 (50 alpha users) |
| M3 (closed beta) | 3 | ~600 (200 WAA) |
| M6 (open beta) | 4 | ~3200 (800 WAA) |
| M12 (GA scale) | 5 | ~25000 (5000 WAA) |

Formula: `Total WVPL = WAA × WVPL per user`

### 1.5 Kill Criteria

- M3 기준 per-user WVPL < 1.0 → **제품 재설계**
- M6 기준 total WVPL < 1500 → **positioning kill**

---

## 2. Input Metrics (NSM을 만드는 선행 지표)

### 2.1 Activation Funnel

```
Land → Sign-up → First Capture → First Search → First Verdict → Retained
```

각 transition에 rate 측정.

| Metric | M1 | M3 | M6 |
|---|---|---|---|
| Landing → Sign-up | 2% | 4% | 6% |
| Sign-up → First Capture (D1) | 40% | 55% | 65% |
| First Capture → First Search (D3) | 60% | 75% | 80% |
| First Search → First Verdict (W1) | 25% | 40% | 55% |
| W1 Verdict → W4 Active | 30% | 50% | 65% |

### 2.2 Engagement

| Metric | M1 | M3 | M6 |
|---|---|---|---|
| Weekly Active Analysts (WAA) | 50 | 200 | 800 |
| Sessions per WAA per week | 3 | 4 | 5 |
| Avg session length (min) | 15 | 22 | 28 |
| Captures per WAA per week | 2 | 3 | 4 |
| Searches per WAA per week | 5 | 8 | 12 |
| Verdicts per WAA per week | 1 | 2.5 | 4 |
| Mode transitions per session | 2 | 3 | 4 |

### 2.3 Loop Closure Quality

Loop 파편화 측정.

| Metric | M1 | M3 | M6 |
|---|---|---|---|
| Capture → entry promotion rate | 30% | 45% | 55% |
| Entry → verdict rate (72h window) | 20% | 35% | 50% |
| Auto-outcome agreement with user | — | 70% | 80% |
| Verdict comment rate | 15% | 25% | 35% |

### 2.4 Search Quality

| Metric | M1 | M3 | M6 |
|---|---|---|---|
| Manual eval hit@5 | 40% | 55% | 70% |
| Stage-2 latency p95 | 3s | 2s | 1.5s |
| Reranker NDCG@5 vs baseline | — | +0.03 | +0.05 |
| User clicks on result (CTR) | 20% | 35% | 50% |
| "Mark as similar" / "Not similar" ratio | — | 3:1 | 5:1 |

### 2.5 AI Quality

| Metric | M1 | M3 | M6 |
|---|---|---|---|
| Parser schema compliance | 90% | 95% | 98% |
| Parser avg confidence | 0.65 | 0.75 | 0.82 |
| Parser retry rate | 20% | 10% | 5% |
| Parser avg latency | 3s | 2s | 1.5s |
| Parse → saved candidate rate | 50% | 65% | 75% |

### 2.6 Revenue

| Metric | M3 | M6 | M12 |
|---|---|---|---|
| Free → Pro conversion | 3% | 5% | 8% |
| MRR | $1K | $15K | $80K |
| ARPU (paid) | $29 | $35 | $45 |
| Churn (monthly) | 15% | 10% | 7% |
| LTV (Pro tier) [estimate] | $200 | $350 | $640 |
| CAC [estimate] | $50 | $70 | $100 |
| LTV/CAC | 4× | 5× | 6.4× |

### 2.7 Team Tier (Phase 2)

| Metric | M6 | M12 |
|---|---|---|
| Paying teams | 10 | 50 |
| Avg seats per team | 4 | 6 |
| Team MRR | $3K | $25K |
| Team churn (quarterly) | 20% | 10% |

---

## 3. Guardrail Metrics (악화되면 안 되는 것)

NSM을 쫓다가 건강 해치면 안 됨.

| Metric | Limit | Alert |
|---|---|---|
| Infra cost per WAA | $8/mo | > $12 |
| Avg request latency p95 | 2s | > 5s |
| Error rate | 0.5% | > 2% |
| Support tickets per WAA | 0.3/mo | > 1.0 |
| AI hallucination reports | 0.1/WAA/week | > 0.5 |
| Payment failure rate | 2% | > 5% |
| False positive alert rate | 15% | > 30% |
| User-reported "spam" alerts | 0.2/WAA/week | > 1.0 |

Guardrail 위반 시 NSM 성장보다 우선 처리.

---

## 4. Measurement Plan

### 4.1 Data Pipeline

```
Client events → Segment/PostHog → warehouse
Engine events → OpenTelemetry → warehouse
DB snapshots → dbt → metric tables
```

일간 dashboard + 주간 review.

### 4.2 Event Schema

핵심 event (canonical):

```
user.signed_up
capture.created
capture.feature_attached
search.submitted (intent, query_hash)
search.result_clicked
entry.created (via state machine)
entry.outcome_computed (auto_verdict)
verdict.submitted (user_verdict, comment_present)
session.started / ended
mode.switched
pattern.candidate.submitted
pattern.candidate.approved
alert.sent / clicked / dismissed
parser.called (attempts, latency, confidence)
refinement.proposal_generated
```

각 event는 user_id, session_id, timestamp, properties 포함.

### 4.3 KPI Ownership

| Metric Area | Owner |
|---|---|
| NSM (WVPL) | PM / CEO |
| Activation | Growth |
| Engagement | Product |
| Loop Closure | Product + Engine |
| Search Quality | Research Agent |
| AI Quality | Research Agent |
| Revenue | Growth + CEO |
| Guardrails | Engine + Ops |

주간 review에서 owner가 발표.

---

## 5. Review Cadence

| Cadence | Who | What |
|---|---|---|
| Daily | PM + Eng | Yesterday's NSM + guardrail alerts |
| Weekly | Full team (30min) | NSM trend + input metric deltas + 1 insight |
| Monthly | Leadership (60min) | Milestone check + kill criteria review |
| Quarterly | All hands | Roadmap adjustment based on metrics |

---

## 6. Leading vs Lagging Map

NSM 움직이기 전에 어떤 input이 움직여야 하는가.

```
W -3: Search Quality ↑ (hit@5)
W -2: First Search rate ↑
W -1: First Verdict rate ↑
W  0: WVPL ↑ (NSM)
W +1: Retention W4 ↑
W +2: MRR ↑
W +3: LTV ↑
```

따라서 search quality가 먼저 움직여야 전체 funnel이 따라온다.

---

## 7. Persona-specific Metrics

P0 vs P1 분리 측정.

### 7.1 P0 (개인 프로)

| Metric | Target M3 | Target M6 |
|---|---|---|
| P0 sign-up (from landing filter) | 70% | 75% |
| P0 D7 retention | 55% | 65% |
| P0 monthly retention | 70% | 80% |
| P0 WVPL per user | 3 | 5 |
| P0 Pro conversion | 5% | 8% |

### 7.2 P1 (팀 리서처)

| Metric | Target M6 | Target M12 |
|---|---|---|
| Team pilot sign-ups | 20 | 80 |
| Pilot → paid conversion | 30% | 50% |
| Team seats retained at 3m | 70% | 85% |
| Patterns shared per team per week | 3 | 8 |
| Team-verdict coverage rate | 40% | 60% |

### 7.3 P2 (quant/API)

| Metric | Target M12 |
|---|---|
| API signup count | 300 |
| Active API keys | 80 |
| API MRR | $10K |

---

## 8. Competitive Benchmark (reference)

| Competitor | Estimated MRR | Time to reach |
|---|---|---|
| CoinGlass | $500K+ [estimate] | ~3 years |
| Hyblock | $200K-500K [estimate] | ~2 years |
| Surf.ai | $1M+ ARR reported | 1 year (VC funded) |
| TrendSpider (crypto segment) | $300K+ [estimate] | ~4 years |

Cogochi target: M12 MRR $80K → Surf 정도 8-10% scale. Realistic given niche focus.

---

## 9. Dashboards to Build

### 9.1 Executive dashboard

- Current WVPL (today/week/month)
- Funnel conversion rates
- MRR growth
- Top guardrail violations

### 9.2 Product dashboard

- Feature usage heat
- Cohort retention
- Search quality trend
- Parser metric trend

### 9.3 Research dashboard

- Ledger growth
- Pattern lifetime hit rate
- Regime-conditioned performance
- Negative set size
- Reranker vs baseline A/B

### 9.4 Engineering dashboard

- Latency p50/p95/p99
- Error rate by service
- State conflict rate
- Scan cycle completion rate
- Cost per WAA

---

## 10. Experiment Framework

각 hypothesis 테스트는 정형 format.

```yaml
experiment_id: exp_007
hypothesis: "LLM judge 노출 시 CTR +10%"
primary_metric: search.result_clicked rate
guardrails:
  - avg_latency_p95 < 5s
  - cost_per_query < $0.05
variant_a: baseline (no judge)
variant_b: judge enabled
sample_size_required: 500 per variant
duration: 14 days
success_criteria:
  primary: +5%p at p<0.05
  secondary: NDCG@5 +0.02
decision: ship if success & guardrails hold
```

---

## 11. Q&A on Metrics

**Q: 왜 MRR이 NSM이 아닌가?**
A: 매출은 결과. 그 전에 verdict loop가 건강해야 유저가 paid로 전환한다. Paid 전환은 output이 아니라 byproduct.

**Q: 왜 WAA 대신 WVPL인가?**
A: Active는 활동 기준. Crypto 유저는 하루 수십 번 탭 열 수 있지만 verdict는 안 낸다. Verdict가 가치의 증거.

**Q: 월 아니라 주 단위로 하는 이유?**
A: Loop가 72h 기준. 주간이면 1-2 loop 돌 수 있다. 월간은 너무 느려서 제품 변경 시 feedback 늦어짐.

**Q: 사용자 N 너무 작은 초기에 metric 의미 있나?**
A: Conversion rate는 의미. 절대 수는 trend만 본다. p-value 타이트하게 잡기보다 directional 해석.

**Q: A/B test 얼마나 자주 할 수 있나?**
A: 월 2-3개 이상은 간섭. Holdout 20% 유지. Major UI 변경은 순차 rollout.

---

## 12. What Not to Measure

- 총 사용자 수 (signup but never active 포함)
- AI가 생성한 단어 수
- 차트 view 수 (쉽게 game 가능)
- Vanity social metrics (Twitter followers 등)
- 평균 세션 시간만 (짧아도 가치 높을 수 있음)

---

## 13. 한 줄 요약

> **NSM = Weekly Verified Pattern Loops. Capture 저장 + 72h 후 판정까지 완성된 사이클.**
> **NSM을 만들려면 search quality → first verdict rate → retention이 순서대로 움직여야 한다.**
