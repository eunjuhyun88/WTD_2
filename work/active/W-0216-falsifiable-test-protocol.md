# W-0216 — Falsifiable Test Protocol (F1~F4 Measurement Plan)

**Owner:** research
**Status:** Ready (PRD only, measurement starts after V-00 + V-02 ready)
**Type:** Measurement protocol — kill criteria for W-0214 MM Hunter framing
**Depends on:** W-0214 v1.3 D1~D8 LOCKED-IN, W-0215 V-00 audit, V-02 phase_eval
**Estimated effort:** 1 day PRD + ongoing measurement (Week 1~6)

---

## 0. 한 줄 요약

W-0214 §1.5의 Falsifiable Kill Criteria F1~F4를 **언제 / 무엇을 / 어떤 데이터로 / 어떤 임계로** 측정할지 명문화. 하나라도 깨지면 system frame 자체 재설계.

## 1. Goal

W-0214 D1~D8 lock-in이 falsifiable하게 유지되도록:
1. F1~F4 각각의 **측정 시점, 데이터 소스, 통계 임계, 실패 시 escalation** 절차를 lock-in
2. measurement code stub (`engine/research/validation/falsifiable_kill.py`)을 W-0218 후속 work item으로 분리 가능하게 spec
3. Week 1~6 일정에 측정을 박아서 후속 work item이 이를 skip 할 수 없게 함

## 2. Owner

research (CTO + AI Researcher 공동 sign-off 필수 — 이 PRD가 product 폐기/pivot 결정의 trigger)

## 3. Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `work/active/W-0216-falsifiable-test-protocol.md` | new | 본 PRD |
| `work/active/W-0214-mm-hunter-core-theory-and-validation.md` | edit (§9 Risk → reference W-0216) | F1~F4 구체 측정은 본 PRD로 위임 |
| `engine/research/validation/falsifiable_kill.py` | (W-0218 후속) | 본 PRD에서는 spec만, 코드 X |
| `memory/decisions/dec-2026-04-27-falsifiable-kill-protocol.md` | new (선택) | F1~F4 lock-in 결정 record |

## 4. Non-Goals

- ❌ 코드 작성 (PRD only — `engine/research/validation/` 신규 파일 X)
- ❌ F1~F4 외 추가 falsifiable test 발굴 (W-0214 §1.5 4개로 한정)
- ❌ 임계값을 deadline 앞두고 retroactively 조정 (lock-in 후 변경은 ADR 필수)
- ❌ Falsifiable 통과 시 마케팅 메시지 작성 (별도 work item)

## 5. Exit Criteria (이 PRD 완료 조건)

```
[ ] F1~F4 각각 다음 6개 컬럼 채워짐: ID / Hypothesis / Measurement / Data Source / Threshold / Escalation
[ ] Week 1~6 측정 일정표 작성 (어떤 week에 어떤 F가 측정 가능 상태가 되는지)
[ ] Kill threshold 위반 시 escalation 절차 (누구에게, 무엇을, 어떻게 보고)
[ ] Out-of-band rescue 절차 (false positive 의심 시 재측정 protocol)
[ ] CTO + AI Researcher 양측 sign-off (commit author note)
[ ] W-0214 §1.5에서 본 PRD reference 추가 (단일 commit)
```

## 6. Falsifiable Kill Criteria — 4종 상세

### 6.1 F1 — t-stat ≥ 2.0 통과율

| 필드 | 값 |
|---|---|
| **Hypothesis** | 53개 PatternObject 중 5개 P0 패턴이 phase-conditional t-test (BH 보정 후) 통과 |
| **Measurement** | M1 (W-0214 §3.2 Phase-conditional Forward Return). Welch's t-test, BH-corrected p-value |
| **Data source** | Binance perp 1h bar, 1년 holdout. `feature_windows` table (Supabase) + `pattern_outcomes` |
| **Sample size** | 5 P0 patterns × 3 horizons (1h/4h/24h) = 15 tests minimum |
| **Threshold (PASS)** | 5 P0 패턴 중 **≥1개**에서 directional_belief="long_entry" phase t ≥ 2.0 (BH p < 0.05) |
| **Threshold (KILL F1)** | 5 P0 패턴 모두 t < 2.0 (또는 BH p ≥ 0.05) → **0% pass rate** |
| **When** | Week 1 종료 시점 (V-00 audit + V-01 PurgedKFold + V-02 phase_eval ready 후) |
| **Escalation** | F1 fail 시: ① CTO + AI Researcher 즉시 호출 ② W-0214 §1 Core Theory 재검토 ADR 작성 ③ 5 P0 패턴 선정 자체가 잘못이었는지 / 측정 protocol bug인지 분리 진단 |
| **False positive guard** | 통과율 0%일 때만 KILL. 1개 통과 시 PASS. **5개 모두 t < 2.0** 도 5번 재측정 후 confirm (random seed 변경) |
| **Status** | ⏳ Pending (V-02 ready 후 측정 가능) |

