# Cogochi "진짜 개인화" 체감 UX 설계

> **목적:** 유저가 Cogochi의 per-user LoRA 파인튜닝을 "context 주입 개인화"와 구분해 체감하게 만드는 UX.
> **전제:** H1 (+5%p) 이미 증명됐다고 가정. 증명 실패 시 이 문서는 무효.
> **범위:** Day-1 3 surfaces (/terminal, /lab, /dashboard) 내에서 구현.
> **작성:** 2026-04-18

---

## 0. 문제 정의

### 0.1 왜 이게 필요한가

**시장 현실 (2026-04-18 조사):**
- Bitget GetAgent, PAAL AI, Bitsgap, Gainium 모두 "personalized AI" 마케팅
- 실제 구현: 프롬프트에 유저 context 주입
- 유저는 이미 "개인화"라는 단어에 둔감해짐

**Cogochi의 기술적 차이:**
- GetAgent 등: `prompt = f"User profile: {history}\n\nQuery: {question}"` → 모델 weight 고정
- Cogochi: `model.load_adapter(f"user_{uid}/v3.lora")` → 모델 weight 실제 변경

**문제:** 이 차이는 **눈으로 보이지 않음.** 유저가 "오 진짜 달라졌네"를 느껴야 하는데 아무것도 바뀐 게 없어 보임.

### 0.2 이 UX가 해결할 질문

1. 유저가 "내 AI가 진짜 나를 학습했다"를 어떻게 알 수 있나?
2. 유저가 "GetAgent의 가짜 개인화 vs Cogochi의 진짜 개인화"를 어떻게 구분하나?
3. 유저가 Cogochi Pro에 돈 낼 합리적 근거는 무엇인가?

### 0.3 Non-Goals

- 기술적 설명 UI (파인튜닝이 뭔지 설명) — 유저는 이해할 필요 없음
- GetAgent를 공개적으로 저격 — 법적 리스크 + 치사함
- 복잡한 대시보드 — 모든 정보를 한 화면에 때려넣는 건 역효과

---

## 1. 해결 원칙

### 1.1 "보여주기" > "설명하기"

유저에게 "LoRA 파인튜닝이란..." 설명은 0점. 결과를 눈으로 보여줘야 1점.

### 1.2 "변화"를 시각화

개인화는 static 상태가 아니라 **시간에 따른 변화**. Before/After 비교가 핵심.

### 1.3 "내 것"임을 강조

다른 유저와 구분되는 "내 모델의 서명" 같은 게 필요. 공유 불가능한 뭔가.

### 1.4 "데이터로 증명"

감정/서사 말고 숫자. 유저가 직접 확인 가능한 숫자.

---

## 2. 핵심 UX 요소 3개

### 2.1 Adapter Diff Panel (/dashboard)

**위치:** `/dashboard` "My Adapters" 섹션 (현재 placeholder로 표시)

**동작:**
```
┌─ My Model Evolution ──────────────────────────┐
│                                                │
│  v1 (baseline)   v2 (피드백 20)   v3 (피드백 60)│
│  ─────────────   ──────────────   ─────────────│
│  적중률: 52%     적중률: 58%      적중률: 63%  │
│                  Δ +6%p ✓         Δ +5%p ✓    │
│                                                │
│  [v1 vs v2 비교 보기]                          │
│                                                │
│  → 같은 패턴에 대해 v1과 v2가 다르게 반응한    │
│    12개 케이스 발견                            │
│                                                │
│  [예시 1] BTC 4h recent_rally + bb_expansion   │
│    v1 prediction: 진입 (틀림, -1.2%)           │
│    v2 prediction: 대기 (맞음)                   │
│    → v2는 bb_expansion 과열을 위험 신호로 학습│
│                                                │
└────────────────────────────────────────────────┘
```

**왜 이게 통하나:**
- 숫자로 증명 (+5%p, +6%p)
- 구체적 케이스 예시 (BTC 4h recent_rally...)
- **"내 AI가 실수를 통해 배웠다"가 눈에 보임**
- GetAgent는 이런 데이터 자체가 없음 (context 주입이라 모델 변화 추적 불가)

**구현 난이도:** 중. evaluate.py의 before/after diff 결과를 UI에 연결하면 됨.

### 2.2 "같은 질문, 다른 답변" Showcase (/terminal)

**위치:** `/terminal` 상단 토글 버튼

