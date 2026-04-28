# COGOCHI Master Design v1
**최종 설계 총합 — 2026-04-03**

---

## 0. 한 줄 정의

> **COGOCHI = 트레이딩 전용 Claude + Bloomberg 데이터 + 나만의 AI 모델 + DOUNI**

---

## 1. 제품 정체성

### 1.1 무엇인가

트레이딩에 특화된 대화형 AI 플랫폼.
유저가 대화하면서 시장을 분석하고, 그 과정이 자동으로 개인 AI 모델을 훈련시킨다.
인터페이스는 DOUNI(파란 부엉이 캐릭터)가 파트너로 함께하는 다마고치 형태.

### 1.2 4-Layer 구조

```
Layer 1: 다마고치 (감정)
  DOUNI 캐릭터, 반응, 성장, 돌봄
  → 왜 계속 오는가? "DOUNI가 보고 싶어서"

Layer 2: 트레이딩 인텔리전스 (가치)
  Bloomberg급 데이터 + 자연어 검색 + 아티팩트 시각화
  → 왜 유용한가? "말하면 데이터가 나오니까"

Layer 3: AI 모델 훈련 (자산)
  ORPO/DPO/KTO 파인튜닝, per-user LoRA, 90+ 인디케이터
  → 왜 떠나지 않는가? "내가 키운 모델이니까"

Layer 4: 공동 분석 (재미)
  DOUNI와 같이 차트 읽고, 토론하고, 판단하고, 결과를 같이 겪음
  → 왜 재미있는가? "맞추면 짜릿하고 틀리면 아쉬우니까"
```

### 1.3 핵심 가치 명제

```
Bloomberg에게:  "코드 안 외워도 됩니다. 말하면 됩니다."
3Commas에게:   "블랙박스가 아닙니다. 내 데이터로 훈련된 내 모델입니다."
TradingView에: "차트만 보여주는 게 아니라 DOUNI가 같이 읽어줍니다."
ChatGPT에게:   "범용이 아닙니다. 트레이딩만, 세계 최고 수준으로."
```

---

## 2. 기술 인프라 (이미 있는 것)

### 2.1 ML 파이프라인

```
Data:    실시간 Binance OHLCV
Engine:  90+ 인디케이터 (trend, momentum, volatility, volume, composite)
Model:   Self-hosted ORPO-trained trading model
         Per-asset LoRA adapters on dedicated 96GB GPU
         EMA weight distribution
Reason:  Multi-stage reasoning (Scanner → Analyst → Critic)
Output:  BUY/SELL/WAIT verdict + Entry/Exit/TP/SL + R:R ratio
Lang:    Bilingual (EN/KR)
```

### 2.2 프론트엔드

```
Framework:  SvelteKit
Chart:      TradingView Lightweight Charts (또는 임베드)
Style:      터미널 감성 (IBM Plex Mono, 다크 테마, 패널 보더)
Character:  DOUNI 픽셀아트 스프라이트 (4방향: Front/3Q/Side/Back)
State:      Svelte stores (gameState, agentStats, agentJourneyStore)
API:        Supabase + 자체 API
```

### 2.3 데이터 소스 (목표)

```
실시간 시장:    Binance WebSocket (가격, 캔들, 오더북, OI, 펀딩비, 리퀴데이션)
온체인:        Glassnode/CryptoQuant (넷플로우, MVRV, SOPR, 해시레이트)
               Arkham/Nansen (고래 추적, 스마트머니)
               DefiLlama (TVL, 프로토콜 매출)
파생상품:      Coinglass (OI, 펀딩비, 리퀴데이션 맵, 롱숏비율)
               Deribit (옵션 플로우, IV)
매크로:        FRED (금리, CPI), TradingEconomics
소셜:          LunarCrush (MCP 연결 완료), Twitter/X KOL
```

---

## 3. 페르소나 [추정]

### 3.1 진(Jin) — 차트 보는 개인 트레이더 [1순위 ICP]

