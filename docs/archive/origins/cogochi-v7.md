# Cogochi — 통합 설계서 v7

**2026-04-12 | Holo Studio | CPO × CTO × AI Research Lead**

이 문서 하나가 Cogochi 제품의 전부다. 코드 없이 "무엇이 어떻게 돌아가야 하는가"만 다룬다.

---

## §1. 한 줄 정의

> **내 판단을 학습하는 나만의 트레이딩 AI. 쓸수록 나를 닮고, 나보다 정확해진다.**

Minara는 "모두의 AI CFO". Cogochi는 "나만의 AI 트레이더". 같은 질문을 해도 Minara는 모든 유저에게 같은 답을 준다. Cogochi는 네가 6개월간 동의/반박한 판단이 녹아든 모델이 답한다.

### 다섯 동사

**Capture → Scan → Judge → Train → Deploy**

1. **Capture** — Terminal에서 차트를 보고, 자연어로 패턴을 구성하고, Challenge로 저장
2. **Scan** — 저장된 Challenge를 30개 코인 × 6년치 1시간봉에서 평가. 실시간으로 최신 바 매칭
3. **Judge** — 매칭된 자리에서 가격이 유리하게 움직였는지 PnL 기반으로 판정
4. **Train** — 검증된 엣지를 LightGBM으로 모델화, 이후 LoRA로 자연어 추론 레이어
5. **Deploy** — 학습된 모델이 실시간 시그널 생성. 성능이 기존보다 나은 경우에만 교체

### 타협하지 않는 것

1. 측정 없이 배포 없다 — 모든 패턴은 expectancy 기반 PnL 검증을 통과해야 실전 투입
2. 보너스 구조 — AI 상태가 낮아도 기본 성능 100%. 높으면 보너스만 추가
3. Phase 1은 진(Jin) 한 명만 — 초보자 교육, 파워유저 API는 Phase 2~3
4. 단일 정본 — 설계 문서는 이 파일 하나

### 경쟁 포지션

```
                    AI 패턴 학습 / 개인화
                            ↑
                            |
    3Commas                 |        Cogochi ★
    AIXBT                   |        (대화→패턴→스캔→ML)
                            |
    ←───────────────────────┼──────────────────────→
    규칙 설정 (어렵다)        |        대화 (쉽다)
                            |
    TradingView             |
    Bloomberg               |
                            ↓
                    AI 학습 없음
```

---

## §2. 경쟁 분석 — Minara

### Minara 개요

Web3 전용 AI 금융 어시스턴트. NFTGo(10M+ 유저) 팀, Circle Ventures 투자. DMind Web3 특화 foundation model. 2025년 8월 베타, 현재 운영 중. Starter $49/월, Partner $199/월.

핵심 기능: 50+ 데이터 프로바이더, Agent Factory(자연어 자동매매 봇), 온체인 트레이드 실행(스팟+선물 20x), AA(ERC-4337) 커스토디얼 월렛, 가스 없는 멀티체인(6개 체인), Vibe Trading(센티먼트 매매), Deep Research.

### 비교

| 기능 | Minara | Cogochi |
|------|--------|---------|
| 온체인 트레이드 실행 | ✅ 스팟+선물 | ❌ (알림만) |
| 멀티체인 월렛 | ✅ 6개 체인 | ❌ |
| 50+ 데이터소스 | ✅ | 부분 |
| 워크플로우 자동화 | ✅ Agent Factory | ❌ |
| iOS 앱 | ✅ | ❌ |
| VC 투자 | ✅ Circle Ventures | ❌ |
| **per-user LoRA** | **❌** | **✅ 유저 판단 학습** |
| **패턴 검증 4단계** | **❌** | **✅ in-sample→walk-forward→paper→live** |
| **LightGBM 알파 엔진** | **❌** | **✅ +2.08% excess, t≈28σ** |
| **PnL 측정 시스템** | **❌** | **✅ path walk + portfolio sim** |
| **정확도 향상 증명** | **❌** | **✅ NSM** |

### 전략적 결론

같은 판에서 싸우면 진다. 이길 수 있는 유일한 축 = **per-user 학습**. Minara Product Hunt 유저 피드백: "내가 관심 있는 분야에서는 AI보다 내가 더 잘 안다" — 범용 모델의 구조적 한계.

**Non-Goals (Minara와 경쟁 안 하는 것):**
- ❌ 50+ 데이터소스 직접 빌드 → Phase 3+ 파트너십
- ❌ 온체인 트레이드 실행 → Phase 3+ API 연동
- ❌ 멀티체인 월렛 → Phase 3+
- ❌ 워크플로우 자동화 → Phase 3+

### Minara와의 관계

Phase 1: 독립 운영. 기능 겹침 없음.
Phase 2: 잠재적 통합. Minara API를 데이터소스로 활용. Cogochi는 개인화 레이어만.
Phase 3: 생태계. Cogochi per-user 모델을 Minara Agent Factory에서 실행.

---

## §3. 핵심 루프

### 제품 루프 (사용자 관점)

```
사용자가 Terminal에서 차트를 본다
    ↓
"이 패턴 좋아 보이는데?" → 블록 조합으로 패턴 구성
    ↓
[Challenge로 저장] 클릭
    ↓
Lab에서 [평가 실행] → 30코인 × 6년 데이터에서 매칭 자리 탐색
    ↓
결과: SCORE, 승률, 엣지, 매칭된 인스턴스 목록
    ↓
인스턴스 클릭 → Terminal에서 해당 시점 차트 확인
    ↓
확신이 생기면 → ML 모델 학습 → 실시간 시그널러 배포
    ↓
시그널 발생 시 알림 수신 → 피드백(✓/✗) → 모델 개선
    ↓
반복
```

### 엔진 루프 (시스템 관점)

