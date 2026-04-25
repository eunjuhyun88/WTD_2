# WTD × Cogochi — 최종 통합 설계 문서

**Holo Studio | 2026.04**
**AI Researcher + CTO 관점 통합본**

---

## 0. 한 줄 정의

> **수년간 차트를 보면서 쌓인 내 감각을 AI가 학습해서,
> 현물·선물·온체인 데이터를 실시간으로 스캔하고,
> 내 패턴과 유사한 역사적 케이스를 찾아 승률을 보여주고,
> 조건이 충족되면 나 대신 자동으로 거래한다.**

---

## 1. 제품이 해결하는 문제

### Before — 지금 트레이더가 하는 일

```
매일 아침:
  CoinGlass 열어서 OI·펀딩비 확인          (선물)
  Binance/Bybit 열어서 차트 하나씩 클릭     (현물)
  Glassnode/Lookonchain 열어서 고래 확인   (온체인)
  → 수십 개 코인 수동 스캔
  → 하루 2~3개 시그널 (대부분 놓침)
  → 감 기반 진입
```

### After — WTD+Cogochi가 하는 일

```
유저:
  "TRADOOR 2024-11-22 여기서 진입했어" (타임스탬프 찍기)
  또는
  "OI 급등 + 펀딩 음전환 + 현물 CVD 상승" (조건 설명)

시스템:
  → 해당 시점 현물·선물·온체인 feature 추출
  → 6년 히스토리에서 유사 케이스 탐색
  → "287건 중 196건 7일 내 +30% = 68%"
  → 1000개 코인 24/7 스캔 → 패턴 감지 즉시 알림
  → P(win) ≥ 0.55이면 자동 주문 (선택)
  → 결과 → 재학습 → 더 잘 찾음
```

### 아무도 못 하는 것

| 도구 | 못 하는 것 |
|------|-----------|
| TradingView | OI·CVD·온체인 없음. 패턴 기억 없음 |
| CoinGlass | 데이터는 최고. 스캔·학습·실행 없음 |
| altFINS | 기술 지표만. 파생·온체인 없음 |
| freqtrade | 코딩 필수. 내 감각을 코드로 못 씀 |
| TradingAgents/NoFX | LLM이 판단 → 재현 불가. 학습 루프 없음 |
| **WTD+Cogochi** | **세 레이어 동시 + 타임스탬프 → 유사 검색 + 학습** |

---

## 2. WTD와 Cogochi의 관계

```
WTD (엔진)                    Cogochi (인터페이스)
─────────────────────         ──────────────────────────
feature_calc.py               Alpha Hunter (실동작)
LightGBM (D16 검증 완료)  →   DOUNI 자연어 파싱
백테스트 엔진                  패턴 등록 UI (타임스탬프·조건)
walk-forward 검증              MCP 서버 (Claude Desktop 연결)
Pattern Refinement             CLI (cogochi scan/trade)
AutoResearch 루프              Elsa x402 실행 레이어
```

**같은 제품입니다.** WTD가 수치 엔진, Cogochi가 그 위의 대화+실행 레이어.

---

## 3. 핵심 데이터 레이어

### 왜 현물·선물·온체인이 다 필요한가

TRADOOR 복기 예시:
```
온체인: 고래 거래소 입금 없음 (패닉셀 아님)
선물:   숏펀비 꽉참 + OI 급등 (세력 숏 포지션)
현물:   CVD 하락하다 반등 시작 (매수 압력)
→ 세 레이어 동시 감지 = "세력 숏 털기 임박"
```

각각 따로 보면 노이즈. 세 레이어가 동시에 맞아야 시그널.

### 데이터 소스

| 레이어 | 데이터 | 소스 |
|--------|--------|------|
| 현물 | OHLCV, CVD (aggTrade 직접 계산) | Binance WS |
| 현물 | 김치프리미엄 | 업비트/빗썸 |
| 선물 | OI, 펀딩비, L/S 비율 | Binance Futures |
| 선물 | 청산 데이터, Taker ratio | Coinalyze/CoinGlass |
| 온체인 | 거래소 입출금, 고래 움직임 | Surf AI API |
| 온체인 | 공포탐욕지수 | alternative.me |
| 크로스 | 섹터, BTC 도미넌스, 김치프리미엄 | 자체 계산 |

---

## 4. 5-레이어 아키텍처