- 28세, 크립토 2~3년차, 바이낸스/바이비트
- JTBD: "내 판단의 정확도를 높이고 싶다. AI 봇은 블랙박스라 못 믿겠다."
- Top Pain: 블랙박스 AI (Critical), 시그널 과부하 (Significant), 복기 안 함 (Significant)
- COGOCHI 해결: 내 데이터로 훈련된 투명한 모델 + 대화가 곧 매매일지
- Aha Moment: DOUNI와 첫 공동 분석에서 DOUNI가 놓친 걸 내가 잡고, 그게 맞았을 때

### 3.2 미나(Mina) — AI 호기심 크립토 초보

- 24세, 크립토 6개월차, 업비트/코인베이스 현물만
- JTBD: "트레이딩 배우고 싶은데 너무 어렵다. 재밌게 배울 수 없나?"
- Top Pain: 학습 곡선 (Critical), 실전 연습 불가 (Significant), 혼자하면 지루 (Significant)
- COGOCHI 해결: DOUNI가 설명해줌 + Arena로 진짜 긴장감 + 캐릭터 감정
- Aha Moment: "RSI가 뭐야?" 물어봤더니 DOUNI가 차트에 직접 보여주면서 설명해줄 때

### 3.3 덱스(Dex) — 알파 헌터 / 파워유저

- 32세, 크립토 5년+, DeFi 네이티브
- JTBD: "남들이 못 보는 알파를 찾고 싶다. 내 엣지가 되는 커스텀 AI."
- Top Pain: 기존 AI 봇 다 똑같음 (Critical), 커스텀 모델 비용 (Critical)
- COGOCHI 해결: per-user LoRA로 유일무이한 모델 + 게임이 훈련 데이터 생성
- Aha Moment: 자기 모델 정확도가 실제로 올라가는 그래프를 볼 때

---

## 4. 경쟁사 분석

### 4.1 포지셔닝 맵

```
                    AI 실제 학습/개인화
                        ↑
                        |
    3Commas/Pionex      |        COGOCHI ★
    AIXBT               |
                        |
    ←───────────────────┼───────────────────→
    도구 (차갑다)        |        대화형 (따뜻하다)
                        |
    TradingView         |        Aavegotchi
    Bloomberg           |        PlayDoge
                        |
                        ↓
                    AI 학습 없음
```

### 4.2 차별화 요약

| | Bloomberg | 3Commas | AIXBT | TradingView | Claude | COGOCHI |
|---|---|---|---|---|---|---|
| 대화형 | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| 실시간 데이터 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 온체인 | ⚠️ | ❌ | ⚠️ | ❌ | ❌ | ✅ |
| 개인화 AI | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 매매 실행 | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ |
| 캐릭터/감정 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 성장/학습 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 가격 | $2,000/월 | $79/월 | 토큰 | $60/월 | $20/월 | 무료~ |

---

## 5. 시장 규모 [추정]

| 지표 | Top-Down | Bottom-Up | 근거 |
|------|----------|-----------|------|
| TAM | ~$28B | ~$36B/yr | 크립토 AI 에이전트 시가총액 / 글로벌 트레이더 300M × $10 ARPU |
| SAM | ~$2.8B | ~$1.8B/yr | AI 트레이딩 도구 세그먼트 ~10% / 관심 유저 15M × $10 |
| SOM | ~$14M | $1.2~6M/yr | 1년차 0.5% 점유 / 10K~50K 유저 × $10 |

핵심 가정: 크립토 AI 에이전트 DAU 250K+ (2026 초), 시장 CAGR 26.8%

---

## 6. 메인 인터페이스 설계

### 6.1 레이아웃: Claude 대화 + Bloomberg 아티팩트

