# Cogochi — 최종 통합 설계문서 v5.0

**Holo Studio Co., Ltd. | 2026-04-05**
**통합: v4.0 핵심 루프 + Scanner v2 15레이어 + v3.1 확정사항 + Build Plan 코드맵**

---

## 목차

1. 제품 정의
2. NSM + Input Metrics
3. 핵심 루프
4. 페르소나 (Phase 1: 진만)
5. DOUNI 캐릭터 + 보너스 상태
6. 4개 핵심 페이지
7. Terminal — 대화 + 패턴 발견
8. Scanner — 15레이어 시장 스캔 + 패턴 감시
9. Lab — 파인튜닝 + 패턴 성능
10. Market — 임대 + 구독 (Phase 2)
11. 데이터 파이프라인
12. Doctrine 구조
13. AutoResearch
14. 수익 모델
15. 기술 스택
16. 기존 코드 재활용 맵
17. Phase별 빌드 순서 (12주)
18. Kill Criteria
19. 미결 사항

---

## 1. 제품 정의

### 한 줄

> **내가 발견한 패턴을 DOUNI가 기억하고, 15레이어로 전체 시장을 24시간 스캔해서 그 패턴 나오면 알려준다. 패턴이 쌓일수록 DOUNI가 똑똑해지고, 검증된 패턴은 다른 사람이 구독한다.**

### 왜 이게 없었나

```
TradingView      차트 보여줌. 패턴 기억 없음.
3Commas          규칙 기반 봇. 내가 직접 조건 코딩.
ChatGPT          설명해줌. 다음 대화에서 기억 없음.
AIXBT            시장 요약. 내 패턴 학습 없음.
TradingAgents    멀티에이전트 분석. 1회성. 누적 없음.
```

### 경쟁 포지션

```
                    AI 패턴 학습/개인화
                            ↑
                            |
    3Commas                 |        Cogochi ★
    AIXBT                   |        (대화→패턴→15레이어 스캔→임대)
                            |
    ←───────────────────────┼──────────────────────→
    규칙 설정 (어렵다)        |        대화 (쉽다)
                            |
    TradingView             |
    Bloomberg               |
                            ↓
                    AI 학습 없음
```

### 타협하지 않는 것

```
1. 대화가 곧 훈련 — 모든 대화가 자동으로 모델을 개선
2. Scanner는 15레이어 종합 — 단편 지표가 아닌 구조적 분석
3. 패턴 적중률은 서버 판정 — 위변조 불가
4. DOUNI 상태는 성능을 깎지 않는다 — 보너스만
5. Phase 1은 진(Jin) 한 명만 — 미나·덱스는 Phase 2~3
```

---

## 2. NSM + Input Metrics

### NSM

```
Weekly Completed Analysis Sessions (주간 완료 분석 세션 수)

정의:
  Terminal 분석 완료 + Scanner 알림 피드백 완료 합산

Terminal 완료:
  분석 스택 1개+ → 판단 제출 → 결과 확인

Scanner 완료:
  알림 수신 → 차트 확인 → 피드백(✓/✗) 제출

M3 목표: 500회 | Kill: < 140회
```

### Input Metrics

| # | 지표 | 차원 | M3 목표 |
|---|------|------|---------|
| I1 | WAA (주간 활성 분석가) | Breadth | 200명 |
| I2 | Sessions per WAA | Frequency | 2.5회 |
| I3 | Scanner 알림 피드백률 | Efficiency | 30%+ |
| I4 | D7 Retention | Quality | 30%+ |
| I5 | 패턴 평균 적중률 변화 | Quality | +5%p |

### NSM 하락 시 디버깅

```
NSM 하락
  ├── I1 하락? → 유입 문제 → 온보딩/마케팅
  ├── I2 하락? → 가치 체감 문제 → 분석 품질/DOUNI 반응
  ├── I3 하락? → 알림 품질 문제 → Scanner 정밀도
  ├── I4 하락? → 장기 가치 문제 → I5 확인
  └── I5 정체? → ML 문제 → AutoResearch 점검
```

---

