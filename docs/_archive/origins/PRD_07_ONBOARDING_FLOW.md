# 07 — Onboarding Flow (First 7 Days)

**버전**: v1.0 (2026-04-25)
**상태**: canonical
**의도**: 신규 유저 첫 7일 동안 **NSM (verdict loop)**까지 도달시키는 정밀한 funnel 설계

---

## 0. 원칙

### 0.1 Onboarding은 product의 부속이 아니라 본체다

Onboarding이 약하면:
- Activation rate 떨어짐
- D7 retention 떨어짐
- 유저가 가치 못 느끼고 churn
- Verdict ledger가 안 채워짐 → moat 못 만들어짐

### 0.2 First 7 days는 NSM까지 가야 한다

목표:
- D1: 첫 capture
- D2-3: 첫 search
- D4-7: 첫 verdict (72h outcome window 닫힌 후)

이걸 자연스럽게 만드는 게 onboarding의 일.

### 0.3 비-목표

- 모든 기능 한 번에 가르치기
- 상세한 튜토리얼 강요
- Tour modal이 5개 이상
- Email 시퀀스 7개 이상
- 초보자 친화 (P0는 이미 derivatives literacy 있음)

---

## 1. 7-Day Funnel 전체 모습

```
Day 0: Land + Sign up
  ↓ goal: 30분 안에 첫 chart 본다
Day 1: First capture
  ↓ goal: Save Setup 1회
Day 2-3: First search
  ↓ goal: scan_grid 결과 1회 본다
Day 4: Outcome notification (72h 경과)
  ↓ goal: 알림 클릭
Day 5-7: First verdict
  ↓ goal: 1-click 판정
Day 8+: Habit loop 시작
```

각 단계에 **drop-off 측정 + 개입 트리거**.

---

## 2. Day 0 — Sign-up & First Hour

### 2.1 Landing → Sign-up

**Landing page 구조** (P0 페르소나 기반):

- Hero: **"Pattern memory for crypto derivatives"**
- Sub: 3-layer stack image (Cogochi → Velo → Exchange)
- Demo video 30초 (자동 재생, sound off)
- 4가지 unique moat 한 줄씩
- Sample capture 1개 (실제 P0 유저 quote)
- "Join beta" CTA

**Conversion target**:
- Landing → Sign-up: **3-6%**

### 2.2 Sign-up Flow

**최소 friction**:

1. Email + password (Google/Apple OAuth 옵션)
2. **No survey, no quiz** (P0는 빠르게 들어가고 싶음)
3. 자동 verify email (link click)
4. Welcome screen (5초)

**금지**:
- 긴 onboarding survey
- "What's your trading style?" 같은 질문
- Pricing page 강제 통과
- Credit card 요청

**Reasoning**: P0는 이미 결정 끝낸 상태로 옴. Friction은 churn.

### 2.3 First-Run UI

Sign-up 직후 보이는 화면 (immediate value):

```
┌─────────────────────────────────────────┐
│  Welcome Jae 👋                          │
│                                          │
│  We pre-loaded BTCUSDT for you.         │
│  ↓ click chart to explore               │
└─────────────────────────────────────────┘

[ BTCUSDT 1h chart with phase overlay ]
  - 자동으로 현재 phase 표시
  - 자동으로 sample 1 saved capture (system-curated)
```

**핵심**: 빈 화면 절대 X. 첫 1초에 가치 보여야 함.

### 2.4 Tooltip strategy

**1개만**:
- Save Setup 버튼에만 single tooltip: "👆 Save anything you find interesting. We'll remember it."
- 클릭하거나 5초 지나면 사라짐

**금지**:
- 5단계 tour
- "다음으로 →" 버튼 시리즈
- Click-through quiz

### 2.5 Day 0 metrics

| Metric | Target |
|---|---|
| Sign-up → Welcome screen | 95% |
| Welcome → Chart loaded | 90% |
| Chart loaded → 60s engagement | 75% |
| First chart interaction | 60% |

---

## 3. Day 1 — First Capture

### 3.1 자연스러운 trigger

Onboarding의 첫 큰 milestone. Save Setup 한 번.

**Trigger 옵션 (자동)**:

1. **Pattern detected toast** (real-time):
   ```
   "BTCUSDT 진입 신호 감지. 저장하고 추적할까요?"
   [Save Setup]  [Dismiss]
   ```

2. **Curated daily picks** (push):
   - Sample 3개 미리 분석된 setup
   - 각 차트에 "Save this" CTA

3. **Empty inbox prompt**:
   ```
   "아직 저장한 setup이 없네요.
    가장 활발한 종목 3개를 추천드립니다."
   ```