```
원시 가격 데이터 (OHLCV, 1시간봉)
    ↓
Feature 계산 (28개: RSI, ATR, EMA, BB, MACD, 볼륨, 구조, 레짐 등)
    ↓
두 가지 경로:
    ├─ 경로 A: 손수 패턴 → 블록 조합 (trigger + confirmation + entry + disqualifier)
    │   → match.py가 boolean 마스크 반환 → excess_positive_rate 측정
    └─ 경로 B: ML 패턴 → LightGBM이 28개 feature에서 직접 예측
        → P(win) 확률 출력 → threshold 기반 entry 선별
    ↓
PnL 시뮬레이션 (bar-by-bar path walk, stop/target/timeout 판정)
    ↓
포트폴리오 시뮬레이터 (동시 포지션 제한, 리스크 관리, 일일 손실 한도)
    ↓
Expectancy 기반 SCORE 산출
    ↓
Walk-forward 검증 (72개월 분기별 안정성)
    ↓
통과한 패턴만 실시간 시그널러에 투입
```

### 4단계 검증 사다리

| 단계 | 이름 | 질문 | 통과 기준 |
|------|------|------|----------|
| Stage 1 | 백테스트 | 과거에 돈 벌었나? | Expectancy > 0, MDD < 20%, Profit Factor > 1.2, N ≥ 30, Tail ratio ≥ 1, Sortino ≥ 0.5 |
| Stage 2 | Walk-forward | 시간 흘러도 유지? | 72개월 중 75%+ quarter에서 양의 expectancy |
| Stage 3 | 페이퍼 트레이드 | 실시간도 비슷? | 30일, 백테스트 대비 expectancy 괴리 < 30% |
| Stage 4 | 소액 실거래 | 수수료+슬리피지 넣고도 +? | 60일 실거래, 순 PnL > 0 |

각 단계가 다음의 진입 게이트. 미통과 시 다음 진행 불가.

---

## §4. NSM + 지표

### NSM: Weekly Completed Analysis Sessions

정의:
- Terminal에서 패턴 구성 → Challenge 저장까지 완료
- Lab에서 평가 실행 → 결과 확인까지 완료
- 실시간 알림 수신 → 피드백(✓/✗) 제출까지 완료

M3 목표: 주간 500회 | Kill: 주간 < 140회

### Input Metrics

| # | 지표 | M3 목표 |
|---|------|---------|
| I1 | WAA (주간 활성 분석가) | 200명 |
| I2 | Sessions per WAA | 2.5회 |
| I3 | 피드백률 | 30%+ |
| I4 | D7 Retention | 30%+ |
| I5 | 유저 모델 expectancy 변화 | +5%p |

### 디버깅 트리

```
NSM 하락
  ├── I1 하락 → 유입 문제 → 온보딩/마케팅
  ├── I2 하락 → 가치 체감 부족 → 분석 품질
  ├── I3 하락 → 피드백 UX 문제 → 동선 간소화
  ├── I4 하락 → 장기 가치 부족 → I5 확인
  └── I5 정체 → ML 파이프라인 → AutoResearch 점검
```

---

## §5. 사용자 — Phase 1: 진(Jin)

프로필: 28세, 크립토 2~3년차, 바이낸스/바이비트 선물, TradingView 유료($15~30/월), ChatGPT/Claude 차트 분석 경험

JTBD: "내 트레이딩 판단의 정확도를 높이고 싶다"

Top Pain:
1. "AI 분석이 매번 달라. 학습이 안 됨" — Critical
2. "여러 도구 왔다갔다 귀찮음" — Significant
3. "매매일지 쓰기 귀찮은데 안 쓰면 복기 못함" — Significant

Aha Moment: "이 AI가 내가 만든 패턴으로 6년치 데이터를 돌려서 실제로 엣지가 있는지 증명해줬다"

Pro 전환 트리거: 무료 Challenge 3개 소진 → "더 만들고 싶다" → $19/월

배제: 미나(초보) Phase 2, 덱스(파워유저) Phase 3, "RSI가 뭐야?"(교육), "API만 줘"(3Commas)

---

## §6. 비즈니스 모델

### 수익 구조

| 수익원 | 유형 | 메커니즘 | Phase |
|--------|------|----------|-------|
| Pro 구독 | Subscription | $19/월 or $190/년 | 1 |
| GPU 크레딧 | Usage-based | 파인튜닝 1회 $2 | 1 |
| 어댑터 임대 | Take Rate | 임대료의 15% | 2 |

### 티어

| | FREE | PRO $19/월 |
|---|------|-----------|
| Challenge | 3개 | 무제한 |
| 스캔 종목 | 5개 | 전체 |
| 일 세션 | 3회 | 무제한 |
| AutoResearch | 월 1회 자동 | 주간 + 수동 |
| 알림 | ❌ | ✅ Telegram |

### Unit Economics [추정]

| 지표 | 수치 |
|------|------|
| ARPU (Free) | $0.40/월 |
| ARPU (Pro) | $23/월 |
| LTV (Pro) | $184 (8개월, churn 12.5%) |
| CAC | $15~30 |
| LTV/CAC | 6.1~12.3x |
| Gross Margin | 75~85% |
| BEP | 38명 Pro |

### 월간 고정비 [추정]

Vercel $20 + Railway $75 + Supabase $25 + GPU $350 + 데이터 API $180 + 기타 $50 = ~$700/월

### Sensitivity Matrix

| | MAU 200 | MAU 500 | MAU 1,000 |
|---|---------|---------|-----------|
| 전환 10% | $520 / -$180 | $1,300 / +$600 | $2,600 / +$1,900 |
| 전환 20% | $1,000 / +$300 | $2,500 / +$1,800 | $5,000 / +$4,300 |
| 전환 30% | $1,440 / +$740 | $3,600 / +$2,900 | $7,200 / +$6,500 |

### 취약한 가정 3개

1. Pro 전환율 20~30% [추정] — 현실적 base case 10%
2. Churn 12.5%/월 [추정] — Bear market 시 20%+
3. 파인튜닝 원가 $0.30~0.80/회 [추정] — 스케일링 미산정