## 3. 핵심 루프

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  Terminal        Scanner          Lab           Market     │
│                                                            │
│  차트 보면서  → 15레이어로    → 패턴 누적    → 검증된     │
│  DOUNI와 얘기   전체 시장 스캔   자동 최적화    패턴을     │
│  패턴 발견      패턴 나오면      LoRA 학습     구독 판매   │
│                 즉시 알림                                   │
│                     ↓                                      │
│               피드백(✓/✗)                                  │
│               → 파인튜닝 데이터                             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 훈련 데이터 자동 생성

```
Terminal:
  DOUNI 분석 + 유저 동의    → chosen 데이터
  DOUNI 분석 + 유저 반박    → rejected 데이터

Scanner:
  알림 → 유저 ✓ 피드백     → 패턴 강화 (weight +0.05)
  알림 → 유저 ✗ 피드백     → 패턴 약화 (weight -0.03)
  알림 → 자동 판정 (1H 후)  → confidence 보정

포지션 결과 (수익/손실)     → R:R calibration
```

---

## 4. 페르소나

### Phase 1: 진(Jin) 한 명만

```
프로필:
  28세, 크립토 2~3년차, 바이낸스/바이비트 선물
  TradingView 유료 구독 ($15~30/월)
  ChatGPT/Claude로 차트 스크린샷 분석 해봄

현재 워크플로:
  TradingView → ChatGPT → 텔레그램 → 거래소

JTBD:
  "내 패턴을 AI가 기억하고 전체 시장에서 자동으로 찾아줬으면"

Top Pain:
  1. "AI가 내 패턴을 기억 못 함" — Critical
  2. "여러 도구 왔다갔다" — Significant
  3. "매매일지 안 쓰면 복기 못함" — Significant

Aha Moment:
  Scanner에서 처음으로 내 패턴이 감지돼서 알림이 왔을 때
  "🐦 BTC 1H에서 네 패턴 나왔어!"

Anti-Persona:
  ❌ "RSI가 뭐야?" → Phase 2 교육 모드
  ❌ "API로 자동매매만" → Phase 3
```

### 미나·덱스 복귀 시점

```
미나: Phase 2 — 교육 모드 토글 추가
덱스: Phase 3 — API/Export/Market
```

---

## 5. DOUNI 캐릭터 + 보너스 상태

### 기본

```
종:    파란 부엉이
형태:  픽셀아트 스프라이트 (4방향: Front/3Q/Side/Back)
역할:  트레이딩 파트너. 패턴을 기억하고 함께 찾음.
```

### 방향 + 애니메이션

```
Front:      유저에게 말할 때, 결과 발표
3-Quarter:  차트 가리키며 "여기 봐!"
Side:       분석 중, Thinking
Back:       틀렸을 때 돌아앉음 (가장 귀여움)

Idle:       눈 깜빡임 + 미세 흔들림
Thinking:   Side + "..." 말풍선
Excited:    Front + 점프 + 느낌표
Happy:      점프 + 별 이펙트
Sad:        Back + 축 처짐 → "다음엔..."
Alert:      빠른 깜빡임 + 빨간 느낌표
Sleep:      눈 감김 + Zzz
```

### 상태 시스템 — 보너스 구조

원칙: **낮아도 기본 성능 100%. 높으면 보너스.**

| 상태 | 낮음 (0~30) | 보통 (31~70) | 높음 (71~100) |
|------|------------|-------------|--------------|
| Energy | 기본 15분 스캔 | 기본 15분 스캔 | **5분 스캔** (보너스) |
| Mood | 기본 대사 | 기본 대사 | **추가 인사이트 1줄** |
| Focus | 기본 감지 | 기본 감지 | **숨겨진 패턴 알림** |
| Trust | 기본 확신도 | 기본 확신도 | **High-Confidence 필터** |

감정 연출(Sleep, Sad)은 유지. 기능 깎임 없음.

| 상태 | 감소 | 증가 |
|------|------|------|
| Energy | 시간 (-3%/hr) | 분석 완료 (+10), 로그인 (+5) |
| Mood | 연패 3회 (-15) | 승리 (+10), 대화 (+5), 적중 (+8) |
| Focus | 배틀 5회/일 이후 (-5/회) | 패턴 발견 (+15), 스캔 (+10) |
| Trust | 서서히 (-1/일) | 승리 (+5), 패배에도 (+2) |

### 성장 = ML 해금