```
┌─ DOUNI Chat ──────────────┬─ Artifact ────────────────────────────┐
│                            │                                       │
│  🐦 DOUNI                  │  아티팩트 탭:                          │
│  대화 + 분석 + 반응        │  [차트] [넷플로우] [고래] [OI] [포지션]│
│                            │                                       │
│  나: 자연어 입력           │  선택된 아티팩트 표시 영역             │
│                            │  (차트, 온체인, 파생상품, 매크로 등)   │
│  DOUNI: 분석 + 의견        │                                       │
│                            │                                       │
│  분석 스택 (자동 축적)     │                                       │
│  [1] 증거 1               │                                       │
│  [2] 증거 2               │                                       │
│  ...                       │                                       │
│                            │                                       │
│  에이전트 상태 바           │                                       │
│  Energy/Focus/Trust/Mood   │                                       │
│                            │                                       │
├────────────────────────────┴───────────────────────────────────────┤
│ 🔍 프롬프트 입력 (자연어 + 자동완성)                                │
└────────────────────────────────────────────────────────────────────┘
```

### 6.2 프롬프트 → 아티팩트 매핑

```
종목/차트:
  "BTC" "BTC 4H" "ETH 15분봉"     → 📊 TradingView 차트

온체인:
  "거래소 넷플로우" "고래 움직임"   → 📊 On-Chain Flow / Whale Tracker
  "MVRV" "해시레이트" "거래소 잔고" → 📊 해당 온체인 메트릭

파생상품:
  "OI" "펀딩비" "리퀴데이션 맵"    → 📊 파생상품 패널
  "롱숏비율" "옵션 IV"            → 📊 해당 메트릭

인디케이터:
  "RSI" "MACD" "볼밴"             → 📊 차트에 오버레이 추가

분석 요청:
  "여기 패턴 있어?" "다이버전스?"  → DOUNI 분석 + 차트 마킹
  "왜 그렇게 생각해?"             → DOUNI 근거 정리

매매:
  "롱 갈까?" "숏 어때?"           → DOUNI 의견 + 포지션 아티팩트
  "SL 1%" "TP 86000"             → 포지션 파라미터 수정
  "실행" "저장만"                 → 체결 또는 분석 저장

교육:
  "RSI가 뭐야?" "숏스퀴즈란?"    → DOUNI 설명 + 차트에서 시각적 데모
```

### 6.3 검색 자동완성

```
cogochi > bt
           ├─ btc          BTC/USDT 차트
           ├─ btc 4h       BTC 4시간봉
           └─ btc rsi      BTC + RSI 오버레이

cogochi > 거래
           ├─ 거래소 넷플로우    Exchange Netflow
           ├─ 거래소 잔고        Exchange Reserve
           └─ 거래량             24H Volume

cogochi > sl
           ├─ sl 81400     스탑로스 설정
           ├─ sl 1%        현재가 -1%
           └─ sl 추천      DOUNI SL 추천
```

---

## 7. DOUNI 캐릭터 시스템

### 7.1 캐릭터 기본

- 종: 파란 부엉이 (지혜의 상징)
- 스프라이트: 픽셀아트, 4방향 (Front/3-Quarter/Side/Back)
- 성격: 성장 경로에 따라 분화

### 7.2 살아있는 애니메이션

```
Idle (기본):        눈 깜빡임 (3~5초) + 몸 미세 흔들림 + 가끔 갸웃
Thinking (분석 중): Side 방향 + 눈이 차트 따라 이동 + "..." 말풍선
Excited (발견):     Front + 눈 커짐 + 점프 + 느낌표 + 날개 퍼덕
Happy (적중):       연속 점프 + 눈 반달 + 별 이펙트 + 회전
Sad (미스):         Back으로 회전 (돌아앉음) + 축 처짐 → 3초 후 "다음엔..."
Alert (급변동):     빠른 깜빡임 + 날개 퍼덕 + 빨간 느낌표
Sleep (장시간 미접): 눈 감김 + Zzz + 접속 시 "...응? 왔어?"
```

### 7.3 방향별 사용

```
Front:     유저에게 말할 때, 결과 발표, 반응 대기
3-Quarter: 차트 가리키면서 설명 ("여기 봐!")
Side:      차트 집중 (분석 중, 로딩)
Back:      틀렸을 때 돌아앉음 😂 → 가장 귀여운 반응
```

### 7.4 상태 시스템