**동작:**
```
[ Compare with baseline ]  ← 토글 on

─────────────────────────────────────────────
질문: BTC 4h 현재 상황 어때?
─────────────────────────────────────────────

▼ Baseline (공용 모델)
   "BTC는 현재 $XX,XXX에 거래 중이며, RSI 60으로
    중립 구간. MACD는 상승 추세..."
   [generic + textbook response]

▼ Your Model (v3, 피드백 60 반영)
   "너가 전에 본 bb_expansion + OI 누적 조건이
    지금 BTC 4h에 나타남. 다만 지난번처럼 펀딩비
    과열 아니라 진입 가능할 듯. 손절 23.8..."
   [your-style response]

─────────────────────────────────────────────
차이: 너의 피드백으로 학습된 패턴 "bb_expansion"이
      baseline 모델에는 없는 관점.
```

**왜 이게 통하나:**
- **A/B 대조**가 가장 강력
- 유저가 "아, 내 피드백이 저기 들어갔구나" 즉시 체감
- baseline은 generic, my model은 specific — 차이가 바로 느껴짐

**구현 난이도:** 중-상. 매 쿼리마다 2번 추론 필요 (baseline + user adapter). 비용 2배.
- 완화: Free/Starter 유저엔 주 1회만, Pro 유저는 매번 가능
- 또는: baseline 답변은 캐시, user 답변만 fresh

### 2.3 Adapter Fingerprint (/lab)

**위치:** `/lab` 내 "My Training History"

**동작:**
```
┌─ Adapter v3 ──────────────────────────────────┐
│                                                │
│  훈련: 2026-04-15 23:47 UTC                    │
│  비용: $0.063                                  │
│  피드백: 20개 (good 12, bad 8)                 │
│                                                │
│  Learned Patterns (weight 변화 Top 5):          │
│  ├─ bb_expansion          +0.23 ← 네가 자주 사용│
│  ├─ OI 누적               +0.18                │
│  ├─ 펀딩비 과열 경고       +0.15               │
│  ├─ volume_24h × wick     +0.11 (너만의 조합)  │
│  └─ CVD divergence        +0.08                │
│                                                │
│  val gate: +2%p 통과 ✓ (배포됨)                │
│                                                │
│  [download adapter .safetensors]               │
│                                                │
└────────────────────────────────────────────────┘
```

**왜 이게 통하나:**
- "내 어댑터"가 파일로 존재한다는 물리적 감각 (download 가능)
- 학습된 패턴 weight 변화를 숫자로 보여줌 — 이건 context 주입으론 불가능
- **"너만의 조합"** 라벨로 공유 불가능한 가치 강조

**구현 난이도:** 낮. PEFT의 adapter weight diff 계산만 하면 됨.

---

## 3. 추가 전술

### 3.1 Kill Switch — "공용 모델로 돌아가기"

/settings에 "Use baseline model instead" 토글 추가.
- 유저가 이 토글을 on/off 하면 응답 질이 체감되게 달라짐
- 처음엔 유저가 의심하다가 토글을 자주 바꿔보며 차이를 확인하게 됨
- 이게 "진짜 개인화"의 가장 강력한 증명 — **끌 수 있다는 것이 있다는 것의 증거**

### 3.2 "GetAgent와 다른 점" 명시적 언급 금지

비교 마케팅은 저격당하기 쉬움. 대신 Cogochi 측면만 강조:
- ❌ "GetAgent는 context 주입이지만 Cogochi는 진짜 파인튜닝"
- ✅ "Cogochi는 너의 모델 weight를 실제로 업데이트합니다. 다른 도구는 대화 내용만 참조합니다."

법적 안전 + 기술 우월성 어필.

### 3.3 Progress Bar가 아니라 Milestone

"100번 피드백까지 23%" 같은 진행률은 게임화 느낌 나서 피함. 대신:
```
✓ First adapter trained (v1 → v2, +5.2%p)
✓ 20 more feedback collected (v2 → v3 ready)
○ Next training: auto-trigger at 80 feedback
```

### 3.4 다른 유저 어댑터 구경 금지 (의도적)

소셜 기능 추가하고 싶은 유혹 있을 거임. **하지 마.**
- 이유 1: "내 모델"의 privacy가 USP의 일부
- 이유 2: 공유하면 유저가 남 어댑터 받으려 함 → per-user 가치 희석
- 이유 3: reputation 제품이 되면 Cryptohopper marketplace와 같아짐

Export는 허용 (download), Share는 허용 안 함.

---

## 4. 구현 우선순위