| Stage | 조건 | ML 해금 |
|-------|------|---------|
| EGG | 생성 직후 | 패턴 3개, 스캔 5종목, 기본 인디 5개 |
| CHICK | 패턴 3개+ | 패턴 10개, 스캔 10종목, 인디 15개 |
| FLEDGLING | 패턴 10개+ | 패턴 무제한, 전체 마켓 스캔, 인디 40개 |
| DOUNI | 패턴 30개+ | 인디 90+, 학습방법 선택, LoRA Rank 조정 |
| ELDER | 패턴 100개+ | 전체 해금, Market 임대 가능, Export |

---

## 6. 4개 핵심 페이지

```
/terminal    대화 + 패턴 발견    ← 입구
/scanner     15레이어 시장 스캔   ← 핵심 가치
/lab         파인튜닝 + 성능     ← 성장 확인
/market      임대 + 구독         ← 수익 (Phase 2)
```

부가:
```
/            Home (DOUNI 상태 + 놓친 알림)
/create      DOUNI 생성
/community   Oracle 리더보드
```

---

## 7. Terminal — 대화 + 패턴 발견

*(PRD Terminal v2.0 전체 내용 유지. 변경사항만 기록)*

### v3.1 반영 변경

- ST-05 ("RSI가 뭐야?") → Phase 2로 이동 (교육 모드)
- DOUNI 대사 톤: 교육 아닌 **전문가 파트너**
- Free/Pro 게이트: 일 3세션 (Free), 무제한 (Pro)

### 레이아웃

```
좌 40%: DOUNI Chat + 분석 스택 + [📌 패턴으로 저장]
우 60%: Artifact (차트/온체인/파생/포지션)
하단:   프롬프트 입력
```

### 핵심 흐름: 패턴 저장

```
유저: "BTC 4H 봐줘"
DOUNI: 차트 + CVD·OI·Funding 분석

DOUNI: "CVD 다이버전스 + 펀딩비 0.09%"
유저: "맞아. 이런 상황에서 숏이야"

→ [📌 패턴으로 저장] 활성화
→ 클릭 → 패턴명/방향/조건 확인 모달
→ 저장 → Doctrine 추가 → Scanner 즉시 활성화
```

---

## 8. Scanner — 15레이어 시장 스캔 + 패턴 감시

### 두 가지 역할

```
역할 1: 시장 탐색 (Market Explorer)
  15개 레이어 종합 → Alpha Score 계산
  "지금 시장에서 뭐가 뜨겁나" 발견
  딥다이브로 상세 분석 → 패턴 저장 연결

역할 2: 패턴 감시 (Pattern Watcher)
  Doctrine 패턴으로 24시간 스캔
  패턴 나오면 즉시 알림 (FCM + Telegram)
  피드백(✓/✗) → 파인튜닝 데이터
```

### UI: 2탭 구조

```
[시장 탐색] 탭:
  스캔 모드 선택 (Top N / 종목 지정 / 프리셋)
  Alpha Score 테이블 (종목 × 15레이어 요약)
  필터: ALL / BULLISH / BEARISH / WYCKOFF / MTF★ / BB스퀴즈 / 청산경보 / EXTREME FR
  종목 클릭 → 딥다이브 패널 (15레이어 상세)
  딥다이브에서 [📌 패턴으로 저장]

[내 패턴] 탭:
  활성 패턴 목록 (적중률 / ON·OFF)
  최근 알림 내역 (✓/✗ 피드백)
```

### 15개 레이어

| # | 레이어 | 데이터 소스 | Alpha 기여 |
|---|--------|------------|-----------|
| L1 | 와이코프 구조 | OHLCV (일봉·주봉) | ±30 |
| L2 | 수급 (FR·OI·L/S·Taker) | Binance fapi | ±20 |
| L3 | V-Surge (거래량 이상) | OHLCV | +15 |
| L4 | 호가창 불균형 | Binance depth | ±10 |
| L5 | 청산존 (Basis) | Binance spot+fapi | ±10 |
| L6 | BTC 온체인 | Glassnode/CryptoQuant | ±8 |
| L7 | 공포/탐욕 | alternative.me | ±10 |
| L8 | 김치프리미엄 | 업비트/빗썸/Binance | ±5 |
| L9 | 실제 강제청산 | Binance fapi | ±10 |
| L10 | MTF 컨플루언스 | L2+L11 멀티TF | ±20 |
| L11 | CVD | Binance aggTrades 직접 계산 | ±25 |
| L12 | 섹터 자금 흐름 | 종목별 Alpha 평균 | ±5 |
| L13 | 돌파 감지 | OHLCV 50봉 | ±15 |
| L14 | 볼린저밴드 스퀴즈 | OHLCV 20봉 | ±5 |
| L15 | ATR 변동성 | OHLCV 14봉 | 없음 (보조) |