#### 6.1.a F1 측정 의사코드

```python
# engine/research/validation/falsifiable_kill.py (W-0218 후속)
def measure_F1(p0_patterns: list[str], horizons: list[int]) -> F1Result:
    results = []
    for pattern_id in p0_patterns:  # 5 patterns
        for h in horizons:  # [1, 4, 24]
            t, p = phase_eval.run(pattern_id, horizon=h)  # M1 wrapper
            p_bh = bh_correct(p, n_tests=len(p0_patterns) * len(horizons))
            results.append({"pattern": pattern_id, "h": h, "t": t, "p_bh": p_bh})
    pass_count = sum(1 for r in results if r["t"] >= 2.0 and r["p_bh"] < 0.05)
    pass_rate = pass_count / len(results)
    return F1Result(pass_rate=pass_rate, kill=(pass_count == 0), details=results)
```

### 6.2 F2 — Verdict accuracy ↔ forward return correlation

| 필드 | 값 |
|---|---|
| **Hypothesis** | 유저의 5-cat verdict (valid/invalid/missed/too_late/unclear)와 시스템의 forward return label 사이에 양의 상관 |
| **Measurement** | Spearman rank correlation between (valid=2 / unclear=1 / invalid=0) ordinal verdict and forward_return_4h |
| **Data source** | `verdicts` table (user verdict) + `pattern_outcomes` (forward return) joined on capture_id |
| **Sample size** | ≥ 200 verdict-outcome pairs 모인 후 (Wave 2 F-02 5-cat verdict UI 가동 후) |
| **Threshold (PASS)** | Spearman ρ ≥ 0.20 (p < 0.05) |
| **Threshold (KILL F2)** | Spearman ρ < 0.20 OR p ≥ 0.05 OR ρ < 0 (역 상관) |
| **When** | Week 2 종료 시점 (5-cat verdict UI는 이미 main 머지됨, 데이터 누적 진행) |
| **Escalation** | F2 fail 시: ① subjective evidence vs objective evidence 분리 ADR 작성 ② F-60 gate Layer A vs Layer B 가중치 재설계 ③ user education 부족인지 / 시스템 phase 정의가 user 직관과 불일치인지 진단 |
| **False positive guard** | n < 200이면 측정 보류. n ≥ 200 + bootstrapping 1000 iter로 ρ CI 계산 |
| **Status** | ⏳ Pending (verdict 누적 진행 중) |

### 6.3 F3 — 유저당 30일 PatternObject 생성률

| 필드 | 값 |
|---|---|
| **Hypothesis** | 활성 유저는 평균 30일에 1개 이상의 PatternObject (capture → draft → publish) 생성 |
| **Measurement** | active_users 30d 동안 published_pattern_count / active_user_count |
| **Data source** | `users` (last_active ≤ 30d 필터) + `patterns` (created_by, status='published', created_at 30d 내) |
| **Sample size** | 활성 유저 ≥ 20명 (founder seeding 11→61 후 실유저 추가 가정) |
| **Threshold (PASS)** | 평균 ≥ 1.0 / 30d, median ≥ 1.0 |
| **Threshold (KILL F3)** | 평균 < 0.5 / 30d (즉 60일 이상에야 1개) → "hunter persona" 전제 깨짐 |
| **When** | Week 4 종료 시점 (실유저 데이터 누적 후, founder + 외부 베타 유저 합산) |
| **Escalation** | F3 fail 시: ① "user as MM hunter" framing이 retail trader 행동과 불일치 ② input UX 너무 어려운지 / phase 정의가 user 직관과 안 맞는지 ③ Wyckoff 4단계 default가 너무 복잡할 가능성 (D8 재검토) |
| **False positive guard** | active_users 정의 명확화 (last_login ≥ 7d) + onboarding 후 14일 grace period 제외 |
| **Status** | ⏳ Pending (Week 4) |

### 6.4 F4 — Personal Variant > Base 우월성