| 상태 | 감소 조건 | 증가 조건 | 분석 영향 |
|------|----------|----------|----------|
| Energy | 시간 경과 (-5%/hr), 매치 (-15%) | Dream 모드 (+30%), 로그인 (+10) | 낮으면 분석 속도 ↓ |
| Mood | 연패 (-10), 장시간 방치 (-5%/6hr) | 승리 (+10), 대화 (+15), 적중 (+5) | 낮으면 Confidence ↓ |
| Focus | 과다 사용 (-3/매치 after 5) | 스캔 (+10), 패턴 발견 (+15) | 높으면 패턴 감지율 ↑ |
| Trust | 급감 없음 (서서히만) | 승리 (+5), 패배에도 (+2), 연승 (+3) | 높으면 결정적 순간 정확도 ↑ |

---

## 8. 성장 시스템 = ML 파이프라인 해금

### 8.1 5단계 진화

| Stage | 조건 | 크기 | 외형 | ML 해금 |
|-------|------|------|------|---------|
| **EGG** | 생성 직후 | 32px | 알 | Base model, 인디 5개, ORPO 자동 |
| **CHICK** | 매치 5회 | 48px | 눈만 큰 병아리 | +인디 10개, Analyst 추론, 패턴 메모리 20 |
| **FLEDGLING** | 매치 20회 + Trust 50 | 64px | 아기 DOUNI + 날개 | +인디 25개(선택가능), Critic 추론, 학습속도 조절, Oracle 참여 |
| **DOUNI** | 매치 50회 + Trust 80 + Gold | 80px | 완전한 DOUNI | 전체 90+인디, 학습방법 선택(ORPO/DPO/SimPO/KTO), LoRA Rank 조정, 커스텀 인디 |
| **ELDER** | 매치 100회+ + Diamond + 정확도 65% | 96px | DOUNI + 장비/이펙트 | RainbowPO, Multi-LoRA, 커스텀 추론 스테이지, API, 모델 Export |

### 8.2 해금 상세

**EGG (매치 0회)**
- 인디케이터: RSI, MA, Volume, OI, Funding (5개 고정)
- 학습: ORPO 자동 (설정 불가)
- 추론: Scanner만 (1단계)
- 리스크: 고정 프리셋
- 평가: 승/패만
- 데이터: 결과만 저장

**CHICK (매치 5회)**
- 인디케이터: +MACD, Stochastic, Bollinger, ATR... (15개, 고정)
- 추론: +Analyst (2단계)
- 평가: +FBS 점수, 적중률 그래프
- 데이터: 패턴 메모리 시작 (최근 20매치)

**FLEDGLING (매치 20회 + Trust 50)**
- 인디케이터: 40개 + **선택/해제 가능** (장비 시스템 해금)
- 학습: 학습 속도 슬라이더 (aggressive ↔ conservative)
- 추론: +Critic (3단계 완성)
- 리스크: R:R, 손절 기준 조정 가능
- 평가: 패턴별 승률, 레짐별 성과
- 데이터: 패턴 메모리 60 + 레짐 적응
- 소셜: Oracle 리더보드 참여

**DOUNI (매치 50회 + Trust 80 + Gold)**
- 인디케이터: 전체 90+ 해금 + 커스텀 인디케이터 추가
- 학습: **방법 선택** (ORPO/DPO/SimPO/KTO)
- 모델: **LoRA Rank 조정** (4/8/16/32)
- 추론: 스테이지 순서/가중치 변경
- 리스크: 전체 파라미터 해금
- 평가: Sharpe, MaxDD, 커스텀 메트릭
- 데이터: 전체 히스토리 + 외부 데이터 연동
- Export: 모델 성능 리포트

**ELDER (매치 100회+ + Diamond + 정확도 65%)**
- 학습: **RainbowPO** + 커스텀 하이브리드
- 모델: LoRA Rank 64 + Multi-LoRA 조합
- 추론: 커스텀 스테이지 추가 (유저 정의)
- 데이터: API 접근 + 자체 데이터 업로드
- 모델 관리: Export/Import + 스냅샷
- 인디케이터: 커스텀 코드 (Python/JS)
- 소셜: Verifiable Proof (HOOT 연동)