### Alpha Score

```
-100 ~ +100 범위
+60 이상: STRONG BULL (초록 진함)
+20~+59:  BULL (초록)
-19~+19:  NEUTRAL (회색)
-20~-59:  BEAR (빨간)
-60 이하: STRONG BEAR (빨간 진함)
```

### 레이트 리밋 관리

```
Binance REST: 1,200 weight/분
안전 마진: 800 weight/분 (67%)
수동 스캔: 최소 3분 간격
자동 스캔: 15분 간격 (APScheduler)
aggTrades(CVD): 순차 처리 (weight 20/종목)
```

### 위변조 방지

```
모든 스캔 결과 서버에서 계산
Alpha Score + layers_hash → HMAC 서명
적중률: alert_logs 기준 서버 집계 (클라이언트 값 무시)
Market 등록 시 서명 검증
```

### 패턴 매칭

```
15분마다:
  대상 종목 × 타임프레임 SignalSnapshot 계산
  → 각 Doctrine 패턴 조건과 AND 매칭
  → 충족 시 알림 (4시간 중복 방지)
```

### 적중률 계산

```
적중 기준:
  알림 후 1H 이내 방향대로 1%+ 이동 = 적중
  반대 1%+ = 미적중
  1% 미만 = 무효 (미반영)

표시:
  5회 미만: "수집 중 (N/5)"
  5~19회:   "N% (참고용)"
  20회+:    "N%"
```

---

## 9. Lab — 파인튜닝 + 패턴 성능

*(PRD Lab v1.0 전체 유지)*

### 구성

```
DOUNI 현황 바:   Stage + 패턴 수 + 모델 버전 + 전체 적중률
적중률 추이:     주별 라인 차트 + 모델 버전업 마커
AutoResearch:   마지막 실행 결과 + 다음 실행 예정 + 개선 내역
패턴별 성능:     테이블 (적중률/알림수/추이)
모델 버전:      v1→v2→v3 타임라인
```

### 파인튜닝 조건

```
피드백 20개+ 수집
마지막 파인튜닝 24시간+
현재 실행 중 아님
```

---

## 10. Market — 임대 + 구독 (Phase 2)

### 진입 조건

```
ELDER Stage 이상
패턴 적중률 60%+ (최소 20회)
30일 이상 운영
```

### 플랜

```
SIGNAL   $30/월   패턴 알림만
AUTO     $80/월   자동 실행 (Phase 2)
PREMIUM  $150/월  패턴 설정 원본 열람
```

### 수익 구조

```
트레이너 85% / 플랫폼 15%
$COGOCHI 결제 시: 트레이너 85% / 플랫폼 10% / 소각 5%
```

---

## 11. 데이터 파이프라인

### 직접 계산 (외부 의존 없음)

```
Binance aggTrades  → CVD
Binance klines     → OHLCV (15m/1H/4H/1D)
Binance fapi       → OI, FR, L/S Ratio
Binance depth      → 호가창 불균형
```

### 외부 API (캐시)

```
Glassnode/CryptoQuant  → BTC 온체인 (L6)     TTL 10분
alternative.me         → 공포/탐욕 (L7)       TTL 1H
업비트/빗썸            → 김치프리미엄 (L8)     TTL 5분
Coinglass             → 청산 히트맵 (L5 보조)  TTL 5분
CoinGecko MCP         → 시총/도미넌스         TTL 5분
```

### SignalSnapshot (매 15분)