### 시장 규모 [추정]

TAM ~$28B (크립토 AI 에이전트 시총) / SAM ~$2.8B / SOM ~$14M (0.5% Y1)

### GTM

1순위 채널: Twitter/X (진, 덱스) → Discord (진, 미나) → YouTube/TikTok (미나) → Telegram (덱스)

런치: Phase 0(-8주 CLG 시드) → Phase 1(-4주 베타 200명) → Phase 2(퍼블릭) → Phase 3(+4주 데이터 마케팅 "AI 정확도 X% 향상")

### 플라이휠

```
무료 분석 → 훈련 데이터 축적 → 정확도 향상 체감
→ "더 쓰고 싶다" → Pro 전환
→ 무제한 → 모델 성장 → 마켓 등록 (Phase 2) → 유저 유입 → 반복
```

---

## §7. 페이지 구조 — 3 Surface + Landing

### 네비게이션

데스크탑: `[Logo] [가격티커]  TERMINAL · LAB · DASHBOARD  [Settings] [Connect]`
모바일: `⌂ · 💬 TERMINAL · ⚗ LAB · @ DASHBOARD`

### Surface 역할

| Route | 역할 | 한 줄 |
|-------|------|------|
| `/` | Landing | 제품 테제 + CTA → /terminal |
| `/terminal` | 관찰 + 구성 | 차트 + 블록 검색. 검색어가 패턴 구성기. 한 클릭 Challenge 저장 |
| `/lab` | 평가 + 검사 + 반복 | Challenge 목록 + 상세 + 실행 → SSE 평가 결과 + SCORE 카드 + 인스턴스 테이블 |
| `/dashboard` | 내 작업 인박스 | 내 Challenge, 워치 목록, 어댑터(Phase 2+) |

### Phase 2+ Surface

| Route | 역할 |
|-------|------|
| `/market` | 검증된 어댑터 임대 (15% take rate) |
| `/training` | KTO/LoRA per-user 파인튜닝 UI |
| `/battle` | 히스토리컬 ERA 배틀 (Phase 3) |
| `/passport` | ERC-8004 온체인 트랙 레코드 (Phase 3) |

---

## §8. `/` — Home

### 섹션 구성

**1. Hero**
- Eyebrow: `COGOCHI`
- H1: 제품의 가장 강한 한 문장
- Sub: 패턴 저장 → 스캔 → 판정 → 어댑터 배포
- Start Bar: placeholder "What setup do you want to track?" → 제출시 /terminal
- Primary CTA: `Open Terminal`
- Secondary: `See How Lab Scores It` → /lab
- 배경: black-toned WebGL/ASCII, 큰 로고 워터마크

**2. Learning Loop**
4단계: `01 Capture` → `02 Scan` → `03 Judge` → `04 Deploy`

**3. Surfaces**
3-card: Terminal(보고 판단) · Lab(개선, 평가) · Dashboard(저장, 복귀)

**4. Final CTA**
`Open Terminal` / `Open Lab` / `Return to Dashboard`

### 비주얼 규칙

거의 검정 배경. 엠보싱 로고 워터마크. 프리미엄 프루프 패널 하나. 3D 없음, 궤도 카드 없음. 최소 카피. 타이포가 대부분의 일을 함. 카드는 메시지를 보조.

---

## §9. `/terminal` — 관찰 + 구성

### 핵심 개념

Terminal = 프롬프트 트리거형 GUI. Claude Artifacts + Spotlight/Raycast + Perplexity의 혼합. 검색 쿼리 자체가 패턴 구성기(wizard).

### 레이아웃

```
┌─ TERMINAL ──────────────────────────────────────────────┐
│ [헤더: 현재 심볼 / 모드]                                  │
├────────────────┬────────────────────┬───────────────────┤
│ Left: 퀵 리스트 │ Center: 피드/결과  │ Right: 차트/검사  │
│ 워치 컨텍스트   │ 리서치 블록        │ 포커스 인스펙션   │
├────────────────┴────────────────────┴───────────────────┤
│ 쿼리 입력 → 파싱 힌트 → [Save Challenge]                │
└─────────────────────────────────────────────────────────┘
```

데스크탑: 3-pane 그리드, 드래그 리사이즈. 태블릿: 좌 고정+우 스택. 모바일: 탭 전환.

### 검색 쿼리 → 블록 매핑

입력: `btc 4h recent_rally 10% + bollinger_expansion`

파서 변환:
- `recent_rally(pct=0.10, lookback_bars=72)` → trigger
- `bollinger_expansion(...)` → confirmation
- `btc` → 심볼, `4h` → 타임프레임

파싱 결과가 입력바 아래 힌트로 표시. [Save Challenge] 클릭 → answers.yaml + Challenge 디렉토리 자동 생성.

### 프롬프트 → 아티팩트 매핑

| 입력 | 아티팩트 |
|------|---------|
| "BTC" "BTC 4H" | TradingView 차트 |
| "RSI" "MACD" "볼밴" | 차트 오버레이 |
| "OI" "펀딩비" "리퀴 맵" | 파생상품 패널 |
| "롱 갈까?" "숏 어때?" | AI 의견 + 포지션 셋업 |
| 블록 이름 조합 | 패턴 구성 프리뷰 |

### 자동완성

카테고리: 토큰, 인디케이터, 온체인, 파생상품, 액션, 블록명

### 퀵 액션 버튼

```
[BTC] [ETH] [SOL]          ← 토큰
[1m] [5m] [1h] [4h] [1d]   ← 타임프레임
[RSI] [OI] [Vol] [Fund]    ← 인디케이터
[LONG] [SHORT] [저장]       ← 액션
```

### 월렛 인텔 모드

Terminal 안에서 지갑 주소 기반 조사. 별도 라우트 아님. 모드 전환 시 레이블+나가기 어포던스. 그래프: Flow Map, Token Bubble, Cluster View. 마켓 오버레이: 선택 토큰 차트 + 지갑 이벤트 마커.