```
유저 입력
  ↓
┌─────────────────────────────────────────────────────────┐
│ L3: DOUNI (언어 레이어)                                  │
│   역할: 자연어 → 구조화 / 결과 → 자연어 설명            │
│   기술: Qwen3:35B + LoRA (트레이딩 용어 파싱 특화)       │
│   NOT: 판단하지 않음. 번역만.                            │
└────────────────────┬────────────────────────────────────┘
                     ↓ 구조화된 조건 or 타임스탬프
┌─────────────────────────────────────────────────────────┐
│ L1: Alpha Hunter (스캔 엔진)                             │
│   역할: 전체 시장 feature 계산 (15레이어, 이미 동작)     │
│   출력: 28+ feature 벡터 (현물·선물·온체인 통합)         │
│   기술: Python, Binance WS, CCXT, Surf API              │
│   NOT: 판단하지 않음. 숫자만 출력.                       │
└────────────────────┬────────────────────────────────────┘
                     ↓ feature vector
┌─────────────────────────────────────────────────────────┐
│ L2: 판단 엔진                                            │
│                                                          │
│  A. Pattern Refinement (WTD 핵심)                        │
│     타임스탬프 → feature snapshot → 유사도 검색          │
│     여러 Strategy 경쟁:                                  │
│       - TreeImportance: LightGBM feature importance     │
│       - FeatureOutlier: z-score 이상치 탐색              │
│       - CosineSimilarity: 벡터 유사도                    │
│     → "이 패턴 287건, 승률 68%"                         │
│                                                          │
│  B. LightGBM Signal Engine (WTD D16 검증 완료)           │
│     feature → P(win) 0.0~1.0                            │
│     Regime Filter (장세 판단)                            │
│     threshold ≥ 0.55 → 신호 발생                        │
│                                                          │
│  NOT: LLM 없음. 같은 입력 = 같은 출력. 재현 가능.       │
└────────────────────┬────────────────────────────────────┘
                     ↓ P(win) + 유사 케이스
┌─────────────────────────────────────────────────────────┐
│ L4: 실행 에이전트                                        │
│   역할: 신호 → 자동 주문                                 │
│   기술: Binance Testnet → 실거래 / Elsa x402 (DeFi)     │
│   리스크: 계좌 1% rule, 일손실 -3% 중지                  │
│   NOT: 분석하지 않음. LLM 없음.                          │
└────────────────────┬────────────────────────────────────┘
                     ↓ trade_log
┌─────────────────────────────────────────────────────────┐
│ L5: AutoResearch (학습 루프)                             │
│   역할: 거래 결과 → 모델 개선                            │
│   기술: Hill Climbing + LightGBM 재학습                  │
│   트리거: trade_log 20건 이상 누적                       │
│   NOT: LLM 없음. 수치가 수치를 최적화.                   │
└─────────────────────────────────────────────────────────┘
                     ↓ 개선된 모델 → L1·L2 업데이트
```

---

## 5. 패턴 등록 방식

### 3단계 입력 (모두 지원)

```
Level 1 — 타임스탬프만 (가장 쉬움)
  "TRADOOR 2024-11-22"
  → 시스템이 알아서 feature 추출 → 유사 검색

Level 2 — 타임스탬프 + 힌트
  "TRADOOR 2024-11-22, OI 급등 후 반등"
  → 힌트로 탐색 방향 제한

Level 3 — 조건 명시
  "OI +30% + 펀딩 음전환 + CVD 반등"
  → 직접 조건으로 스캔 등록
```

### Pattern Refinement 흐름

```
타임스탬프 입력
    ↓
feature snapshot 추출 (28+ 숫자)
    ↓
여러 Strategy 동시 탐색:
  Strategy 1: "어떤 feature가 이상치였나?" (z-score)
  Strategy 2: "비슷한 벡터는 언제였나?" (cosine)
  Strategy 3: "어떤 feature 조합이 반등을 예측하나?" (LightGBM)
    ↓
각 Strategy → walk-forward 검증 (overfitting 방지)
    ↓
결과 제시:
  "Strategy 3이 가장 좋음: OI+펀딩 조합, 승률 74%"
  "최적 threshold: OI +25~40%, 펀딩 -0.01~-0.03"
    ↓
유저 선택 → 실시간 스캔 등록
```

### 멀티 스냅 (시퀀스 패턴)

```python
# 단일 스냅으로 못 잡는 시퀀스 패턴
snaps = [
    PatternSnap("2024-11-20", label="급락"),    # Step 1
    PatternSnap("2024-11-21", label="OI 급등"), # Step 2
    PatternSnap("2024-11-22", label="진입"),    # Step 3
]
# → delta[0]: 급락→OI급등 사이 변화
# → delta[1]: OI급등→진입 사이 변화
# → timing: 각 단계 간격 (4h? 1d?)
# → "이 3단계 시퀀스와 유사한 과거 케이스"
```

---

## 6. LLM 역할 — 명확한 경계

### 하는 것