```python
{
    "primaryZone":    "DISTRIBUTION",
    "modifiers":      ["CVD_DIVERGENCE", "FUNDING_OVERHEAT"],
    "cvdState":       "BEARISH_DIVERGENCE",
    "oiChange1h":     +0.184,
    "fundingLabel":   "OVERHEAT_LONG",
    "htfStructure":   "BEARISH",
    "atrPct":         3.2,
    "compositeScore": 0.87,
    "regime":         "VOLATILE",
    "alphaScore":     -72,
    "layers":         { l1...l15 },
}
```

---

## 12. Doctrine 구조

```typescript
interface Doctrine {
  agentId:   string
  patterns:  Pattern[]
  version:   number
  updatedAt: number
}

interface Pattern {
  id:          string
  name:        string
  direction:   'LONG' | 'SHORT'
  conditions:  Condition[]      // AND 조건. L1~L15 필드 참조 가능
  weight:      number           // 0~1, AutoResearch 최적화
  hitRate:     number
  totalAlerts: number
  active:      boolean
  createdAt:   number
}

interface Condition {
  field:    string    // "l11.cvdState", "l2.fundingRate", "l1.phase"
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains'
  value:    string | number
}
```

패턴 저장 방식:
```
방법 1: Terminal 대화에서 자동 추출 (추천)
  "이런 패턴 나오면 숏" → LLM이 Condition 추출

방법 2: Scanner 딥다이브에서 직접 저장
  딥다이브 보면서 [📌 패턴으로 저장]

방법 3: 직접 빌더 (DOUNI+ Stage)
  field + operator + value UI
```

---

## 13. AutoResearch

### 역할

패턴 가중치를 자동 최적화. 매일 자정 실행.

### 2단계 분리

```
Phase A: DOCTRINE Hill Climbing
  FIXED_SCENARIOS 50~200개 (점진 확장)
  패턴 weight 변형 → 100회 실험
  composite_metric 최대화

Phase B: LoRA 파인튜닝
  최적 Doctrine으로 학습 데이터 생성
  규칙 vs LLM 비교
  LLM 승 → 버전업 / 패 → 기각
```

### FIXED_SCENARIOS

```
200개 목표 = 5 regime × 40개
TRAIN 160 / VAL 40

점진 확장:
  Phase 1a: 50개 (개발+테스트)
  Phase 1b: 100개 (반자동 수집)
  Phase 1c: 200개 (출시 전 완성)
```

### 학습 방법 해금

| 방법 | 해금 Stage |
|------|-----------|
| ORPO | EGG~ (기본) |
| DPO | DOUNI |
| KTO | DOUNI |
| RainbowPO | ELDER |

---

## 14. 수익 모델

### 기본 원칙: 구독 + Take Rate 병행

Phase 1에서 수익을 만들고, Phase 2에서 Take Rate가 추가됨.

### Phase 1 티어

```
FREE
  패턴 3개 / 스캔 5종목 / 일 3세션
  AutoResearch 월 1회 (자동)
  Stage: EGG→CHICK

PRO $19/월 ($190/년)
  무제한 패턴·종목·세션
  주간 AutoResearch + 수동 파인튜닝
  알림 설정 전체 (조용한 시간, 최소 강도)
  Stage 제한 없음
  우선 지원

GPU 크레딧 (추가)
  수동 파인튜닝 $2/회
  LoRA Rank 업그레이드 $5
  팩: 10회 $15 / 50회 $60
```

### Free → Pro 전환 포인트

```
1. 패턴 3개 소진 → "더 많은 패턴? Pro면 무제한!"
2. 5종목 스캔 한계 → "SOL에서도 패턴 나왔을 수 있는데..."
3. AutoResearch 월 1회 → "피드백 30개 쌓였는데, 파인튜닝은 다음 달..."
```

### Phase 2 추가

```
+ 임대 Take Rate 15% (트레이너 85%)
+ Auto 플랜 실행 수수료 0.1%
+ $COGOCHI 결제 시 Take Rate 10% (5% 할인)
```

### Unit Economics [추정]

| 지표 | 수치 | 가정 |
|------|------|------|
| ARPU (Pro) | $23/월 | $19 + $4 크레딧 |
| Blended ARPU | $7.60/월 | Free 70% : Pro 30% |
| LTV (Pro) | $184 | 8개월 (churn 12.5%) |
| CAC | $15~30 | Twitter/Discord |
| LTV/CAC | 6.1~12.3x | ✅ 건강 |
| BEP | **38명 Pro** | 고정비 $700/월 |