### 3.2 Save Setup UX (간결)

Modal:
- Pattern 자동 detect
- Note (optional)
- Tags (optional)
- Trade plan (optional, 접힘 default)
- **Save** (single click)

**핵심**: 첫 저장은 **30초 안에** 끝나야 함. 모든 field optional.

### 3.3 Day 1 D-end activation

목표: **80% of D1 users save 1+ capture**

미달 시 intervention:
- D2 morning email: "오늘 흥미로운 setup 3개"
- In-app banner: "첫 capture 만드는 방법 (10초)"

### 3.4 Day 1 metrics

| Metric | Target | Kill |
|---|---|---|
| D1 return rate | 70% | < 50% |
| D1 first capture | 50% | < 30% |
| Capture session length | 5min+ | < 2min |
| Multi-capture (2+) D1 | 20% | < 10% |

---

## 4. Day 2-3 — First Search

### 4.1 Trigger: "Have you seen this before?" prompt

Capture 후 24-48시간 내:

```
"PTBUSDT setup이 TRADOOR 패턴과 78% 유사합니다.
 비슷한 과거 사례 5개 있어요. 보시겠어요?"
[Show similar]  [Later]
```

자동으로 **similar-to-capture** search 결과 페이지로 이동.

### 4.2 Search 결과 UX

Scan_grid template:
- 5-10개 similar cases
- 각 tile에 outcome (HIT/MISS/EXPIRED)
- Hit rate aggregate ("이 패턴 5/7 성공, 평균 +24%")

**핵심**: P0가 첫 search에서 **"이거 진짜 작동하네"** 느껴야 함.

### 4.3 Day 2-3 메시지 (push/email)

Push notification (D2):
- "Phase transition detected on BTCUSDT (real_dump → accumulation)"
- 클릭 → Analyze mode

Email digest (D3):
- "Your first 48h on Cogochi"
- 저장한 capture 수
- Pending outcomes
- Suggested next actions

### 4.4 Day 2-3 metrics

| Metric | Target | Kill |
|---|---|---|
| D3 return rate | 55% | < 30% |
| First search performed | 60% | < 40% |
| Search → result click | 70% | < 50% |
| Multi-capture by D3 | 40% | < 20% |

---

## 5. Day 4 — First Outcome

### 5.1 72h window 닫힘

Day 1 capture의 outcome이 자동 평가됨 (auto_verdict: HIT/MISS/EXPIRED).

### 5.2 Outcome notification

Email + push:
```
Subject: "Your TRADOOR setup hit +28%"
Body:
  Your saved capture from 3 days ago reached +28% peak return.
  Auto-verdict: HIT
  
  How would you judge it?
  [✓ Valid]  [⚠ Near miss]  [✗ Invalid]  [Open analysis]
```

**핵심 trick**: 1-click verdict from email itself (deep link with token).

### 5.3 Verdict UX (in-app)

만일 email 안 클릭하면 in-app banner:
```
"3 capture(s) waiting for your verdict (72h passed)"
[ Review ]
```

Verdict UI:
- 5 buttons (Valid/Invalid/Near miss/Too early/Too late)
- Optional 1-line comment
- Optional "What I learned"

전체 30초 이내.

### 5.4 Day 4 metrics

| Metric | Target | Kill |
|---|---|---|
| Outcome notif open rate | 50% | < 25% |
| Notif → verdict submit | 35% | < 15% |
| Avg verdicts per active D4 | 0.6 | < 0.3 |

---

## 6. Day 5-7 — Habit Formation

### 6.1 Habit loop 강화

목표: **Cue → Routine → Reward** 형성.

| Cue | Routine | Reward |
|---|---|---|
| Morning notification | Open app, check overnight transitions | 흥미로운 setup 발견 |
| Big BTC move | Open chart, check phase | "이거 비슷한 거 본 적 있다" 검색 |
| 72h elapsed | Open verdict inbox | Personal stats 갱신 |

각 trigger를 **자동으로** 만들어야 함.

### 6.2 Personal stats 첫 노출

D5+:
```
"Your first week on Cogochi"
- Captures saved: 4
- Verdicts: 2
- Auto hit rate: 50% (1 HIT, 1 MISS)
- Most-used pattern: oi_reversal_v1 (3 captures)
```

이게 retention의 **bait**. 본인 데이터 = 본인 자산.

### 6.3 Pro tier 첫 노출

D7 email:
```
"You've completed your first verdict loop. Welcome to Cogochi.
 
 You're on Free (5 capture limit).
 Want unlimited + personal variants?
 [Upgrade to Pro - $14.50 first month]"
```

**Beta discount** 50%로 conversion 유도.