```
① 자연어 → 구조화된 조건 파싱
   "OI 급등에 펀딩 음전환이면 롱" 
   → {"oi_change_pct": {"op":"gte","val":25}, "fr": {"op":"lte","val":-0.01}}

② 결과 → 자연어 설명
   P(win)=0.68, top_features=[oi,fr,cvd]
   → "OI 급등 + 펀딩 음전환 조합. 비슷한 케이스 287건, 68% 반등."

③ 대화 인터페이스 (DOUNI)
   유저가 자연스럽게 패턴을 등록·조회·수정
```

### 하지 않는 것

```
❌ 진입/청산 판단 — LightGBM이 함
❌ 승률 계산 — walk-forward가 함
❌ 이미지 분석 — Alpha Hunter가 이미 숫자로 줌
❌ 재현성 없는 판단 — 같은 입력 = 같은 출력이어야 함
```

### LoRA 파인튜닝 목적

```
트레이딩 용어 파싱 정확도 향상:
  "숏펀비 꽉참" → fr < -0.05
  "넓은 아치 번지대" → bb_width > 0.08 AND price_position < 0.3
  "OI 급등" → oi_change_pct > 25

판단 개선이 아닌 번역 품질 개선.
```

---

## 7. 기술 스택 — 뭘 새로 만들고 뭘 가져다 쓰나

### 이미 있는 것 (건드리지 않음)

```
Alpha Hunter HTML       — 15레이어 스캔, CVD 직접 계산, 동작 중
WTD LightGBM           — D16 walk-forward 통과, 검증 완료
WTD 백테스트 엔진       — PnL, Sharpe, MDD 계산 완료
WTD 302 테스트          — 그대로 유지
Cogochi MCP 서버       — Claude Desktop 연결 설계 완료
Cogochi CLI            — cogochi scan/trade/learn 설계 완료
```

### 빠진 것 (만들어야 함, 우선순위 순)

```
1. Alpha Hunter → WTD feature_calc 연결     ★★★ 최우선
   (OI/CVD placeholder → 실제값)
   공수: 2~3일

2. CoinGlass/Coinalyze API 연결             ★★★
   (선물 히스토리 데이터 수집)
   공수: 3~5일

3. Pattern Refinement 엔진                  ★★
   (타임스탬프 → feature → 유사도 검색)
   공수: 1주

4. 멀티 스냅 시퀀스 엔진                    ★★
   (Step 1→2→3 패턴, delta+timing)
   공수: 1주

5. sim_trader.py + trade_log               ★★
   (Binance Testnet, 결과 자동 기록)
   공수: 2~3일

6. AutoResearch 루프 연결                  ★
   (trade_log → Hill Climbing → 재학습)
   공수: 3~5일

7. LoRA 파인튜닝 (Qwen3:35B, M1 로컬)     ★
   (트레이딩 용어 파싱 특화)
   공수: 환경 있음, 데이터 준비 필요
```

### 외부 플랫폼 역할

```
Surf AI       → L1 온체인 데이터 (거래소 입출금, 고래)
Hey Elsa x402 → L4 DeFi 실행 ($0.02/건)
Bankr         → 유통 채널 (DOUNI를 Skill로 등록)
freqtrade     → L4 백업 실행 엔진 (CEX)
```

---

## 8. 구현 순서 — 8주 플랜

### W1~2: 엔진 연결

```
목표: 실데이터로 첫 신호 발생

W1:
  □ Alpha Hunter OI/CVD 값 → WTD feature_calc.py 연결
  □ CoinGlass API 키 발급 → 선물 히스토리 수집 시작
  □ 연결 검증: 같은 시점 Alpha Hunter값 vs WTD feature값 일치 확인

W2:
  □ LightGBM 실데이터로 재학습
  □ Hill Climbing 적중률 검증 (시나리오 20개)
  □ "학습 전 45% → 후 58%" 데이터 확보

Gate: 실데이터 기반 P(win) 출력 동작
```

### W3~4: 패턴 엔진

```
목표: 타임스탬프 → 유사 케이스 → 승률

W3:
  □ feature snapshot 추출 (타임스탬프 입력)
  □ Strategy 1 구현 (FeatureOutlier, z-score)
  □ Strategy 3 구현 (TreeImportance, LightGBM)
  □ walk-forward gate 적용

W4:
  □ 멀티 스냅 입력 (2~3개 타임스탬프)
  □ delta + timing 계산
  □ TRADOOR 2024-11-22 패턴 테스트

Gate: "TRADOOR 타임스탬프 → 287건, 승률 68%" 출력
```

### W5~6: 실행 루프

```
목표: 신호 → 자동 주문 → 결과 기록 → 재학습

W5:
  □ sim_trader.py (Binance Testnet)
  □ 신호 → 가상 주문 → 1H 후 결과 자동 판정
  □ trade_log DB 저장

W6:
  □ AutoResearch 루프 연결 (trade_log → Hill Climbing)
  □ 첫 자동 학습 루프 동작 확인
  □ Elsa x402 API 연결 (dry_run=false, 소액 1건)

Gate: 학습 루프 1회 완전 동작
```