### 월간 고정비 [추정]

```
Vercel Pro:          $20
Railway (FastAPI):   $50~100
Qdrant Cloud:        $25
Supabase Pro:        $25
Redis:               $10
GPU 서버:            $200~500
CoinGecko Pro:       $130
Coinglass:           $50
합계:                $510~860 (중간 $700)
```

### Sensitivity

| | MAU 200 | MAU 500 | MAU 1,000 |
|---|---------|---------|-----------|
| 전환율 10% | -$180/월 | +$600/월 | +$1,900/월 |
| 전환율 20% | +$300/월 | +$1,800/월 | +$4,300/월 |

---

## 15. 기술 스택

```
프론트엔드    SvelteKit 2 + Svelte 5 (Runes) + TypeScript 5
차트          TradingView Lightweight Charts
캐릭터        Canvas2D (픽셀아트)

백엔드        Python 3.12 FastAPI (← 기존 코드 재활용)
AI 추론       Ollama + Qwen2.5-1.5B (로컬)
              LLM 서비스: Groq/DeepSeek/Gemini (기존)
파인튜닝      mlx-lm LoRA (Apple Silicon)
              transformers + peft + trl (CUDA)
              Together.ai (MVP 외부 학습 API)

스캐너        FastAPI 백그라운드 + APScheduler
              레이트 리밋: 800 weight/분 안전 마진

데이터        PostgreSQL (기존 Passport ML 9테이블 재활용)
              Redis (실시간 캐시 + 알림 큐)
              Qdrant (벡터 DB, DOUNI 메모리)

알림          FCM (앱 푸시) + Telegram Bot API
스캔 서명     HMAC-SHA256 (위변조 방지)

Skills MCP:
  Phase 1a: Binance 직접만
  Phase 1b: + CoinGecko MCP (무료 Demo)
  Phase 1c: + Coinglass API ($50~200/월)
  Phase 2:  + Nansen MCP ($500+/월)

인프라        Vercel (프론트) + Railway (API) + Qdrant Cloud
```

---

## 16. 기존 코드 재활용 맵

| 새 기능 | 재활용하는 기존 코드 | 어떻게 |
|---------|---------------------|--------|
| Scanner 15레이어 | `opportunityScanner.ts`, `factorEngine.ts` (48팩터) | 기존 팩터를 L1~L15로 리매핑 |
| Scanner 스케줄러 | `marketSnapshotService.ts` (19소스 병렬) | cron에서 기존 함수 호출 |
| Alpha Score | `Light Score` (기존) | 가중치 재조정 + 레이어 확장 |
| Terminal UI | `ChartPanel.svelte`, `binance.ts` WS | ArtifactPanel에 임베드 |
| DOUNI 성격 | `llmService.ts` (Groq/DeepSeek/Gemini) | 시스템 프롬프트 교체 |
| AutoResearch | `orpo/pairBuilder.ts`, `exportJsonl.ts` | 기존 JSONL → Together.ai |
| LoRA 서빙 | `passportMlPipeline.ts` DB 스키마 9테이블 | ml_model_registry에 LoRA 경로 |
| Critic | `factorEngine.ts` | 반대 근거 추출 |
| 시그널 추적 | `tracked_signals` 테이블 | outcome 컬럼 추가 |
| Home 대시보드 | `agentJourneyStore.ts` | journey state + 알림 요약 |
| Arena | Arena 배틀 엔진 (실시간 TP/SL) | Phase 2에서 패턴 검증 보조로 |

### 기존 코드 중 유지하는 것

```
✅ 48 팩터 엔진 + 8 기본 인디케이터
✅ Scanner → Analyst 파이프라인
✅ Binance WebSocket 실시간
✅ 15개 외부 API 실연동
✅ Market Snapshot 19소스 병렬
✅ ORPO pair 빌더 + JSONL export
✅ Passport ML DB 스키마 9개 테이블
✅ Arena 배틀 엔진 (Phase 2 용)
✅ LLM 서비스 (Groq/DeepSeek/Gemini)
✅ Signal 저장 테이블
✅ GMX V2 + Polymarket 연동 (Phase 2)
```