| 필드 | 값 |
|---|---|
| **Hypothesis** | 유저별 Personal Variant 패턴이 base PatternObject보다 forward return 우수 (정련 loop 효과) |
| **Measurement** | paired t-test (variant_returns vs base_returns) per user, then meta-analysis across users |
| **Data source** | `pattern_variants` (user-tuned thresholds) + `pattern_outcomes` per (user_id, pattern_id, variant_id) |
| **Sample size** | 변형 유저 ≥ 10명, 변형당 ≥ 30 outcomes |
| **Threshold (PASS)** | meta p-value < 0.10 (variant > base, one-tailed) |
| **Threshold (KILL F4)** | meta p-value ≥ 0.10 OR variant 평균 ≤ base 평균 |
| **When** | Week 6 종료 시점 (variant active 2주 누적 후) |
| **Escalation** | F4 fail 시: ① 정련 loop 자체 재설계 ② threshold tuning UI가 random walk인지 / 실제 signal 강화인지 진단 ③ Personal Variant 개념 폐기 가능성 (W-0214 §1.5 D-V03 재검토) |
| **False positive guard** | per-user n < 30이면 제외. multiple comparison correction (BH) for meta |
| **Status** | ⏳ Pending (variant feature 가동 후 Week 6) |

## 7. Week-by-Week 측정 일정

| Week | 측정 가능 F | Pre-condition | Action |
|---|---|---|---|
| W1 | F1 | V-00 audit + V-01 cv.py + V-02 phase_eval ready | F1 1차 측정. fail 시 즉시 stop & ADR |
| W2 | F2 | n ≥ 200 verdict pairs | F2 측정. fail 시 stop |
| W3 | (F1 재측정) | data freshness | F1 monthly 재측정. trend 모니터링 |
| W4 | F3 | active_users ≥ 20 + 14d grace | F3 측정 |
| W5 | (F1, F2 monitoring) | continuous | dashboard refresh |
| W6 | F4 | variant n ≥ 10, per user n ≥ 30 | F4 측정 |
| W7+ | 분기별 재측정 | — | 모든 F monthly cron |

→ Cron schedule은 W-0224 V-09 weekly job에 통합.

## 8. Kill 발생 시 절차 (Standard Operating Procedure)

```
1. Detect (자동) — falsifiable_kill.py가 threshold 위반 감지
2. Notify (자동) — Slack #alerts + email to CTO + AI Researcher
3. Halt (수동) — 해당 F와 직접 연결된 work item PR 일시 정지
4. Diagnose (24h 이내) — protocol bug? data bug? hypothesis fail?
   ├─ Bug → 재측정 후 confirm
   └─ Hypothesis fail → step 5
5. ADR (48h 이내) — memory/decisions/에 fail record + 향후 frame
6. Pivot or Adjust (CTO 결정) — 전체 frame 폐기 / 일부 수정 / threshold 완화 (ADR 필수)
```

→ Step 6에서 threshold 완화는 정당한 ADR 없이 금지 (post-hoc rationalization 방지).

## 9. False Positive Rescue Protocol

F1 또는 F4 fail 시 **즉시 폐기 X**. 다음 검증:

```
1. Random seed 변경 후 재측정 (3 iterations)
2. Holdout 기간 변경 (다른 1년 구간)
3. Sample size sensitivity (n × 0.5, n × 2)
4. 위 셋이 일관되게 fail이면 진짜 KILL
5. 일부 inconsistent → protocol bug 가능성 → 24h 재진단
```

→ F2/F3는 sample이 작아 false positive 위험 적음 (rescue 단순).

## 10. CTO + AI Researcher 공동 Sign-off

이 PRD는 falsifiable kill 결정의 trigger이므로:
- CTO sign-off: kill 발생 시 product pivot 권한
- AI Researcher sign-off: 통계 protocol 정합성 보증

```
CTO sign-off:           [ ] (commit author 확인 시)
AI Researcher sign-off: [ ] (별도 PR review)
```

## 11. Cross-references

- W-0214 v1.3 §1.5 Falsifiable Kill Criteria (4개 명제)
- W-0214 v1.3 §3.2 4 Metrics (M1~M4)
- W-0214 v1.3 §9 Risks & Mitigations
- W-0215 V-00 audit (선행)
- W-0217 V-02 phase_eval (M1 구현 — F1 의존)

## 12. Open Questions