### 6.4 Day 5-7 metrics

| Metric | Target | Kill |
|---|---|---|
| D7 return rate | 40% | < 20% |
| D7 captures total | 5+ | < 2 |
| D7 first verdict completed | 30% | < 15% |
| D7 → Pro upgrade considered | 15% | < 5% |

---

## 7. Email Sequence (정밀)

총 7 emails in 7 days. 더 넣으면 churn.

### 7.1 Welcome (D0, immediate)

- Subject: "Welcome to Cogochi"
- Body: 30초 video + "your first action" CTA
- Length: 80 words max

### 7.2 First capture nudge (D1, 24h)

- Subject: "BTC just transitioned to accumulation"
- Body: Live phase + "Save it" CTA
- Conditional: D1에 capture 안 했으면

### 7.3 Search trigger (D2, 24h after first capture)

- Subject: "5 patterns similar to your saved BTCUSDT"
- Body: Top 3 similar cases preview
- CTA: "See all"

### 7.4 D3 digest

- Subject: "Your first 48h"
- Body: Stats + suggested actions
- 100 words max

### 7.5 Outcome notification (D4)

- Subject: "Your [SYMBOL] setup hit +X%"
- Body: 1-click verdict buttons in email
- 30 words max

### 7.6 Personal stats (D5)

- Subject: "Your hit rate so far"
- Body: First week stats + "compare to community"
- CTA: "See full stats"

### 7.7 Upgrade nudge (D7)

- Subject: "You're approaching your free limit"
- Body: Beta discount + Pro features
- CTA: "Upgrade for $14.50"

---

## 8. Push Notifications

Mobile/web push. **Quality over quantity**.

### 8.1 첫 1주일 빈도 limit

- Day 1: 1 push max (welcome)
- Day 2-3: 1 push max per day (pattern detect)
- Day 4: 1 push (outcome ready)
- Day 5-7: 1-2 push (digest + upgrade)

총 7일에 **7 push max**.

### 8.2 Notification types

| Type | Day | Content |
|---|---|---|
| Welcome | D0 | "Cogochi is ready" |
| Pattern detect | D1-3 | "[SYMBOL] [PHASE] detected" |
| Outcome ready | D4+ | "Your verdict awaits" |
| Verdict reminder | D5+ | "[N] outcomes pending review" |

### 8.3 User control

Settings에서 toggle:
- Pattern alerts (default: on)
- Outcome notifications (default: on)
- Marketing emails (default: off)
- Personal digest (default: weekly)

P0가 alert spam 받으면 즉시 churn. 보수적으로.

---

## 9. In-App Onboarding Triggers

페이지별 첫 진입 시 contextual help.

### 9.1 First Save Setup

- Modal에 "What this saves" 1줄 설명
- Auto-tag suggestions
- Skip 가능

### 9.2 First search result

- 결과 페이지 상단에 1줄: "These are historical cases similar to your saved pattern"
- Hit rate badge 옆에 small ⓘ → "How we calculate this"

### 9.3 First verdict

- Verdict 버튼 위에 1줄: "Your judgment helps personalize future searches"

### 9.4 First Pro feature lock

- "Personal variant" 클릭 시 modal:
  - "Customize threshold for your personal style"
  - "Available in Pro ($14.50 beta)"
  - [Upgrade]  [Later]

---

## 10. 분기 (Branching) Logic

페르소나에 따라 다른 path.

### 10.1 Returning visitor (had account before)

- Skip welcome
- 직접 dashboard
- "Welcome back. Your N saved captures are here."

### 10.2 Invited by team member (P1 onboarding)

- Welcome with team context
- "Sarah added you to [Team Name]"
- Pre-loaded with team's pattern library
- Different tour (team workspace focus)

### 10.3 Direct upgrade (Pro signup)

- Skip free tour
- Direct to Personal Variant setup
- Pro features visible from start

### 10.4 P2 (API user) signup

- Skip web onboarding
- Direct to API key page + docs link
- "Welcome. Read the docs."

---

## 11. Anti-Patterns (절대 금지)

### 11.1 Onboarding 안티 패턴

- ❌ Multi-step wizard 5 페이지+
- ❌ "Tell us about yourself" 설문
- ❌ Tour overlay 4개 이상
- ❌ Forced email confirmation 동안 lock
- ❌ Credit card before value
- ❌ "Trial 시작" 버튼 강요
- ❌ Notification permission 즉시 요구
- ❌ "10가지 기능 소개" carousel

### 11.2 Email 안티 패턴