---

## 17. Phase별 빌드 순서 (12주)

### Week 1~2: 스캐닝 엔진 + DOUNI 성격

```
기존 코드 재활용:
  □ factorEngine 48팩터 → 15레이어 리매핑
  □ 임계값 수정 (6개 PARTIAL → 정확한 값)
  □ 미구현 레이어 추가 (L1 와이코프, L3 V-Surge, L13 돌파, L14 BB스퀴즈)

새로 만들기:
  □ Alpha Score 계산 함수
  □ 위변조 서명 (HMAC)
  □ metric_history 테이블 (7일 평균용)
  □ DOUNI 성격 프롬프트 (douniPersonality.ts)
  □ DOUNI 스프라이트 기본 (Idle + Thinking + Happy)

Build Plan: B-01 Part A~C + B-04
```

### Week 3~4: Terminal UI + Critic

```
기존 코드 재활용:
  □ ChartPanel.svelte → ArtifactPanel 임베드
  □ llmService.ts → DOUNI 프롬프트 교체

새로 만들기:
  □ Terminal 좌/우/하 레이아웃
  □ 프롬프트 → 인텐트 분류 → SSE 스트리밍
  □ 분석 스택 (✓/?/✗ 반응)
  □ [📌 패턴으로 저장] 버튼 + Doctrine 저장
  □ Critic 추론 단계 (반대 근거 추출)
  □ 시그널 결과 자동 추적 cron (B-02)

Build Plan: B-03 + B-08 + B-02
```

### Week 5~6: Scanner 엔진 + 피드백

```
기존 코드 재활용:
  □ opportunityScanner → APScheduler에서 호출
  □ marketSnapshotService → 15레이어 배치 계산

새로 만들기:
  □ Scanner [시장 탐색] 탭 (Alpha Score 테이블 + 딥다이브)
  □ Scanner [내 패턴] 탭 (패턴 목록 + 알림 내역)
  □ 패턴 매칭 로직 (L1~L15 필드 AND 매칭)
  □ 중복 알림 방지 (4시간 / Alpha +10 예외)
  □ FCM + Telegram 알림
  □ ✓/✗ 피드백 → weight 조정
  □ 자동 적중 판정 (1H 후)
  □ 레이트 리밋 관리자 (weight 추적)

Build Plan: 신규 B-18 + B-19 + B-20
```

### Week 7~8: AutoResearch + LoRA

```
기존 코드 재활용:
  □ orpo/pairBuilder.ts + exportJsonl.ts
  □ passportMlPipeline DB 스키마

새로 만들기:
  □ prepare.py + finetune.py 연동
  □ DOCTRINE Hill Climbing (Phase A)
  □ Together.ai 학습 API 연동 (Phase B)
  □ per-user LoRA 서빙 (Together.ai inference)
  □ 모델 배포 파이프라인 (shadow→canary→active)

Build Plan: B-05 + B-06 + B-07
```

### Week 9~10: Lab + 결제 + Home

```
새로 만들기:
  □ Lab UI (적중률 추이 + AutoResearch 패널 + 패턴 성능)
  □ 파인튜닝 실행 UI (Progress Bar)
  □ Stripe 결제 연동 (Free/Pro/$19)
  □ Plan Gate (기능별 접근 제어)
  □ Home 대시보드 (DOUNI 상태 + 놓친 알림)
  □ /create 페이지 (DOUNI 탄생)

Build Plan: B-09 + B-11
```

### Week 11~12: 안정화 + 클로즈드 베타

```
  □ 시나리오 확장 (50→200개)
  □ DOUNI 추가 애니메이션 (Excited + Sad + Alert + Sleep + Back)
  □ 성장 시스템 (Stage 진화)
  □ 모바일 반응형 (탭 전환)
  □ E2E 테스트 전체
  □ 클로즈드 베타 20명 (진 페르소나)
  □ 핵심 가설 검증
```

### Phase별 검증