---

## §10. `/lab` — 평가 + 검사 + 반복

### 레이아웃

```
┌─ LAB ──────────────────────────────────────────────────────┐
│ ┌─ My Challenges ─────┐  ┌─ Selected ─────────────────────┐│
│ │ ⭐ btc-macd-style     │  │ btc-macd-style                 ││
│ │    SCORE 0.0234  2h  │  │ long · binance_30 · 1h         ││
│ │ ⦿ sample-rally       │  │                                ││
│ │    SCORE -1.0    8h  │  │ Blocks: trigger + confirm...   ││
│ │                      │  │                                ││
│ │ [+ new /terminal]    │  │ [ ▶ RUN EVALUATE ]             ││
│ │                      │  │                                ││
│ │                      │  │ Metrics: SCORE, EXPECTANCY...  ││
│ │                      │  │                                ││
│ │                      │  │ Instances (47):                ││
│ │                      │  │ BTC 3/22 +4.2% target ✓       ││
│ │                      │  │ click → /terminal jump         ││
│ └──────────────────────┘  └────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

### 기능

**Left — Challenge 목록**: 파일시스템 스캔, slug + SCORE + 마지막 실행, 별표 상단 고정.

**Right — 상세**: 헤더(slug · direction · universe · timeframe), Blocks(4카드), match.py 읽기 전용.

**Run Evaluate**: 서버에서 `python prepare.py evaluate` 실행, SSE stdout 스트리밍, 최종 요약 → SCORE 카드.

**Instances 테이블**: instances.jsonl 파싱. 행: symbol · timestamp · entry_price · realized_pnl · exit_reason · bars_to_exit. 클릭 → /terminal 딥링크.

### 메트릭

| 메트릭 | 의미 |
|--------|------|
| SCORE | expectancy × coverage |
| EXPECTANCY | 트레이드당 평균 실현 PnL |
| WIN_RATE | 이긴 비율 |
| N_INSTANCES | 매칭 수 |
| RISK_REWARD | abs(avg_win / avg_loss) |
| PROFIT_FACTOR | 총 수익 / 총 손실 |
| MAX_DRAWDOWN | 최대 낙폭 |
| KELLY_FRACTION | 최적 사이즈 (음수 = "하지 마라") |
| COVERAGE | 매칭 코인 수 / 전체 |

### Challenge 유형 2개

**pattern_hunting** — 손수 블록 조합. trigger + confirmation + entry + disqualifier. 해석 가능, 직관적.

**classifier_training** — LightGBM. 28개 feature 학습. P(win) 확률 출력. 자동 최적화, ceiling 높음.

---

## §11. `/dashboard` — 내 작업 인박스

```
┌─ Dashboard ────────────────────────────────────────┐
│                                                     │
│ 1. MY CHALLENGES (Lab 요약, 최근 5개)               │
│    btc-macd-style   SCORE 0.0234   2h ago          │
│    click → /lab                                     │
│                                                     │
│ 2. WATCHING (Terminal에서 저장한 라이브 검색)        │
│    BTC 4H  recent_rally + bb_expansion   ✓ live    │
│    click → /terminal                               │
│                                                     │
│ 3. MY ADAPTERS (Phase 2+ placeholder)              │
│    빈 상태. Training은 Phase 2.                     │
│                                                     │
│ [ OPEN /terminal ]  [ OPEN /lab ]                  │
└─────────────────────────────────────────────────────┘
```

---

## §12. Scanner — 15레이어 시장 스캔 (Phase 2 독립, Day-1은 Lab에 흡수)

### 두 가지 역할

**시장 탐색**: 15레이어 종합 → Alpha Score 계산. "지금 뭐가 뜨겁나" 발견.
**패턴 감시**: Doctrine 패턴으로 24시간 스캔. 패턴 나오면 즉시 알림.

### 15개 레이어

| # | 레이어 | Alpha 기여 | 데이터 소스 |
|---|--------|-----------|------------|
| L1 | 와이코프 구조 | ±30 | OHLCV 일/주봉 |
| L2 | 수급 (FR·OI·L/S·Taker) | ±20 | Binance fapi |
| L3 | V-Surge (거래량 이상) | +15 | OHLCV |
| L4 | 호가창 불균형 | ±10 | Binance depth |
| L5 | 청산존 (Basis) | ±10 | Binance spot+fapi |
| L6 | BTC 온체인 | ±8 | Glassnode/CryptoQuant |
| L7 | 공포/탐욕 | ±10 | alternative.me |
| L8 | 김치프리미엄 | ±5 | 업비트/빗썸/Binance |
| L9 | 실제 강제청산 | ±10 | Binance fapi |
| L10 | MTF 컨플루언스 | ±20 | L2+L11 멀티TF |
| L11 | CVD | ±25 | Binance aggTrades |
| L12 | 섹터 자금 흐름 | ±5 | 종목별 Alpha 평균 |
| L13 | 돌파 감지 | ±15 | OHLCV 50봉 |
| L14 | 볼린저밴드 스퀴즈 | ±5 | OHLCV 20봉 |
| L15 | ATR 변동성 | 보조 | OHLCV 14봉 |

### Alpha Score

범위 -100 ~ +100. +60 이상 STRONG BULL, +20~59 BULL, -19~19 NEUTRAL, -20~-59 BEAR, -60 이하 STRONG BEAR.

### 레이트 리밋

Binance REST 1,200 weight/분, 안전 마진 800 weight/분 (67%). 수동 스캔 3분, 자동 15분 간격.

### 위변조 방지

모든 스캔 결과 서버 계산. Alpha Score + layers_hash → HMAC-SHA256 서명. 적중률 서버 집계 (클라이언트 값 무시).

### 패턴 매칭

15분마다: 대상 종목 SignalSnapshot 계산 → Doctrine 패턴 AND 매칭 → 조건 충족 시 알림 (같은 패턴+심볼 4시간 중복 방지, Alpha +10 변화 시 예외).

### 딥다이브 → 패턴 저장

딥다이브 패널에서 레이어 체크박스 선택 (최소 2개) → [📌 패턴으로 저장] → Scanner [내 패턴] 탭에 활성화.

---

## §13. Doctrine 구조 (패턴 저장 체계)

### 데이터 모델

```
Doctrine
├── agentId        사용자 ID
├── patterns[]     패턴 배열
├── version        버전
└── updatedAt