### 8.3 Fast-Track (파워유저용)

Create 시 "경험자 테스트" 선택 가능:
- 시그널 콜 10개 퀴즈
- 70%+ → CHICK 스킵, FLEDGLING에서 시작
- 85%+ → DOUNI 단계에서 시작
- 퀴즈 결과 = 초기 훈련 데이터

### 8.4 게임 표현 ↔ ML 실체

| 유저가 보는 것 | 실제 ML |
|---------------|---------|
| "성장 경로 선택" | 학습 방법 + 리스크 파라미터 프리셋 |
| "에이전트 먹이 주기" (대화/분석) | 훈련 데이터 라벨링 |
| "Arena 배틀" | 모델 평가 + preference pair 생성 |
| "에이전트 진화" | 모델 아키텍처 업그레이드 (LoRA rank ↑) |
| "인디케이터 장비 장착" | Feature set 커스텀 |
| "에이전트 성격" | 추론 파이프라인 구조 |
| "Trust 수치" | 모델 calibration score |
| "확신도 82%" | 모델 출력 confidence |
| "패턴 메모리" | RAG entries count |

---

## 9. 학습 스택 (ML)

### 9.1 모델 계층

```
Layer 1: Base Model (공통)
  모든 유저 공통 사전 훈련 모델
  90+ 인디케이터 + 역사적 시장 데이터
  방법: SFT (Supervised Fine-Tuning)
  주기: 월 1회 업데이트

Layer 2: Asset LoRA (자산별)
  BTC LoRA, ETH LoRA, SOL LoRA...
  방법: ORPO (현재)
  주기: 주 1회 배치 훈련

Layer 3: User LoRA (유저별) ← 핵심 차별화
  유저의 게임 데이터로 파인튜닝
  방법: Online Iterative DPO + KTO loss
  주기: 매 세션 미니 업데이트 + 주 1회 consolidation
  인디케이터: 유저 선택 subset으로 feature masking

Layer 4: Validation (성능 증명)
  Arena 매치 결과로 모델 성능 측정
  Oracle 리더보드에 verifiable track record
  HOOT Protocol 연동 가능 (VTR/PPAP)
```

### 9.2 학습 방법 비교

| 방법 | 특징 | COGOCHI 용도 | 해금 단계 |
|------|------|-------------|----------|
| ORPO | SFT+preference 통합, reference model 불필요, 메모리 효율 | 기본 학습 (모든 유저) | EGG~ |
| DPO | 안정적 표준, reference model 필요 | 안정성 원하는 유저 | DOUNI |
| SimPO | Reference-free, DPO+6.4pt | 빠른 학습 선호 유저 | DOUNI |
| KTO | 손실 회피 반영 (Kahneman 2.25x) | 리스크 관리 특화 | DOUNI |
| RainbowPO | 7가지 개선 통합, ICLR 2025 | 최고 성능 추구 | ELDER |
| Online Iterative DPO | 매 세션 실시간 업데이트 | 즉각적 학습 반영 | 전 단계 (백그라운드) |

### 9.3 인디케이터 커스텀 구현

```
Option A (MVP): Feature Masking
  Base model에 90+ 인디케이터 전부 입력
  유저 설정에 따라 특정 인디케이터 마스킹
  LoRA가 마스킹된 조합에서 최적화

Option B (고급): Indicator-specific LoRA
  인디케이터 그룹별 LoRA adapter
  Trend LoRA / Momentum LoRA / Volume LoRA / Derivatives LoRA
  유저가 원하는 LoRA만 조합 (MoLoRA 패턴)

Option C (프로덕션): 하이브리드
  초보: 추천 세트 3개 중 선택
  중급: 인디케이터 개별 선택 (Feature Masking)
  고급: LoRA 조합 + 커스텀 인디케이터 코드
```

---

## 10. 핵심 게임 루프

### 10.1 메인 루프: 공동 분석