- ❌ 하루에 2개+
- ❌ 200 단어+ body
- ❌ "Did you know..." filler
- ❌ "Special offer" 제목 (filter됨)
- ❌ Personalization 없는 generic
- ❌ Plain HTML, 시각 자료 없음

### 11.3 In-app 안티 패턴

- ❌ Tooltip queue (사라지지 않음)
- ❌ Modal overlay 동시 2개
- ❌ "확인" 강요 popup
- ❌ Empty state 정보 없음
- ❌ Loading 3초+
- ❌ Error 영어 stack trace

---

## 12. Activation Definition

**"Activated user" 정의**:

> **Activated = D7 내 1+ verdict 제출**

이 정의가 NSM (WVPL)과 직결.

대안적 정의:
- D1 capture: 약함 (저장만으론 가치 못 느낌)
- D3 search: 중간
- D7 verdict: 강함 (full loop 경험)

활용:
- Activation funnel 측정
- Cohort retention 비교
- A/B test north star

---

## 13. Onboarding A/B Tests (Phase별)

### Phase 1 (M1 alpha, sample N=20)

- Sample size 부족 → 정량 A/B 안 함
- Qualitative 1-on-1 인터뷰만

### Phase 2 (M3 closed beta, N=200)

- A/B 1: Sign-up flow (email vs OAuth default)
- A/B 2: First trigger (curated picks vs auto detect)

### Phase 3 (M6 open beta, N=1000+)

- A/B 3: Email cadence (7 vs 5 vs 3 emails)
- A/B 4: Onboarding length (5 days vs 7 days vs 14 days)
- A/B 5: Beta discount ($14.50 vs $19 vs $29)
- A/B 6: Personal stats reveal timing (D3 vs D5 vs D7)

각 test는 statistical significance 확보 후에만 ship.

---

## 14. Failure Modes & Recovery

### 14.1 D1 churn (가입 후 미접속)

- D2 email: "Did Cogochi feel slow?"
- D5 email: "Your first capture is 2 clicks away"
- D14 email: "Last chance — your data will be deleted at D30"

### 14.2 No capture by D3

- In-app banner with curated 3 picks
- Personal email from team
- Demo video re-show

### 14.3 No verdict by D7

- Outcome notification re-send
- Show "what verdicts unlock" (personal variants, hit rate)
- 1-click verdict from any view

### 14.4 Negative first experience

- "Sorry it didn't work" banner
- Direct contact form to founder
- Refund (if paid)

---

## 15. Onboarding Metrics Dashboard

매일 모니터링.

### 15.1 Funnel

```
Landing → Sign-up: X%
Sign-up → D1 active: X%
D1 active → First capture: X%
First capture → First search: X%
First search → First verdict: X%
First verdict → D14 retention: X%
D14 → Paid: X%
```

### 15.2 Time to value (TTV)

- TT first chart: < 2min
- TT first capture: < 24h
- TT first verdict: < 7d
- TT first paid action: < 14d

### 15.3 Drop-off heatmap

각 step별 drop-off 측정 → highest drop step에 intervention.

---

## 16. Persona-specific 분기

### 16.1 P0 (개인 프로) — 위 시나리오 기본

### 16.2 P1 (팀)

- Different sign-up path (invite link)
- Onboarding focus: team workspace, shared library
- Skip 개인 first-capture
- "Sarah saved this for you to review" 같은 social proof

### 16.3 P2 (API/quant)

- Skip web onboarding
- 직접 docs + API key
- Code sample (Python/JS) 즉시 노출
- 7일 trial → paid conversion

---

## 17. Localization

### 17.1 Korean (primary launch market)

- Email 한국어
- In-app 한국어
- Cultural references 한국 ("PTB 패턴" 등)

### 17.2 English (secondary)

- Same flow, English copy
- US/EU/SEA 시간대별 push timing

### 17.3 Future: 일본어, 중국어 (Phase 2+)

---

## 18. Onboarding 성공 = 1 verdict

7일 안에 한 명이 한 번이라도 verdict 누르면 거기서 momentum 시작.

- Verdict = 첫 데이터 기여
- 첫 personal stat 활성화
- 다음 capture가 더 의미 있어짐
- Churn rate 급감

따라서 모든 onboarding 디자인은 **verdict까지 도달**을 향한다.

---

## 19. Non-Goals

- 화려한 onboarding tour
- 게임화 (badge, points)
- 친구 초대 강제
- 30일 무료 trial 광고
- 초보자 교육 콘텐츠

---

## 20. 한 줄 결론

> **Onboarding의 single goal: 7일 안에 1 verdict.**
> **그 verdict가 personal data assets의 첫 행이 된다.**
> **모든 email, push, tooltip, copy는 이 한 가지 milestone을 향해 정렬한다.**