Pattern
├── id, name, direction (LONG/SHORT)
├── conditions[]   AND 조건 배열
├── weight         0~1, AutoResearch 최적화
├── hitRate, totalAlerts, active
└── createdAt

Condition
├── field          (예: "l11.cvdState", "l2.fundingRate")
├── operator       (eq / gt / lt / gte / lte / contains)
└── value
```

### Condition 필드 목록

l1.phase (6단계), l2.fr/oi_change/ls_ratio, l3.v_surge, l4.bid_ask_ratio, l5.basis_pct, l7.fear_greed, l9.liq_1h, l10.mtf_confluence, l11.cvd_state (5종), l13.breakout, l14.bb_squeeze, l15.atr_pct, alphaScore, regime (5종)

### 패턴 저장 3경로

1. Terminal 대화에서 자동 추출 (추천) — 블록 이름 자연어 파싱
2. Scanner 딥다이브에서 직접 저장 — 레이어 체크박스
3. 직접 빌더 — field + operator + value UI

---

## §14. SignalSnapshot 통합 구조

Scanner와 Terminal이 동일한 구조 사용:

```json
{
  "l1":  { "phase": "DISTRIBUTION", "score": -30 },
  "l2":  { "fr": 0.0012, "oi_change": 0.184, "ls_ratio": 1.8, "score": -15 },
  "l11": { "cvd_state": "BEARISH_DIVERGENCE", "score": -25 },
  "alphaScore": -72,
  "regime": "VOLATILE",
  "symbol": "BTCUSDT",
  "timeframe": "4h",
  "timestamp": 1712345678,
  "hmac": "abc123..."
}
```

Terminal에서는 자연어로 핵심만: "CVD가 베어리시 다이버전스야. 펀딩비도 0.12%로 과열."

---

## §15. 백엔드 아키텍처 — 6-Layer 시스템

### 아키텍처 개요

```
┌──────────────────────────────────────────────────────────┐
│  Layer 6 — Natural language (LoRA)                Phase E │
│    Llama-1B + LoRA adapter → 자연어 시그널 출력           │
└──────────────────────────────────────────────────────────┘
                            ↑
┌──────────────────────────────────────────────────────────┐
│  Layer 5 — Measurement                        D12 ✅     │
│    backtest/metrics.py → 6-조건 stage_1_gate()           │
│    expectancy, MDD, Sortino, tail ratio, profit factor   │
└──────────────────────────────────────────────────────────┘
                            ↑
┌──────────────────────────────────────────────────────────┐
│  Layer 4 — Execution / Risk                   D12 ✅     │
│    portfolio.py + simulator.py + scanner/pnl.py          │
│    max 3 concurrent, 1% risk, circuit breakers           │
│    taker 10 bps + sqrt-impact slippage                   │
└──────────────────────────────────────────────────────────┘
                            ↑
┌──────────────────────────────────────────────────────────┐
│  Layer 3 — Regime filter                      🟡 stub    │
│    backtest/regime.py (현재 "unknown" 반환)               │
│    D15에서 BTC 30d return ±10% → bull/bear/chop          │
└──────────────────────────────────────────────────────────┘
                            ↑
┌──────────────────────────────────────────────────────────┐
│  Layer 2 — Signal engines                     D1-D11 ✅  │
│    pattern_hunting (23 blocks) + classifier (LightGBM)   │
│    output: P(win) per bar                                │
└──────────────────────────────────────────────────────────┘
                            ↑
┌──────────────────────────────────────────────────────────┐
│  Layer 1 — Features                           ✅         │
│    scanner/feature_calc.py → 28 features, past-only      │
└──────────────────────────────────────────────────────────┘
                            ↑