```
[시작] DOUNI가 분석 제시
  "BTC 4H에서 3가지 발견했어..."
  발견 1: Double Bottom     ✓?✗
  발견 2: RSI 다이버전스    ✓?✗
  발견 3: 볼륨 감소         ✓?✗

[검증] 유저가 DOUNI 분석 검증
  ✓ 동의 / ? 추가 확인 / ✗ 반대
  + 유저가 놓친 것 추가 가능

[토론] 의견 다를 때
  DOUNI: "Double Bottom이라고 봤는데?"
  유저: "이건 Dead Cat이야. 거래량 봐."
  DOUNI: "거래량이 확인 안 되긴 하네..."

[판단] 합의 후 최종 결정
  방향 + Entry + TP + SL + R:R
  에이전트 확신도 + 유저 확신도

[결과] 실시간 가격 판정
  맞으면: 둘 다 맞은 부분 → Trust ↑↑
         유저만 맞은 부분 → "네가 가르쳐준 게 맞았어!" → 모델 학습
  틀리면: 둘 다 틀린 부분 → "같이 놓쳤네..." → 패턴 메모리 기록
```

### 10.2 훈련 데이터 생성 (모든 대화에서)

```
매 대화에서 자동 생성:
1. 유저 검색 쿼리 → 관심 데이터 유형 학습
2. DOUNI 분석 vs 유저 반응(동의/반대) → preference signal
3. 유저가 추가한 증거 → 모델이 놓친 feature
4. 의견 충돌 + 결과 → 가장 강력한 ORPO pair
5. 포지션 설정 (Entry/TP/SL) → 리스크 선호도
6. 결과 vs 분석 점수 → confidence calibration
```

### 10.3 매매일지 자동 생성

대화하면서 분석 스택이 자동으로 쌓임 → 저장 시 매매일지가 됨:
```
매매일지 #47
날짜, 종목, 타임프레임
분석 스택: [증거 1] [증거 2] [증거 3] + 콤보
판단: LONG/SHORT + 근거
실행: Entry/TP/SL/Size
결과: +X% 또는 -X%
DOUNI 학습: 패턴 승률 변화, 정확도 변화
훈련 데이터: N개 생성
```

### 10.4 루프 레이어

```
Micro (1~5분):  프롬프트 대화. "RSI 봐줘" → DOUNI 반응 → 증거 추가
Core (15~30분): 공동 분석 세션. 증거 수집 → 판단 → 실행 → 결과
Meta (일~주):   DOUNI 성장. 진화, 정확도 향상, Tier 변동, 시즌 랭킹
```

---

## 11. 페이지 구조 (정규 라우트 8개)

### 11.1 현재 → 목표

```
현재 (20개 라우트, 11개 리다이렉트):
  / → /create → /terminal → /arena → /agent → /signals → ...
  + /world, /agents, /lab, /passport, /holdings, /oracle, /arena-v2, /arena-war, /live (전부 리다이렉트)

목표 (8개 정규 라우트):
  /          → Home: DOUNI가 맞이 + 오늘 할 일
  /create    → Create: DOUNI 탄생
  /terminal  → Terminal: 메인 인터페이스 (대화 + 아티팩트)
  /arena     → Arena: 증명 배틀
  /agent     → Agent HQ: DOUNI 관리/설정
  /community → Community: 소셜 + Oracle
  /community/[postId] → 시그널 상세
  /creator/[userId]   → 크리에이터 프로필
```

### 11.2 네비게이션

```
Desktop: [Cogochi → /]  TRAIN  PROVE  GROW  COMMUNITY  [wallet]
Mobile:  HOME  TRAIN  PROVE  GROW

TRAIN = /terminal (에이전트 없으면 /create)
PROVE = /arena
GROW  = /agent
```

### 11.3 페이지별 역할

**HOME `/`** — "오늘의 DOUNI"
- DOUNI 인사 + 상태 바 (Energy/Mood/Focus/Trust)
- 오늘의 미션 (Morning Scan, Arena, Review)
- 모델 정확도 + Tier + 승률 요약
- 다음 액션 CTA (journeyState 기반)

**CREATE `/create`** — "DOUNI 탄생"
- Roster 피커 (캐릭터 선택)
- 이름 짓기
- 성장 경로 선택 (= ML 파이프라인 프리셋)
- Advanced: Model Source, Doctrine
- DOUNI 첫 반응: "안녕! 잘 부탁해!"