```
Week 4 끝:  "DOUNI와 대화하며 패턴 저장이 자연스러운가?"
            Kill: 내부 5명 중 3명 미만 "또 쓰고 싶다"

Week 6 끝:  "Scanner 알림이 유용한가?"
            Kill: 알림 클릭률 < 30%

Week 8 끝:  "파인튜닝 후 적중률이 올라가는가?"
            Kill: accuracy delta < 0

Week 12 끝: NSM 140+, D7 30%+, Pro 전환 10%+
            Kill: NSM < 140 at M3
```

---

## 18. Kill Criteria

### 제품

| 시점 | 조건 | 액션 |
|------|------|------|
| W4 | 내부 5명 중 3명 미만 재방문 | Terminal UX 재설계 |
| W6 | Scanner 알림 클릭률 < 30% | 알림 품질/빈도 재검토 |
| M3 | D7 Retention < 20% | DOUNI 유대감 실패 |
| M3 | 패턴 적중률 변화 없음 | AutoResearch 파이프라인 재설계 |
| M3 | NSM < 140회 | 제품 재설계 |

### 수익

| 시점 | 조건 | 액션 |
|------|------|------|
| M3 | Pro 전환율 < 5% | Free 제한 강화 or 가격 인하 |
| M3 | Blended ARPU < $3 | GPU 크레딧 폐기, 순수 구독 |
| M6 | MRR < $1,000 | Pivot or Kill |
| M6 | Pro churn > 20%/월 | 가치 재설계 |

---

## 19. 미결 사항

| # | 질문 | 옵션 | 기한 |
|---|------|------|------|
| Q1 | L6 온체인 데이터 소스 | A) Glassnode B) CryptoQuant C) 자체 | Week 1 |
| Q2 | 자동 스캔 기본 종목 수 | A) 10개 B) 20개 | Week 1 |
| Q3 | 수동 스캔 쿨다운 | A) 3분 B) 5분 | Week 1 |
| Q4 | 자동 적중 판정 기준 | A) 1% B) ATR의 50% | Week 5 |
| Q5 | DOUNI 분석 대사 생성 | A) LLM 매번 B) 템플릿+LLM | Week 1 |
| Q6 | 패턴 조건 추출 방법 | A) LLM 추출 B) UI 빌더 | Week 1 |
| Q7 | Telegram 봇 시점 | A) Week 5 포함 B) Week 7+ | Week 4 |
| Q8 | 위변조 서명 키 관리 | A) 환경변수 B) KMS | Week 5 |

---

## 부록 — 통합 내역

| 출처 | 반영 내용 |
|------|----------|
| v4.0 설계 | 핵심 루프, 4페이지 구조, Doctrine, DOUNI 캐릭터 |
| Scanner v2 PRD | 15레이어, Alpha Score, 딥다이브, 레이트 리밋, 위변조방지 |
| v3.1 패치 | NSM, Pro $19, 진 only, 보너스 구조, BEP 38명 |
| Build Plan | 기존 코드 재활용 맵, B-01~B-17 항목, 기술 결정 |
| Terminal v2 PRD | 인텐트 7종, 패턴 저장 흐름, SSE, Store 구조 |
| Lab v1 PRD | 적중률 추이, AutoResearch 패널, 파인튜닝 UI |

### 이전 버전 대비 변경

| 항목 | v3 | v4 | v5 (최종) |
|------|----|----|----------|
| 핵심 루프 | 대화→배틀→파인튜닝 | 대화→패턴→스캔→파인튜닝 | **동일 + 15레이어** |
| Scanner | 없음 | 패턴 감시만 | **시장 탐색 + 패턴 감시** |
| Alpha Score | 없음 | 없음 | **-100~+100 15레이어 종합** |
| 수익 | take rate만 | take rate만 | **Pro $19 + take rate** |
| NSM | 빠짐 | 빠짐 | **주간 완료 분석 세션** |
| 페르소나 | 3명 | 3명 | **Phase 1 진만** |
| DOUNI 상태 | 벌칙 | 벌칙 | **보너스** |
| Arena | 핵심 | Phase 2 | **Phase 2 유지** |
| 타임라인 | 14주 (비현실) | 16주 | **12주 (코드 재활용)** |
| 위변조 | 없음 | 없음 | **HMAC 서명** |

---

*최종 통합 설계문서 v5.0 | 2026-04-05 | Holo Studio Co., Ltd.*
*이 문서가 정본(canonical). 이전 v1~v4는 reference-only.*