- **Q1**: F1 measurement에서 5 P0 패턴 선정 기준? (W-0214 §3.4 audit 후 확정 vs Hill Climbing 결과 차용)
- **Q2**: F2의 ordinal encoding (valid=2, unclear=1, invalid=0) 외 다른 mapping 시도? (예: missed/too_late 별도 처리)
- **Q3**: F3의 "active_user" 정의 — last_login 기준 vs activity_event 기준?
- **Q4**: F4 variant_active period — 2주 vs 4주? user adoption curve에 따라 조정 가능?
- **Q5**: Threshold (F1: ≥1 통과) 자체가 너무 약하지 않은가? 5 중 1만 통과해도 PASS는 cherry-picking 위험. 보수적으로 ≥3?

→ Q1~Q5는 V-02 ready 후 (W-0218에서) 답변 lock-in.

## 13. Out of scope

- ❌ F1~F4 코드 구현 (W-0218 후속)
- ❌ Slack alert 자동화 (별도 ops work item)
- ❌ Kill 후 marketing 메시지 ("we pivoted") 작성
- ❌ Stakeholder communication template

---

## 14. Acceptance — 본 PRD 완료 조건

```
[ ] F1~F4 4종 모두 §6에서 6 컬럼 채움
[ ] Week 1~6 일정표 §7 완성
[ ] SOP §8 + Rescue §9 작성
[ ] CTO + AI Researcher 양측 sign-off line 추가
[ ] W-0214 §9 또는 §1.5에서 본 PRD reference 1줄 추가 (single commit)
[ ] CURRENT.md에 W-0216 등록
```

---

## 15. Quant Trader 관점 — F1~F4 강화 + F5~F7 추가 후보

CTO + AI Researcher + **Quant Trader** 3-perspective sign-off에서 퀀트가 짚는 추가 검증.

### 15.1 F1 강화 — t-stat 외 Sharpe / DSR 동시 통과

| 기존 (v1.0) | 강화 (v1.1, 퀀트 관점) |
|---|---|
| t ≥ 2.0 (BH) 통과 | t ≥ 2.0 **AND** annualized Sharpe ≥ 1.0 (after 15bps cost) |
| - | DSR (Deflated Sharpe Ratio, López de Prado 2014) > 0 — selection bias 보정 |
| - | Hit rate ≥ 0.52 (random=0.50) |
| - | Profit factor ≥ 1.2 |

**이유**: t-stat ≥ 2는 통계적으로 random보다 다르다는 것만 증명. **돈을 버는지** (risk-adjusted)와 별개. 퀀트 표준은 Sharpe + DSR 함께.

**KILL F1 (강화)**: 위 4 metric 중 **2개 이상 fail** 시.

### 15.2 F2 강화 — Verdict 5-cat 분리 측정

기존: ordinal encoding (valid=2, unclear=1, invalid=0)
**강화**: 5-cat을 별도로 testing
- valid → 직후 forward return 양수 비율
- invalid → 직후 forward return 음수 비율
- missed → 직후 forward return 양수 + 유저는 진입 안 함 (system phase late detection)
- too_late → 직후 forward return 음수 + 유저는 진입 (system phase 정의 over-tight)
- unclear → noise

**Quant signal**: missed 비율 / too_late 비율의 변화 = phase 정의 quality 측정 (1차 미분).

**KILL F2 (강화)**: ① ordinal ρ < 0.20 OR ② missed > 50% (system 너무 늦음) OR ③ too_late > 30% (system 너무 빠름)

### 15.3 F3 — Quant 관점 추가

기존: 30일 1개 PatternObject 생성. **추가 측정**: 그 패턴이 **production grade** 통과율.

| 추가 metric | 측정 | KILL |
|---|---|---|
| 유저 작성 패턴이 F-60 gate 통과율 | published / total | < 5% → 유저 input quality 너무 낮음 |
| 유저 작성 패턴 평균 sample size | per pattern outcomes | < 10 → 유저가 충분히 데이터 수집 안 함 |

→ "Hunter persona" 가정이 충족되어도 **품질이 낮으면** F-60 gate 무용지물.

### 15.4 F4 강화 — Variant 우월성 + 안정성

기존: meta p-value < 0.10. **강화**: 안정성 metric 추가
- variant Sharpe > base Sharpe (paired)
- variant max drawdown ≤ base max drawdown (안 더 위험해야)
- variant turnover ≤ 2× base (overfitting 방지: variant가 모든 시점에 진입하면 random)

**KILL F4 (강화)**: 위 3개 중 **2개 이상 fail**.

### 15.5 신규 F5 — Capacity Constraint (퀀트 필수)

