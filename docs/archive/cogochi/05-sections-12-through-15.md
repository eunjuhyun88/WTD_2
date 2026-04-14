## § 12. Journey State Machine

```
no-agent     → /create
  ↓ DOUNI created
no-pattern   → /terminal (guided: "save your first pattern")
  ↓ first pattern saved
scanning     → /terminal + /scanner (waiting for alerts)
  ↓ first feedback ✓/✗
active       → /terminal full experience
```

**Gated pages:**

| State | /terminal | /scanner | /lab | /market |
|---|---|---|---|---|
| no-agent | 🔒 | 🔒 | 🔒 | 🔒 |
| no-pattern | ✅ guided | 🔒 "save pattern first" | 🔒 "no data yet" | 🔒 |
| scanning | ✅ | ✅ | 🔒 "no feedbacks yet" | 🔒 |
| active | ✅ | ✅ | ✅ | 🔒 Phase 2 |

---

## § 13. Pricing & Plan Gates

| Plan | Price | Patterns | Symbols | Sessions/day | AutoResearch | Telegram | Notes |
|---|---|---|---|---|---|---|---|
| **FREE** | $0 | 3 | 5 | 3 | 1/month | ❌ | Alpha access via waitlist |
| **PRO** | $19/mo | ∞ | all | ∞ | weekly auto + manual | ✅ | GPU credits $2/run for extra |
| **Phase 2 Take Rate** | — | — | — | — | — | — | 15% on Market listings |

**Upgrade touchpoints:**
1. 패턴 3개 소진 → "Pro면 무제한"
2. 오늘 세션 3회 소진 → "내일 기다릴래, Pro 할래?"
3. 이번 달 AutoResearch 완료 → "피드백 30개 쌓였는데, 다음 달에..."

---

## § 14. Kill Criteria (published publicly on home page)

| Name | Threshold | Action |
|---|---|---|
| **H1 FAIL** | val Δ ≈ 0 after 2 retries | Pause fine-tune · redesign patterns or FIXED_SCENARIOS |
| **FEEDBACK DRY** | < 20 feedbacks in 2 weeks | Rethink scanner precision / pattern definitions / Telegram UX |
| **DEPLOY GATE** | new val < baseline + 2%p | Auto rollback to previous adapter |
| **REGRESSION** | any val hit-rate drop > 3%p after deploy | Immediate adapter revert · log incident |

**Product-level kill:**

- Scanner alert click-through rate < 30% at M3 → redesign scanner
- First-pattern-save completion < 30% at M3 → redesign onboarding
- WAA < 140 at M3 → rethink target persona or core loop

---

## § 15. Metrics (NSM + Inputs)

**NSM (North Star):** Weekly Completed Analysis Sessions

- Definition: (Terminal analysis completed → verdict submitted → result confirmed) + (Scanner alert received → chart viewed → ✓/✗ submitted)
- M3 target: 500 sessions/week
- Kill: < 140/week

**Input metrics (M3 targets):**

| # | Metric | Target |
|---|---|---|
| I1 | WAA (Weekly Active Analysts) | 200 |
| I2 | Sessions per WAA | 2.5 |
| I3 | Scanner alert feedback rate | ≥ 30% |
| I4 | D7 retention | ≥ 30% |
| I5 | Avg pattern hit-rate delta (before vs after AutoResearch) | ≥ +5%p |

---