┌──────────────────────────────────────────────────────────┐
│  Layer 0 — Data                               ✅         │
│    data_cache/ (109 MB, 30 심볼 × 6년 × 1h)              │
└──────────────────────────────────────────────────────────┘
```

### Feature 28개

**Trend**: ema20_slope, ema50_slope, ema_alignment, price_vs_ema50
**Momentum**: rsi14, rsi14_slope, macd_hist, roc_10
**Volatility**: atr_pct, atr_ratio_short_long, bb_width, bb_position
**Volume**: volume_24h, vol_ratio_3, obv_slope
**Structure**: htf_structure, dist_from_20d_high, dist_from_20d_low, swing_pivot_distance
**Microstructure**: funding_rate, oi_change_1h, oi_change_24h, long_short_ratio
**Order flow**: cvd_state, taker_buy_ratio_1h
**Meta**: regime, hour_of_day, day_of_week

### 블록 라이브러리 (29개)

모든 블록: `block(ctx, *, param=default) → pd.Series[bool]`

| 유형 | 수 | 예시 |
|------|---|------|
| Trigger | 5 | recent_rally, volume_spike, macd_cross_up, rsi_oversold, breakout_above_high |
| Confirmation | 8 | bollinger_expansion, ema_alignment_bullish, fib_retracement, rsi_momentum... |
| Entry | 7 | long_lower_wick, pullback_to_ema, breakout_retest, engulfing_candle... |
| Disqualifier | 3 | extreme_volatility, extended_from_ma, low_volume |

Composition: `pattern = trigger ∧ conf₁ ∧ ... ∧ confₙ ∧ entry ∧ ¬disq₁ ∧ ... ∧ ¬disqₘ`

### Challenge 디렉토리

```
challenges/<type>/<slug>/
├── answers.yaml       # 정본 — 블록 + 파라미터
├── match.py           # 자동 생성, autoresearch가 튜닝
├── prepare.py         # 자동 생성, 수정 금지
├── program.md         # 사용자가 편집하는 유일한 파일
└── output/instances.jsonl
```

### PnL 시뮬레이션 (ADR-002)

**Path walk**: 매칭 바의 open으로 진입. 이후 바마다 stop/target 체크. 같은 바 동시 터치 → stop 먼저(pessimistic). Horizon 끝 → close 청산.

**비용**: taker 10 bps round-trip (5bps × 2), slippage base 2 bps + sqrt-impact.

**Circuit breakers**: 일일 -3% 정지, 주간 -8% 정지, 연속 5회 손실 24h pause.

**포트폴리오**: 동시 3개, 심볼당 1개, 1% risk/trade, 쿨다운 3바.

---

## §16. WTD Stage 1 검증 결과 (2026-04-12 확정)

### 5 Challenge 판정

| Challenge | Expectancy | Win Rate | MDD | Profit Factor | N | 판정 |
|-----------|-----------|----------|-----|---------------|---|------|
| btc-macd-style | **+2.01%** | **75.8%** | **-5.1%** | **6.07** | **359** | **✅ PASS** |
| sample-rally | -2.01% | 29.1% | -99.5% | 0.37 | 1221 | ❌ FAIL |
| ake-style | -1.89% | 25.0% | -98.8% | 0.29 | 101 | ❌ FAIL |
| exhaustion-short | -1.52% | 32.8% | -72.3% | 0.50 | 64 | ❌ FAIL |
| lgb-long-v1 | -1.43% | 11.8% | -11.6% | 0.24 | 17 | ❌ FAIL |

### lgb-long-v1 붕괴 교훈

D11에서 "77.39% 승률, 6.2σ, Bonferroni 유일 통과"였던 LightGBM 분류기.

D12 포트폴리오 시뮬레이터:
- 115개 entry 중 17개만 체결 (98개 차단: daily_loss_halt 51, consecutive_loss_pause 35, cooldown 8)
- OPUSDT 2026-02-19에 51개 하루 집중 → 첫 몇 개 stop → circuit breaker → 나머지 진입 불가
- 승률 77.4% → 11.8% 붕괴

원인: "24h 후 종가 양수?"(경로 무시) vs "bar-by-bar path walk"(경로 반영). 측정이 다르면 결론이 뒤집힘.

### 3대 교훈

1. **측정이 모든 결론을 뒤집는다** — lgb-long-v1은 D9 최고 → D12 최악. btc-macd-style은 D9 노이즈 → D12 유일 생존.
2. **가설 예측은 대부분 틀린다** — 5/5 preregistered 예측 틀림 = 프로토콜 정상 작동.
3. **Circuit breaker가 핵심이다** — 모델이 아니라 portfolio 규칙이 폭락을 막았음.

### 검증된 사실

| 사실 | 수치 |
|------|------|
| 데이터 | 30코인 × 6년 × 1h = ~1.56M 바 |
| Feature ceiling | +2.08% excess, t≈28σ |
| Leak | 없음 확정 |
| Stage 1 생존 | 1/5 (btc-macd-style) |
| 최고 feature | atr_ratio_short_long (13%), dist_from_20d_low (11%) |
| 테스트 | 280 passing, mypy --strict clean |
| Bonferroni k | 18/20 |

---

## §17. ML 파이프라인

### 3-track 모델

**Track 1: Hand-crafted Blocks** (pattern_hunting)
사람이 블록 조합. match.py → boolean 마스크. 해석 가능.

**Track 2: LightGBM** (classifier_training)
28 feature → P(win). 자동 최적화. ceiling 높음. 해석 어려움.

**Track 3: LoRA** (Phase E, 미착수)
검증된 entry → 자연어 prompt/completion → Llama-1B LoRA. Track 1+2 위의 I/O 레이어.

### 실전 배포 구조

```
시장 데이터 → Feature 28개 → LightGBM P(win) → Regime 필터
→ Execution 규칙 (threshold, 쿨다운, 동시제한) → 리스크 관리
→ 시그널 출력: "LONG BTCUSDT | prob 0.61 | stop 23.81 | take 25.27"
```

### AutoResearch 4단계

Phase A: Doctrine Hill Climbing (피드백 10~100개) — weight 최적화, GPU 불필요
Phase B: KTO Fine-tuning (100+) — ✓/✗ → good/bad label, 쌍 매칭 불필요
Phase C: ORPO/DPO (500+) — chosen/rejected 쌍 구성
Phase D: LoRA on Validated Patterns — 검증 후에만

### 훈련 데이터 자동 생성

| 사용자 액션 | 훈련 데이터 | ML 용도 |
|------------|-----------|--------|
| 시그널 동의 (✓) | Chosen | KTO good |
| 시그널 반박 (✗) | Rejected | KTO bad |
| 사용자 수정 | 수정=chosen, 원본=rejected | DPO pair |
| Scanner ✓ 피드백 | 패턴 강화 | weight +0.05 |
| Scanner ✗ 피드백 | 패턴 약화 | weight -0.03 |
| 자동 판정 (1H 후) | Confidence 보정 | 캘리브레이션 |
| 포지션 결과 | R:R calibration | 출력 보정 |

### 4-Layer ML 아키텍처 (Phase 2+ 목표)

```
Layer 1: Base Model (공유, SFT, 월 1회)
Layer 2: Asset LoRA (BTC/ETH/SOL별, ORPO, 주 1회)
Layer 3: User LoRA (사용자별, KTO/DPO, 30개 피드백마다) ← 핵심
Layer 4: Validation (Stage 1 gate, walk-forward, deploy/reject)
```

### 인디케이터 커스터마이징 (성장 단계별)

| Stage | 인디케이터 |
|-------|-----------|
| EGG | 5개 고정 |
| CHICK | 15개 고정 |
| FLEDGLING | 40개 + 선택/해제 |
| DOUNI | 90+ + 커스텀 |
| ELDER | + Python/JS 코드 |

---

## §18. 측정 시스템

### SCORE 공식 변천

| 버전 | 공식 | 상태 |
|------|------|------|
| D7 이전 | mean_outcome × positive_rate × coverage | 폐기 |
| D9 | excess_positive_rate × coverage | Layer 2 게이트 |
| D12 | **expectancy × coverage** | **현재 정본** |

### Stage 1 Gate (6조건, 구현 완료)

1. expectancy > 0
2. max_drawdown > -20%
3. n_trades ≥ 30
4. tail_ratio ≥ 1
5. sortino ≥ 0.5
6. profit_factor ≥ 1.2

하나라도 미달 → graveyard.

### 핵심 공식

```
expectancy = mean(realized_pnl_pct)
win_rate = count(r > 0) / n
profit_factor = sum(wins) / |sum(losses)|
sortino = mean(returns) / sqrt(mean(r² for r < 0))
max_drawdown = min(equity[t] - peak) / peak
tail_ratio = |p95| / |p5|  (n≥20), else max_gain/max_loss
```

### 측정 상태

| 지표 | 상태 |
|------|------|
| Expectancy, win/loss, R:R, profit factor, sortino, tail ratio | ✅ D12 완료 |
| Calibration | ✅ stub |
| Walk-forward | ⬜ D16 |
| Regime 민감도 | 🟡 stub |
| Capacity 분석 | ⬜ D17 |

---

## §19. 알림 시스템

### Telegram 봇

연결: [연결하기] → @CogochiBOT → /start → 6자리 코드 (60초) → 입력 → 완료

알림 예시:
```
🔔 패턴 감지: CVD다이버전스+펀딩과열
심볼: BTCUSDT | TF: 4H | 방향: SHORT
점수: 82/100
[✓ 맞아]  [✗ 아니야]  [차트 보기]
```

### 자동 적중 판정

알림 시점 P0, 1시간 후 P1. LONG: +1% HIT, -1% MISS, 사이 VOID. 수동 피드백 우선.

---

## §20. DOUNI 캐릭터 (Phase 2+)

Day-1에는 캐릭터 레이어 없음. Phase 2+ 부활 시:

종: 파란 픽셀아트 부엉이. 이름: DOUNI (도우니).

7개 상태: Idle(Front), Thinking(Side), Excited(Front), Happy(Front), Sad(Back — 뒤돌아 앉기), Alert(Front), Sleep(Front).

보너스 구조: 낮아도 기본 100%. Energy 높으면 5분 스캔(보너스), Trust 높으면 High-Confidence 필터, Focus 높으면 숨겨진 패턴 알림, Mood 높으면 추가 인사이트.

4개 아키타입: CRUSHER(공격/숏), RIDER(추세), ORACLE(역추세), GUARDIAN(수비).

---

## §21. Free → Pro 업그레이드 UX

### 차단 모달 3종

**패턴 한도:**
```
🐦 패턴 3개를 다 썼어!
Pro면: ✅ 무제한 패턴 / ✅ 전체 종목 / ✅ 주간 AutoResearch
$19/월  ($190/년 — 16% 할인)
[Pro 시작하기]   [나중에]
```

**세션 한도:**
```
🐦 오늘 분석 3회를 다 썼어. Pro면 무제한.
[Pro 시작하기]   [내일 보자]
```

**AutoResearch 한도:**
```
🐦 이번 달 AutoResearch 완료. 피드백 30개 쌓여있는데...
Pro면 주 1회 자동 + 수동 실행!
[Pro 시작하기]   [다음 달에]
```

결제: Stripe Checkout. 월 $19 / 연 $190. 완료 → 즉시 Pro 활성화.

---

## §22. DB 스키마

```
users
├── id, wallet_address, plan (free/pro), created_at