### W7~8: 제품화

```
목표: 베타 유저 10명, 수익화 구조

W7:
  □ DOUNI 자연어 파싱 (LoRA 또는 프롬프트 엔지니어링)
  □ MCP 서버 등록 → Claude Desktop에서 동작
  □ CLI (cogochi scan/pattern/trade/learn)
  □ 실거래 전환 (testnet=False, 소액 $100)

W8:
  □ Stripe 연결 (Free 시뮬 / Pro $29 실거래)
  □ 베타 10명 초대 (한국 트레이더 커뮤니티)
  □ 30일 성과 데이터 → HeyElsa 그랜츠 신청

Gate: 베타 10명, 월 $290+ MRR, Elsa 볼륨 $200+
```

---

## 9. Kill Criteria

### 중단 기준

| 시점 | 기준 | 의미 |
|------|------|------|
| W2 후 | Hill Climbing 개선 없음 | 데이터 quality 문제. 재설계. |
| W4 후 | 유사 검색 승률 < 55% | Pattern Refinement 방법론 재검토 |
| W6 후 | 시뮬 100건 기대값 마이너스 | 전략 자체가 안 됨. 패턴 재수집. |
| W8 후 | 베타 이탈률 > 70% | PMF 없음. 피벗 고려. |

### 리스크 방어

```
LightGBM 과적합 → walk-forward Stage 2 필수. OOS 검증 없으면 배포 금지.
Bear market     → Regime Filter 항상 켜둠. 하락장 롱 신호 전면 차단.
Elsa 의존성     → Binance API 직접 백업 유지. 단일 실행 파트너 금지.
알파 붕괴       → 패턴 임대(Market)에서 공개. 스캐너만 파는 구조.
```

---

## 10. 사업 모델

### 수익 구조

```
Free:
  시뮬 트레이딩만
  패턴 등록 3개까지
  알림 하루 5건

Pro ($29/월):
  실거래 실행
  패턴 무제한
  알림 무제한
  성과 대시보드
  패턴 수익률 추적

Market (Phase 2):
  내 패턴 검증 완료 → 다른 유저가 구독
  구독료의 15% take rate
  "내 전략이 수익 나면 수동 수입"
```

### TAM

```
글로벌 크립토 선물 활성 리테일 트레이더: ~500만 명
  (Binance 2.75억, 선물 활성 ~2%)

타겟: "수년 경험 + 자기 패턴 있는" 트레이더 ~50만 명
  (전체의 10%)

도구에 돈 낼 의향: ~5% = 2만 5천 명

월 $29 × 2만 5천 명 = $72.5만/월
월 $29 × 1만 명    = $29만/월   ← 현실적 목표
월 $29 × 1천 명    = $29,000/월 ← BEP 목표
```

### HeyElsa 그랜츠 경로

```
지금 준비:
  □ cogochi-mcp GitHub 공개
  □ W2: Hill Climbing "45% → 58%" 숫자
  □ W6: Elsa x402 실 트랜잭션 1건
  □ "Cogochi 통해 Elsa 볼륨 $X" 데이터

신청 경로:
  1. Base Builder Grants (Coinbase 생태계)
  2. Elsa x402 케이스스터디 공동 발표
  3. Elsa AgentOS 등록
```

---

## 11. 핵심 원칙 — 절대 바뀌지 않는 것

```
1. LLM은 판단하지 않는다
   → 재현 가능성. 백테스트 신뢰. 학습 루프 의미.

2. 수치가 수치를 최적화한다
   → Hill Climbing은 LLM 없이 돌아간다.
   → "더 느낌으로 조정"은 없다.

3. 유저는 타임스탬프만 찍어도 된다
   → 조건을 코딩할 줄 몰라도 패턴을 등록할 수 있어야 한다.

4. 세 레이어가 동시에 맞아야 시그널이다
   → 현물만, 선물만, 온체인만으로는 노이즈.
   → 크로스 레이어 합성이 차별화.

5. 실거래 전에 반드시 walk-forward 통과
   → D16 검증이 이미 선례. 이 기준은 낮추지 않는다.
```

---

## 12. 지금 당장 할 것 — 하나

```
Alpha Hunter의 CVD·OI·펀딩비 실제값을
WTD feature_calc.py의 placeholder에 연결한다.

이게 되면:
  - D16 검증된 LightGBM이 실데이터로 처음 돌아감
  - Pattern Refinement의 기반 데이터가 생김
  - 30일 안에 "이게 진짜 신호를 내는가" 확인 가능

이게 안 되면:
  - 나머지 모든 설계가 의미 없음

WTD 레포 경로 → 바로 코드 작성 시작.
```

---

*WTD × Cogochi Final Design v1.0 | Holo Studio | 2026.04.12*