| 필드 | 값 |
|---|---|
| **Hypothesis** | P0 5 패턴이 retail capacity (개인당 ≤ 100K USD)에서 작동 |
| **Measurement** | Backtest with 100K USD position size, slippage = depth-based (BTC perp orderbook) |
| **Threshold (PASS)** | 100K USD에서 round-trip slippage ≤ 15bps (D3 cost budget 내) |
| **Threshold (KILL F5)** | 100K USD에서도 slippage > 30bps → 패턴이 retail에 안 맞음 |
| **When** | Week 2 (V-08 pipeline ready 후) |
| **Escalation** | 패턴 capacity 표시. user를 작은 size로 권유 (UI에 capacity warning) |

### 15.6 신규 F6 — Alpha Attribution

| 필드 | 값 |
|---|---|
| **Hypothesis** | P0 패턴 return이 BTC beta로 설명되지 않는 alpha 보유 |
| **Measurement** | factor regression: `pattern_return ~ btc_return + funding + oi_delta + ε`. residual Sharpe |
| **Threshold (PASS)** | residual Sharpe ≥ 0.5 (after BTC beta 제거) |
| **Threshold (KILL F6)** | residual Sharpe < 0 또는 R² > 0.8 (= BTC beta가 거의 다) |
| **When** | Week 3 |
| **Escalation** | KILL F6 시 패턴은 **BTC long with extra steps** — alpha 주장 폐기, market beta 노출 도구로 재포지셔닝 |

### 15.7 신규 F7 — Decay (Time-degradation)

| 필드 | 값 |
|---|---|
| **Hypothesis** | 패턴 hit rate가 시간 경과에도 ±10% 내 유지 (publish 후 30일) |
| **Measurement** | rolling 7d hit rate 비교 (publish week vs +30d week) |
| **Threshold (PASS)** | hit rate 변동 ≤ ±10% |
| **Threshold (KILL F7)** | hit rate −20% 이상 하락 = pattern decay (alpha 소진) |
| **When** | Continuous (V-13 decay monitoring) |
| **Escalation** | 자동: pattern status → "decayed", F-60 gate 재진입 필요 |

### 15.8 Falsifiable Kill Update Summary (v1.1)

```
원본 4개 (F1~F4) → 7개 (F1~F7)로 확장:
F1 — t-stat + Sharpe + DSR + hit rate + profit factor (강화)
F2 — verdict 5-cat 분리 측정 (강화)
F3 — production grade 통과율 추가 (강화)
F4 — Sharpe + drawdown + turnover (강화)
F5 — Capacity (신규)
F6 — Alpha attribution (신규)
F7 — Decay (신규)
```

### 15.9 Week 일정 업데이트

| Week | 측정 | 신규 |
|---|---|---|
| W1 | F1 | F1 (Sharpe + DSR 포함) |
| W2 | F2, **F5** | F5 capacity 측정 추가 |
| W3 | F1 재측정, **F6** | F6 alpha attribution 신규 |
| W4 | F3 (강화) | F3 production grade 비율 |
| W6 | F4 (강화) | F4 Sharpe/drawdown/turnover |
| Continuous | **F7** | F7 decay monitoring (V-13) |

### 15.10 KILL 의사결정 매트릭스

```
F1 fail → 1주 redesign (frame critical)
F2 fail → 2주 evidence 분리 ADR
F3 fail → 4주 product UX redesign
F4 fail → 6주 variant 폐기 가능성
F5 fail → 패턴 retail-only 재포지셔닝 (frame 유지)
F6 fail → alpha → beta 재포지셔닝 (frame 일부 깨짐)
F7 fail → 자동 decay (frame 유지, 운영 자동화)
```

→ F1, F2가 frame-critical. F5, F6, F7은 운영 조정.

### 15.11 시간 예산

기존 §0: "1 day PRD + ongoing measurement (Week 1~6)"
v1.1: "1.5 day PRD + ongoing (Week 1~6 + F7 continuous)"

---

## 16. v1.1 변경 사항

- §15 신규: Quant Trader 관점 강화 + F5~F7 신규
- F1 강화 (Sharpe + DSR + hit rate + profit factor)
- F2 강화 (5-cat 분리 측정)
- F3 강화 (production grade 통과율)
- F4 강화 (Sharpe + drawdown + turnover)
- F5 신규 (Capacity)
- F6 신규 (Alpha attribution)
- F7 신규 (Decay)
- Week 일정 + KILL matrix 업데이트

---

*W-0216 v1.0 created 2026-04-27 by Agent A032 — Falsifiable Test Protocol PRD for W-0214 D1~D8 kill criteria.*
*W-0216 v1.1 concretized 2026-04-27 by Agent A032 — Quant Trader 관점 강화 (F1~F4 강화 + F5~F7 신규).*