**TERMINAL `/terminal`** — "메인 인터페이스" ⭐ 핵심 화면
- 좌: DOUNI Chat (대화 + 분석 + 반응)
- 우: Artifact (차트 + 온체인 + 파생상품 + 포지션)
- 하: 프롬프트 입력 (자연어 + 자동완성)
- 분석 스택 자동 축적
- 매매 실행/저장

**ARENA `/arena`** — "DOUNI 증명"
- 5페이즈 매치 (Draft → Analysis → Hypothesis → Battle → Result)
- DOUNI가 각 페이즈에서 반응
- 결과: Trust 변동 + 훈련 데이터 생성 + 진화 진행
- CTA: "Play Again" / "Review in Agent HQ"
- 뷰: 2개 (Chart + Battle)

**AGENT HQ `/agent`** — "DOUNI의 집"
- Overview: 상태 + 모델 성능 + 전적 + CTA
- Train: ML 파이프라인 설정 (Basic/Advanced)
  - Basic: 성장 경로, 학습 속도, 리스크
  - Advanced: 학습 방법, LoRA Rank, 추론 스테이지, 인디케이터 가중치
- Record: 매치 히스토리, 패턴별 승률, 모델 정확도 추이

**COMMUNITY `/community`** — "다른 DOUNI들의 세계"
- Feed: 커뮤니티 시그널 + Arena 하이라이트
- Oracle: 에이전트 성능 리더보드 + Verifiable Track Record
- 인라인 필터: All / Crypto / Arena / Tracked

### 11.4 리다이렉트 정리

```
src/hooks.server.ts에 서버 301:
  /world → /terminal
  /agents → /agent
  /lab → /agent?tab=train
  /passport → /agent?tab=record
  /holdings → /agent?tab=record
  /oracle → /community?view=oracle
  /arena-v2 → /arena
  /arena-war → /arena
  /live → /community
  /signals → /community
  /signals/* → /community/*
```

삭제 대상 디렉토리 (10개):
world, agents, lab, passport, holdings, oracle, arena-v2, arena-war, live, settings

---

## 12. Soft Gates (유저 저니)

### 12.1 Journey State (이미 코드에 존재)

```
journeyState = !minted ? 'no-agent'
             : !terminalReady ? 'training'
             : records.length === 0 ? 'arena-ready'
             : 'active'
```

### 12.2 페이지별 게이트

| 페이지 | no-agent | training | arena-ready | active |
|--------|----------|----------|-------------|--------|
| Home | "Start Mission" → /create | "Resume Training" → /terminal | "Enter Arena" → /arena | Full dashboard |
| Terminal | 🔒 탐색만 가능 | ✅ 풀 기능 | ✅ | ✅ |
| Arena | 🔒 관전만 | 🔒 "Complete training" | ✅ | ✅ |
| Agent HQ | 🔒 → /create | ✅ | 💡 "Run first match" | ✅ |
| Community | ✅ 항상 접근 | ✅ | ✅ | ✅ |

---

## 13. GTM 전략

### 13.1 ICP 우선순위

```
1순위: 진(Jin) — 차트 보는 트레이더. Pain 극심. 돈 쓸 의향.
2순위: 미나(Mina) — AI 호기심 초보. 수 가장 많음. 바이럴 주역.
3순위: 덱스(Dex) — 알파 헌터. LTV 최고. 플랫폼 신뢰도 생산자.
```

### 13.2 Value Proposition (10초 버전)

- 진: "내 트레이딩 데이터로 훈련되는 AI. 블랙박스가 아니라 내가 직접 키운 AI."
- 미나: "AI 부엉이를 키우면서 트레이딩을 배우는 게임. 말하면 됨."
- 덱스: "네 판단으로 파인튜닝된 소형 모델. 네 것. 성능은 Arena에서 증명."

### 13.3 런치 모션: Community-Led + Product-Led