agents (= user's AI model)
├── id, user_id, name, personality, accuracy, stage
├── lora_adapter_path, model_version

challenges
├── id, user_id, slug, type (pattern/classifier)
├── direction, universe, timeframe, answers_yaml
├── score, expectancy, win_rate, n_instances, last_run_at

instances
├── id, challenge_id, symbol, timestamp
├── entry_price, realized_pnl, exit_reason, bars_to_exit

feedbacks
├── id, user_id, challenge_id, signal_snapshot_json
├── response (agree/disagree/modify), outcome_label (good/bad)
├── judged_at, actual_direction, ai_correct, user_correct

alert_logs
├── id, user_id, pattern_id, symbol, timeframe
├── alpha_score, direction, created_at
├── feedback (hit/miss/void), feedback_source (manual/auto)

ml_train_jobs
├── id, user_id, method (kto/orpo/dpo), status
├── data_path, output_path, metrics_json

ml_model_registry
├── id, user_id, version, adapter_path
├── expectancy, win_rate, deployed_at
├── previous_version_id
```

---

## §23. 기술 스택

**프론트엔드:** SvelteKit 2 + Svelte 5 + TypeScript 5 + TradingView Lightweight Charts + Canvas2D (픽셀아트)

**백엔드:** Python 3.12 FastAPI on Railway + Supabase (PostgreSQL) + Redis (Phase 2)

**ML:** LightGBM (시그널), mlx-lm LoRA (Apple Silicon) / transformers+peft+trl (CUDA) / Together.ai (외부)

**스캐너:** FastAPI + APScheduler, 800 weight/분 안전 마진

**데이터:** Binance REST/WS (1h OHLCV), Parquet 캐시, Coinglass/Coinalyze (파생), Glassnode (온체인 Phase 2)

**알림:** FCM + Telegram Bot + HMAC-SHA256 위변조 방지

**인프라:** Vercel (프론트) + Railway (API) + S3/R2 (모델 저장)

### 기존 코드 재활용 맵

| 새 기능 | 기존 코드 | 방법 |
|---------|----------|------|
| Scanner 15레이어 | factorEngine.ts (48팩터) | L1~L15 리매핑 |
| Scanner 스케줄러 | marketSnapshotService.ts | cron 호출 |
| Terminal UI | ChartPanel.svelte, binance.ts WS | ArtifactPanel 임베드 |
| DOUNI 성격 | llmService.ts (Groq/DeepSeek/Gemini) | 프롬프트 교체 |
| AutoResearch | orpo/pairBuilder.ts, exportJsonl.ts | Together.ai 연동 |
| LoRA 서빙 | passportMlPipeline.ts DB 9테이블 | adapter 경로 |
| Critic | factorEngine.ts | 반대 근거 추출 |
| 시그널 추적 | tracked_signals 테이블 | outcome 컬럼 추가 |

---

## §24. 로드맵

### 백엔드 (WTD) — D12 이후

```
현재: D12 완료, btc-macd-style Stage 1 통과

D14: Stop/target 2D sweep → lgb-long-v1 구제? btc-macd-style 최적?
D15: Regime filter (BTC 30d → bull/bear/chop)
D16: Walk-forward Stage 2 (75%+ quarter 양의 expectancy)
D17: Feature 확장 + multi-symbol
D18: Realtime signaler (1시간마다 전 알트 스캔)
D19: Dashboard (내부 모니터링)
Phase E: LoRA (D16 통과 후에만)
```

### 프론트엔드 (Cogochi) — 12주

| 주 | 내용 |
|----|------|
| 1-2 | 스캐닝 엔진 (factorEngine → 15레이어) + DOUNI 성격 프롬프트 |
| 3-4 | Terminal UI (3-pane, 프롬프트→SSE, 분석스택, 패턴저장) + Critic |
| 5-6 | Scanner 엔진 (APScheduler + 매칭 + FCM/Telegram 알림 + 피드백) |
| 7-8 | AutoResearch (Hill Climbing + KTO) + per-user LoRA 서빙 (D16 통과 전제) |
| 9-10 | Lab UI + Stripe 결제 + Home 대시보드 |
| 11-12 | 안정화 + 클로즈드 베타 20명 |

### Phase별 검증 게이트

| 시점 | 질문 | Kill |
|------|------|------|
| W4 | 패턴 저장이 자연스러운가? | 5명 중 3명 미만 재방문 |
| W6 | Scanner 알림 유용? | 클릭률 < 30% |
| W8 | 파인튜닝 후 적중률 향상? | delta < 0 |
| W12 | NSM 140+, D7 30%+, Pro 10%+ | 미달 시 재설계 |

---

## §25. Kill Criteria

### 제품

| 시점 | 조건 | 액션 |
|------|------|------|
| 내부 테스트 | 3명 중 0명 재방문 | UX 재설계 |
| M3 | NSM < 140회/주 | 제품 방향 재검토 |
| M3 | D7 < 20% | 온보딩 재설계 |
| M3 | 알림 클릭률 < 30% | 알림 품질 재검토 |

### ML

| 시점 | 조건 | 액션 |
|------|------|------|
| D14 | lgb-long-v1 어떤 파라미터로도 expectancy > 0 불가 | classifier track 보류 |
| D16 | Walk-forward 75% 미달 | Regime 특화 전략 전환 |
| D16 | btc-macd-style bear quarter에서 expectancy < 0 | Regime filter 필수 |
| Phase E | LoRA < LightGBM baseline | LoRA 보류 |

### 수익

| 시점 | 조건 | 액션 |
|------|------|------|
| M3 | Pro 전환 < 5% | 가격/제한 조정 |
| M6 | MRR < $1,000 | Pivot or Kill |

---

## §26. 미결 사항

| # | 질문 | 기한 |
|---|------|------|
| 1 | ~~Intrabar 동시 터치~~ | ✅ pessimistic (ADR-002) |
| 2 | ~~수수료~~ | ✅ taker 10 bps |
| 3 | ~~Slippage~~ | ✅ base 2 bps + sqrt-impact |
| 4 | Partial profit / Trailing stop | D14 |
| 5 | Kelly 기반 자본 분할 | D14 |
| 6 | Walk-forward window (월/분기) | D16 |
| 7 | Ensemble (voting/stacking) | D16 |
| 8 | 캐릭터 레이어 부활 시기 | Phase 2 |
| 9 | 온보딩 플로우 | Phase 2+ |
| 10 | Repo split (모노레포 vs 분리) | M3 |
| 11 | Minara API 통합 시점 | M3 |
| 12 | btc-macd-style multi-symbol 확장 | D17 |
| 13 | Bear market regime 처리 방식 | D15 |
| 14 | lgb-long-v1 구제 vs 영구 graveyard | D14 |

---

## §27. 두 리포의 관계

**프론트엔드 (CHATBATTLE/)**
SvelteKit 앱. /terminal, /lab, /dashboard UI. API routes (bridge to Python). 이 엔진의 결과를 표시하는 껍데기.

**백엔드 (WTD/cogochi-autoresearch/)**
Python 패키지. 29 blocks, wizard, challenges, tools, data_cache, scanner/, backtest/ (11 modules). **이것이 실제 엔진.**

### WTD 파일 경로

| 할 일 | 파일 |
|-------|------|
| Stage 1 gate | `tools/backtest_portfolio.py` |
| Stress test | `tools/stress_test.py` |
| 실시간 예측 | `tools/predict_now.py` |
| Classifier 학습 | `tools/find_entries.py` |
| Feature ceiling | `tools/feature_ceiling.py` |
| 판정 결과 | `docs/design/stage-1-verdict.md` |
| 죽은 가설 | `docs/design/graveyard.md` |
| Bonferroni | `docs/design/experiments_log.md` |
| ADR (측정) | `docs/adr/002-pnl-measurement.md` |
| ADR (LightGBM) | `docs/adr/001-lightgbm-signal.md` |

---

*Cogochi v7 | 2026-04-12 | 이 파일이 유일한 정본. 새 제품 사고는 여기에 직접 편집.*