| 요소 | Priority | Week | 의존 |
|---|---|---|---|
| 2.3 Adapter Fingerprint | P0 | Week 4 (H1 검증 직후) | evaluate.py, adapter_swap.py |
| 2.1 Adapter Diff Panel | P0 | Week 5 | FIXED_SCENARIOS eval 결과 |
| 3.1 Kill Switch | P1 | Week 5 | adapter_swap.py |
| 2.2 "Same question, different answer" | P1 | Week 6 | 2번 추론 인프라 (비용 고려) |
| 3.3 Milestone | P2 | Week 7 | feedback 카운터 |

**의도적 P2 (나중):** 화려한 애니메이션, 소셜 기능, 게임화 — 전부 USP 희석.

---

## 5. 성공 측정

### 5.1 정량 지표

- **D7 Retention** — "Adapter Diff Panel"을 본 유저 vs 안 본 유저 비교
- **Kill Switch 사용률** — 30% 이상이 최소 1회 토글하면 성공. 0%면 UX 실패
- **"같은 질문 다른 답변" 토글 사용 빈도** — 유저당 주 1회 이상이면 체감 중
- **Free → Starter 전환** — 2.1 Diff Panel 본 유저의 전환율 비교

### 5.2 정성 지표

유저 인터뷰 (20명):
- "Cogochi가 GetAgent와 뭐가 달라요?" 질문
- 원하는 답변: "내 모델이 실제로 바뀌어서..." 비슷한 언급
- 실패 답변: "글쎄요..." / "AI가 좀 더 스마트한 것 같아요" (둘 다 체감 실패)

### 5.3 Kill Criteria (이 UX가)

- 8주 후 유저 체감 조사에서 50% 이상이 "context 개인화와 차이 못 느낌" 답변: UX 전면 재설계
- Kill Switch 사용률 5% 미만: 유저가 토글 존재 자체를 모름, 위치 재배치 필요

---

## 6. 투자자 스토리 연결

이 UX가 있으면 투자자에게 이렇게 말할 수 있음:

> "GetAgent 같은 경쟁자는 '개인화'라고 하지만 실제로는 프롬프트 context 주입입니다. 
> 우리는 유저 한 명당 실제 LoRA 어댑터를 $0.07에 굽고, 유저가 Kill Switch로 직접 
> 차이를 체감하게 만듭니다. 학술 선행 연구 (OPPU, Per-Pcs)를 크립토 트레이딩 도메인에 
> 처음 적용하는 시도이며, H1 (+5%p) 검증됐습니다."

각 문장이 증거를 동반:
- "프롬프트 주입" → 경쟁자 기술 스택 분석
- "$0.07 어댑터" → Computalot 비용 계산서
- "Kill Switch 차이 체감" → 유저 사용률 데이터
- "첫 적용 + H1 검증" → FIXED_SCENARIOS eval 결과

---

## 7. 남은 위험

### 7.1 유저가 차이를 체감 못 함

+5%p 개선이 실제로는 유저가 구분 못 할 만큼 미묘할 수 있음. 20번 중 1번 더 맞춘다는 얘기.

**완화:**
- 체감 대신 증명 강조 (Adapter Fingerprint의 숫자)
- 장기 누적 효과 강조 (v1→v5: +15%p 같은)
- 질 차이보다 스타일 차이 강조 (generic vs 내 표현)

### 7.2 GetAgent가 LoRA 도입

기술 격차 소멸 가능. 분기마다 모니터링.
- 대응: Cogochi는 "per-user LoRA **on crypto trading specifically**"로 좁혀 방어
- Bitget은 범용 거래소라 trading 도메인 특화 데이터 부족

### 7.3 H1 실패

이 문서 전체가 무효.
- Fallback: Scanner + Market (패턴 구독) 만으로 Cryptohopper/Altrady와 기능 경쟁
- 그 시점엔 가격 경쟁력과 UX 품질이 전부

---

## 8. 다음 세션 시작 지점

이 문서를 읽은 다음 할 일:

1. **H1 검증 결과 확인** — CLAUDE_1.md의 H1 상태
   - 성공: 이 문서 2.3 Adapter Fingerprint부터 구현
   - 실패: 이 문서 무효, 제품 재설계

2. **2.1 Adapter Diff Panel UI mock** — Figma or sketch
   - Before/After 비교의 레이아웃
   - 12개 케이스 diff 뷰

3. **Kill Switch 위치 결정** — Settings 어디에?
   - 너무 숨기면 안 쓰임 (5% 미만)
   - 너무 드러내면 "불안정한 제품" 느낌

4. **"같은 질문 다른 답변" 비용 계산**
   - 매번 2번 추론 = 비용 2배
   - 어느 플랜부터 허용할지 결정

---

*— End of COGOCHI_REAL_PERSONALIZATION_UX.md —*