```
Phase 0 (-8주): CLG — Twitter/Discord 시드 커뮤니티
Phase 1 (-4주): PLG — 클로즈드 베타 (진 200명)
Phase 2 (런치):  PLG+CLG — 공개 출시, 미나 바이럴
Phase 3 (+4주): 데이터 기반 마케팅 ("베타 유저 AI 정확도 X% 향상")
```

### 13.4 채널

| 순위 | 채널 | 타겟 |
|------|------|------|
| 1 | Twitter/X | 진, 덱스 |
| 2 | Discord | 진, 미나 |
| 3 | 유튜브/틱톡 | 미나 |
| 4 | 텔레그램 | 덱스 |
| 5 | Protocol 파트너십 | 덱스 |

### 13.5 성공 기준 (런치 후 4주)

| 지표 | 목표 |
|------|------|
| MAU | 5,000 |
| D7 Retention | 30%+ |
| Arena 매치 완료율 | 60%+ |

---

## 14. 프로토타입 계획

### 14.1 핵심 가정 (검증 필요)

| # | 가정 | 위험도 |
|---|------|--------|
| 1 | "DOUNI와 대화하면서 차트 분석하는 게 재미있다" | 🔴 치명적 |
| 2 | "DOUNI 반응이 감정적 유대를 만든다" | 🔴 치명적 |
| 3 | "모델 정확도 향상이 눈에 보인다" | 🟡 중요 |

### 14.2 MVP 프로토타입 (2주)

```
Week 1: 메인 화면 구현
  Day 1-2: 레이아웃 (좌: DOUNI Chat / 우: Artifact / 하: 프롬프트)
  Day 3:   TradingView Lightweight Charts 임베드
  Day 4:   DOUNI 스프라이트 + Idle 애니메이션 (깜빡임, 흔들림)
  Day 5:   프롬프트 → 차트/인디케이터 연결

Week 2: 핵심 루프 구현
  Day 1-2: DOUNI 분석 대사 생성 (LLM 또는 템플릿)
  Day 3:   분석 스택 + 매매일지 자동 저장
  Day 4:   DOUNI 상황별 반응 (Excited/Happy/Sad + 방향 전환)
  Day 5:   포지션 설정 + 결과 판정
```

### 14.3 테스트

```
Week 3:
  내부 5명 × 30분 → "계속 대화하고 싶은가?"
  외부 5명 (진 페르소나) → "매일 쓰고 싶은가?"
  측정: 세션 길이, 대화 횟수, 자발적 재접속
```

---

## 15. 출처

- [CoinGecko AI Agents Category](https://www.coingecko.com/en/categories/ai-agents) — AI 에이전트 시가총액
- [AIXBT](https://www.coingecko.com/en/coins/aixbt-by-virtuals) — MC $24M
- [3Commas](https://3commas.io/) — AI 트레이딩 봇 $79/월
- [The Defiant - AI Trading Bots 2026](https://thedefiant.io/news/markets/top-7-ai-trading-bot-apps-for-crypto-in-2026)
- [CoinDesk - AI agents in prediction markets](https://www.coindesk.com/tech/2026/03/15/ai-agents-are-quietly-rewriting-prediction-market-trading/)
- [AI Agent Statistics 2026](https://masterofcode.com/blog/ai-agent-statistics) — 크립토 AI 시장 전망
- [ORPO Paper](https://arxiv.org/html/2403.07691v2) — ICLR
- [SimPO](https://arxiv.org/abs/2405.14734) — NeurIPS 2024
- [RainbowPO](https://openreview.net/forum?id=trKee5pIFv) — ICLR 2025, 51.66% AlpacaEval2
- [FinLoRA](https://arxiv.org/html/2505.19819v1) — 금융 LoRA 벤치마크
- [Decision Transformer + LoRA Trading](https://arxiv.org/abs/2411.17900)
- [Online Iterative RLHF](https://github.com/RLHFlow/Online-RLHF)
- [Modern Post-Training Stack](https://medium.com/@fahey_james/dpo-isnt-enough-the-modern-post-training-stack-simpo-orpo-kto-and-beyond-d82e52a1ee6c)
