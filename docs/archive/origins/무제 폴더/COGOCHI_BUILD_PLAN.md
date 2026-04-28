# COGOCHI 구현 GAP 분석 + 빌드 설계
**2026-04-05 — 코드 검증 기반**

---

## 0. 현재 상태 한 눈에

```
있는 것 (실동작)                     없는 것 (만들어야 함)
────────────────                     ────────────────────
✅ 48 팩터 엔진 + 8 기본 인디        ❌ 백그라운드 자동 스캐닝 (cron)
✅ Scanner → Analyst 파이프라인       ❌ Critic 3단계
✅ Binance WebSocket 실시간           ❌ 시그널 결과 자동 추적 (cron)
✅ 15개 외부 API 실연동               ❌ per-user LoRA
✅ Market Snapshot 19소스 병렬 수집   ❌ 실제 모델 학습/추론 서빙
✅ ORPO pair 빌더 + JSONL export     ❌ 학습 작업 실행 워커
✅ Passport ML DB 스키마 9개 테이블   ❌ 모델 배포 파이프라인
✅ Arena 배틀 엔진 (실시간 TP/SL)    ❌ DOUNI 성격/대화 레이어
✅ LLM 서비스 (Groq/DeepSeek/Gemini) ❌ 대화형 Terminal UI
✅ Signal 저장 테이블                 ❌ 모바일 레이아웃
✅ GMX V2 + Polymarket 연동           ❌ 수익화 (결제/요금제)
```

---

## 1. 빌드 항목 전체 목록

### Priority 0 — 제품이 돌아가려면 반드시 필요

| # | 항목 | 현재 상태 | 만들 것 | 예상 공수 |
|---|------|----------|---------|----------|
| **B-01** | 백그라운드 스캐닝 + 28패턴 | 48팩터 있으나 임계값 불일치 + cron 없음 | 이상감지 18개 + 복합 10개 + 스케줄러 + NL매핑 + SourceID | **10일** |
| **B-02** | 시그널 결과 자동 추적 | tracked_signals 테이블만 | 4H/24H 자동 판정 cron | 2일 |
| **B-03** | 대화형 Terminal UI | 3000줄 Bloomberg 대시보드 | DOUNI Chat + Artifact 패널 | 7일 |
| **B-04** | DOUNI 성격 레이어 | 범용 시스템 프롬프트만 | 캐릭터 프롬프트 + 후처리 | 3일 |

### Priority 1 — 핵심 가치 (개인화 AI)

| # | 항목 | 현재 상태 | 만들 것 | 예상 공수 |
|---|------|----------|---------|----------|
| **B-05** | 학습 작업 실행 워커 | 큐에 넣기만 함 | 외부 학습 API 연동 + 워커 | 5일 |
| **B-06** | per-user LoRA 서빙 | 코드 0% | LoRA adapter 저장 + 추론 라우팅 | 7일 |
| **B-07** | 모델 배포 파이프라인 | 스키마만 | shadow → canary → active 자동화 | 3일 |
| **B-08** | Critic 추론 단계 | Scanner→Analyst만 | 3단계 Critic 리뷰 추가 | 2일 |

### Priority 2 — 사업화

| # | 항목 | 현재 상태 | 만들 것 | 예상 공수 |
|---|------|----------|---------|----------|
| **B-09** | 결제 + 요금제 | 없음 | Stripe 연동 + 티어별 게이팅 | 5일 |
| **B-10** | 모바일 레이아웃 | 없음 | DOUNI 오버레이 + 차트 풀스크린 | 3일 |
| **B-11** | Home 대시보드 | 기존 피처 카드 | DOUNI 상태 + 놓친 시그널 + CTA | 3일 |
| **B-12** | 푸시 알림 | 없음 | 시그널 감지 시 push/email/webhook | 3일 |

### Priority 3 — 스캐너 확장 (Easychartgo 15레이어 참조)

| # | 항목 | 현재 상태 | 만들 것 | 예상 공수 |
|---|------|----------|---------|----------|
| **B-13** | 15레이어 스캐너 확장 | 48팩터 (8카테고리) | +7레이어 추가 (아래 상세) | **12일** |
| **B-14** | Alpha Score + 태그 시스템 | Light Score만 | -100~+100 Alpha + STRONG BULL~BEAR + 컬러태그 | 3일 |
| **B-15** | Oracle 리더보드 | UI만 | 실제 모델 성과 기반 랭킹 | 3일 |
| **B-16** | 모델 Export/API | 없음 | Team 티어용 모델 다운로드 + REST API | 5일 |
| **B-17** | Verifiable Proof (HOOT) | 없음 | VTR 온체인 기록 | 7일 |
| **B-19** | 계좌 수 기반 포지셔닝 | L/S 볼륨만 (Coinalyze) | Binance 4개 무료 API + 스마트머니 5패턴 | **2일** |
| **B-20** | 전략 빌더 (유저 정의 패턴) | 없음 | NL입력 + 블록빌더 + 프리셋5개 + 시퀀스엔진 | **7일** |

---

## 2. 각 항목 상세 설계

---

### B-01: 백그라운드 스캐닝 + NL SCANNER 패턴 구현

**현재:**
- `runOpportunityScan()`과 `collectMarketSnapshot()`이 있지만 유저 요청 시에만 실행됨
- 자동 스케줄러 없음
- 팩터 엔진 48개 있지만 Pattern Catalog의 28개 패턴과 임계값이 **불일치**

**패턴 카탈로그 vs 현재 코드 GAP:**

```
12개 핵심 이상탐지 코드 중:

완전 구현: 0개
부분 구현: 6개 (임계값 불일치)
  SA-01 가격 방향     → 임계값 다름 (±2% 필요, 5%/10%로 되어있음)
  DA-01 FR 극단       → 임계값 다름 (±0.05% 필요, ±0.06%/0.03%으로)
  DA-05 L/S 극단      → 임계값 다름 (1.8/0.6 필요, 1.15/0.85로)
  FA-01 거래소 입금   → 3x 7d avg 비교 로직 없음 (flat 계수만)
  FA-02 거래소 출금   → 위와 동일
  SC-A1 거래량 폭발   → 5x 7d avg 아닌 vol/mcap 비율

미구현: 6개
  SA-02 가격 횡보 (ATR×0.5 미만)      → 코드 없음
  DA-02 청산 밀집 (가격대별 OI 5%+)   → 코드 없음
  DA-03 OI 급감 (-15%+)              → 명시적 "awaiting B-05" 스텁
  DA-09 OI 누적 (3봉+ 연속 증가)      → 코드 없음
  SC-A2 거래량 실종 (0.3x 미만)       → 코드 없음
  SEA-01 소셜 폭발 (10x 7d avg)      → 코드 없음

복합 이상 (CA-01~10): 전부 미구현
  → 단일 이상을 조합하는 composition engine 자체가 없음

Source ID 체계: 미구현
  → [SRC:DRV:CG:ETH:FR] 같은 출처 태깅 없음
```

**만들 것:**

```
=== Part A: Anomaly Detector (패턴 구현) ===

파일: src/lib/engine/anomalyDetector.ts

1. 단일 이상 감지 (12개):
   각각 구체적 임계값으로 구현:

   // SA 시리즈 (가격)
   detectPriceDirection(klines):    4H 2봉+ ±2% → SA-01
   detectSideways(klines, atr):     변동 < ATR×0.5 → SA-02
   detectPriceCrash(klines):        1H -5%+ → SA-03
   detectChoCH(klines):             구조 전환 → SA-04 (기존 BOS_CHOCH 팩터 활용)
   detectDivergence(klines, rsi):   RSI div → SA-05 (기존 RSI_DIVERGENCE 활용)
   detectBtcDecoupling(coin, btc):  상관 < 0.3 → SA-06

   // DA 시리즈 (파생상품)
   detectFrExtreme(funding):        |FR| > 0.05% → DA-01
   detectLiqCluster(liqData, oi):   가격대별 OI 5%+ → DA-02
   detectOiCrash(oiSeries):         1H -15%+ → DA-03
   detectLsExtreme(lsRatio):        >1.8 or <0.6 → DA-05
   detectOiAccum(oiSeries):         4H 3봉+ 연속↑ → DA-09

   // FA 시리즈 (온체인)
   detectNetInflow(flow, avg7d):    3x avg → FA-01
   detectNetOutflow(flow, avg7d):   3x avg → FA-02
   detectWhaleMove(txList):         $1M+ 단일 → FA-03

   // SC 시리즈 (거래량)
   detectVolumeSpike(vol, avg7d):   5x avg → SC-A1
   detectVolumeDrought(vol, avg7d): 0.3x avg → SC-A2

   // SEA 시리즈 (소셜)
   detectSocialSpike(mentions, avg7d): 10x avg → SEA-01
   detectSocialDrop(mentions, avg7d):  0.2x avg → SEA-02
   detectFgExtreme(fg):               ≤20 or ≥85 → SEA-03

2. 7일 평균 계산 필요 → 새 테이블:
   metric_history:
     asset, metric_type (volume/oi/flow/social), timestamp, value
     → 매 스캔마다 현재값 기록
     → 7일 rolling avg 쿼리로 계산

=== Part B: Composition Engine (복합 패턴) ===

파일: src/lib/engine/patternComposer.ts

   // CA 시리즈
   composePatterns(anomalies[]):
     CA-01 하락+OI     = SA-01(하락) + DA-09(OI↑)
     CA-03 입금기회    = FA-01(입금) + SA-02(횡보)
     CA-04 블록매집    = FA-02(출금) + SA-02(횡보)
     CA-05 구조전환    = SA-04(CHoCH) + SA-05(div)
     CA-06 소셜선행    = SEA-01(소셜↑) + SA-02(횡보)
     CA-07 OI압축      = DA-09(OI↑) + SA-02(횡보)
     CA-08 소셜이탈    = SEA-02(소셜↓) + SA-02(횡보)
     CA-09 파생극단    = DA-01(FR) + DA-09(OI) + DA-02(청산)
     CA-10 다중경고    = 3개+ 카테고리 동시 이상

   스코어링:
     단일 이상: 각각 0~100 점
     복합 이상: 구성 이상의 가중 합 × 카테고리 보너스
     Score ≥ 70 → HIGH
     Score ≥ 55 → MEDIUM
     Score < 55 → LOW (표시 안 함)

=== Part C: Source ID 체계 ===

파일: src/lib/engine/sourceId.ts

   formatSourceId(provider, type, asset, metric):
     → "[SRC:DRV:CG:ETH:FR]"
     → "[SRC:EX:BIN:BTC:4H]"
     → "[SRC:CHAIN:ARK:SOL:FLOW]"
     → "[SRC:SOC:LC:SUI:VOL]"

   모든 데이터 포인트에 source 첨부.
   Source ID 없는 수치는 표시하지 않는다 (문서 원칙 준수).

=== Part D: Scanner Scheduler ===

파일: src/lib/server/scanScheduler.ts

  Tier 1: 글로벌 스캔 (전체 유저 공유)
  ├─ 1분:  BTC/ETH/주요 10종 가격 갱신 (Binance WS — 이미 있음)
  ├─ 5분:  Top 30 코인 단일 이상 감지 (SA/DA/SC 시리즈)
  ├─ 15분: 복합 이상 조합 (CA 시리즈) + 스코어링
  ├─ 1시간: 온체인 + 소셜 갱신 (FA/SEA 시리즈, API 호출 필요)
  ├─ 4시간: 풀 Market Snapshot (19소스)
  └─ 매일: 매크로 + 7일 평균 갱신

  Tier 2: 유저별 필터 (유료만)
  ├─ 관심 자산에서 감지된 이상만 필터링
  ├─ per-user LoRA가 있으면 confidence 재평가
  └─ 알림 트리거

기술 선택: node-cron (MVP) → BullMQ (5K+ 유저)

=== Part E: NL → 패턴 매핑 ===

파일: src/lib/prompt/patternMatcher.ts (promptParser.ts 확장)

  "OI 쌓이는데 가격 횡보인 코인" → CA-07 검색
  "FR 극단인 거" → DA-01 검색
  "터질 것 같은 코인" → CA-09 또는 CA-10 검색
  "BTC 어때" → G-1 (해당 코인 활성 이상 전체)
  "PENDLE이랑 GMX 비교" → G-4 (Light Score 비교)

  매핑 방식: 키워드 + 의도 분류
    "OI" + "횡보/압축" → CA-07
    "FR" + "극단/높은" → DA-01
    "터질/폭발" → CA-09, CA-10
    코인명만 → G-1
    코인 + "사도 돼" → G-2 (5 Agent 풀 분석)
```

**공수 재산정: 3일 → 10일**

```
기존 추정 3일은 "cron만 추가"였음.
실제로는:
  Part A 이상 감지 (18개 함수):     4일
  Part B 복합 조합 (10개 패턴):     2일
  Part C Source ID:                 1일
  Part D 스케줄러:                  1일
  Part E NL 매핑:                   2일
  합계:                            10일

단, Part A에서 기존 팩터 엔진의 6개 PARTIAL을 재활용하면:
  임계값 수정 (6개):               0.5일
  새 구현 (12개):                  3일
  → Part A 실제:                   3.5일
  → 전체 실제:                     9.5일 ≈ 10일
```

**의존:**
- metric_history 테이블 (7일 평균용) — 새 마이그레이션 필요
- Coinalyze API (DA 시리즈) — 이미 연동됨 ✅
- LunarCrush/Santiment (SEA 시리즈) — 이미 연동됨 ✅
- CryptoQuant/Coin Metrics (FA 시리즈) — 이미 연동됨 ✅

**결과:** NL Pattern Catalog 28개 패턴이 실제로 작동하는 스캐너.

---

### B-02: 시그널 결과 자동 추적

**현재:** `tracked_signals` 테이블에 시그널 기록은 되지만, 결과(맞았는지 틀렸는지)를 자동으로 체크하는 로직 없음.

**만들 것:**

```
파일: src/lib/server/signalOutcomeWorker.ts

로직:
  매 1시간마다:
  1. tracked_signals WHERE status='tracking' AND expires_at <= now() 조회
  2. 각 시그널의 현재 가격 조회 (Binance REST)
  3. 결과 판정:
     direction=LONG → current > entry → 적중
     direction=SHORT → current < entry → 적중
  4. pnl_percent 계산
  5. status → 'resolved_win' 또는 'resolved_loss'
  6. Accuracy 집계 업데이트 (user_agent_stats 테이블)

추가 테이블:
  signal_outcomes:
    signal_id, check_time (4H/24H/7D), price_at_check, pnl_at_check
    → 하나의 시그널에 여러 시점 결과 기록

집계:
  유저별 에이전트 Accuracy = resolved_win / (resolved_win + resolved_loss)
  → 이게 NSM의 원천 데이터
  → 이게 DOUNI 상태 시스템의 Accuracy 값
```

**의존:** B-01 (스캐너가 시그널을 적재해야 추적 가능)
**결과:** "내 DOUNI 정확도 63%" 같은 실제 메트릭. NSM 측정 가능.

---

### B-03: 대화형 Terminal UI

**현재:** `src/routes/terminal/+page.svelte` 3000줄 Bloomberg 스타일 대시보드.
**이미 만든 것:** DOUNIChat, DOUNISprite, PromptInput, ArtifactPanel, promptParser, analysisStack (Phase 2)

**남은 것:**

```
1. terminal/+page.svelte 교체 (3일)
   기존 3000줄 → 새 레이아웃으로 교체
   좌 30%: DOUNIChat
   우 70%: ArtifactPanel (기존 ChartPanel 임베드)
   하단: PromptInput

2. 프롬프트 → 엔진 연결 (2일)
   promptParser가 액션 파싱 → 실제 API 호출로 연결
   "BTC" → fetchKlines('BTCUSDT', '4h') → 차트 렌더
   "RSI" → 차트에 RSI 오버레이 추가
   "OI" → Coinalyze API → 파생상품 패널 렌더
   "롱 82400 SL 81400" → 포지션 아티팩트 생성

3. DOUNI 대사 생성 연결 (2일)
   promptParser 결과 → llmService 호출 → DOUNIChat에 메시지 추가
   팩터 엔진 결과를 컨텍스트로 주입
   분석 스택에 자동 추가
```

**의존:** 없음 (컴포넌트 이미 생성됨)
**결과:** 메인 제품 화면 완성.

---

### B-04: DOUNI 성격 레이어

**현재:** `llmService.ts`의 시스템 프롬프트가 범용. "You are ${agentId}, a specialized crypto trading analysis agent..." 캐릭터 없음.

**만들 것:**

```
파일: src/lib/server/douniPersonality.ts

구조:
  DOUNI_PERSONA = {
    name: string,         // 유저가 지은 이름
    personality: 'aggressive' | 'balanced' | 'conservative',
    stage: 'newborn' | 'learning' | 'adapting' | 'specialized' | 'mastered',
    accuracy: number,
    specialties: string[],  // 잘하는 패턴
    weaknesses: string[],   // 약한 분야
  }

  buildDouniSystemPrompt(persona, context):
    "너는 ${persona.name}, 트레이딩 AI 에이전트야.
     성격: ${personalityMap[persona.personality]}

     [aggressive]: 빠르게 판단하고 확신 있게 말해. 기회를 강조해.
     [balanced]: 근거를 먼저 제시하고 양면을 보여줘.
     [conservative]: 리스크를 먼저 지적하고 신중하게 말해.

     네 현재 정확도는 ${persona.accuracy}%야.
     ${persona.accuracy > 60 ? '자신 있게 분석해.' : '겸손하게, 아직 배우는 중이라고 말해.'}

     잘하는 분야: ${persona.specialties.join(', ')}
     → 이 분야에서는 확신을 가져도 돼.

     약한 분야: ${persona.weaknesses.join(', ')}
     → 이 분야에서는 솔직히 '여긴 아직 약해'라고 말해.

     말투: 반말. 짧게. 2~3문장. 한국어 OK.
     분석할 때: 방향 + confidence% + 핵심 근거 1~2개.
     틀렸을 때: '내가 틀렸네. 이유는...' 솔직히 인정.
     맞았을 때: '맞았어!' 하지만 과하지 않게."

  postProcessResponse(raw, persona, context):
    // LLM 출력에 DOUNI 감정 태그 추가
    // confidence > 80 → mood: 'excited'
    // confidence < 50 → mood: 'uncertain'
    // 결과 맞았을 때 → mood: 'confident'
    // 결과 틀렸을 때 → mood: 'humble'
    return { text, mood, direction }
```

**의존:** 없음
**결과:** DOUNI가 성격 있는 대화를 함. 캐릭터 느낌.

---

### B-05: 학습 작업 실행 워커

**현재:** `passportMlPipeline.createPassportTrainJob()`이 큐에 넣기만 함. 실행하는 워커 없음.

**만들 것:**

```
파일: src/lib/server/mlTrainWorker.ts

구조:
┌──────────────────────────────────────────────────┐
│  ML Train Worker                                  │
│                                                   │
│  매 10분마다:                                     │
│  1. ml_train_jobs WHERE status='queued' 조회       │
│  2. 가장 오래된 job 1개 픽업 (FOR UPDATE SKIP)     │
│  3. status → 'running'                            │
│  4. dataset_version_ids로 학습 데이터 수집          │
│  5. 외부 학습 API 호출:                            │
│     ├─ Option A: Together.ai Fine-tuning API       │
│     ├─ Option B: Modal.com (GPU serverless)        │
│     └─ Option C: 자체 GPU 서버 SSH + 스크립트 실행 │
│  6. 학습 완료 대기 (polling or webhook)             │
│  7. 결과 아티팩트 저장 (S3/R2에 LoRA weights)      │
│  8. ml_model_registry에 새 버전 등록               │
│  9. status → 'succeeded' + artifacts 업데이트       │
│  10. 실패 시 status → 'failed' + error 기록        │
└──────────────────────────────────────────────────┘

학습 API 선택:
  Together.ai Fine-tuning:
    - ORPO/DPO 지원
    - JSONL 업로드 → 학습 → 모델 ID 반환
    - 비용: ~$2~5 per training run (소형 모델)
    - 추론: Together.ai inference API에서 서빙

  Modal.com:
    - GPU serverless (A100/H100)
    - Python 스크립트 직접 실행
    - 비용: ~$1~3/시간 (A100)
    - 유연하지만 구현 복잡

  자체 GPU (현재 96GB):
    - SSH로 학습 스크립트 트리거
    - 비용: 이미 지불 중
    - 제한: 동시 1~2 job만 가능

MVP 추천: Together.ai
  → API 호출 1번으로 학습 시작
  → 같은 API로 추론 서빙
  → 스케일링 문제 없음
  → 비용: 유료 유저 1명당 월 $1~3 (주 1회 학습)
```

**의존:** ORPO pair 빌더 (이미 있음), JSONL export (이미 있음)
**결과:** "내 데이터로 학습된 모델"이 실제로 존재.

---

### B-06: per-user LoRA 서빙

**현재:** 코드 0%. 모든 유저가 같은 글로벌 모델 사용.

**만들 것:**

```
파일: src/lib/server/userModelService.ts

구조:
  getUserModel(userId):
    1. ml_model_registry에서 유저의 active 모델 조회
    2. 없으면 → 글로벌 Base model 반환
    3. 있으면 → LoRA adapter ID 반환

  runUserInference(userId, context):
    1. model = getUserModel(userId)
    2. if (model.type === 'base'):
       → 글로벌 모델로 추론 (현재와 동일)
    3. if (model.type === 'user_lora'):
       → Together.ai inference API에 base_model + lora_adapter 지정
       → 또는 자체 GPU에서 PEFT merge 후 추론

  Together.ai LoRA 서빙:
    POST /v1/completions
    {
      "model": "base-model-id",
      "lora": "ft:user-123-lora-v4",
      "prompt": context
    }
    → Together.ai가 LoRA merge를 서버에서 처리
    → 추가 인프라 불필요

저장:
  S3/R2: lora-weights/{userId}/{version}/adapter_model.safetensors
  DB: ml_model_registry.artifacts = { "lora_path": "s3://...", "together_ft_id": "ft:..." }

비용:
  Together.ai inference: ~$0.001/요청 (소형 모델)
  유료 유저 4000명 × 30요청/일 = 120K요청/일 = ~$120/일 = ~$3,600/월
  Pro 유저 매출 $39,200/월 대비 9% → 건강함.
```

**의존:** B-05 (학습 워커가 LoRA를 만들어야 서빙 가능)
**결과:** "내 DOUNI가 나를 닮아간다"가 진짜가 됨.

---

### B-07: 모델 배포 파이프라인

**현재:** ml_model_registry, ml_eval_reports 테이블 있지만 자동화 없음.

**만들 것:**

```
파일: src/lib/server/modelDeployPipeline.ts

플로우:
  학습 완료 → shadow 배포
    → 실제 트래픽의 10%에 shadow 모델 적용
    → 7일간 Accuracy 비교 (기존 vs shadow)

  shadow Accuracy > 기존 + 1%p → canary 승격
    → 실제 트래픽의 50%에 canary 적용
    → 3일간 모니터링

  canary 안정 → active 승격
    → 전체 트래픽에 새 모델 적용
    → 이전 모델 archived

  어디서든 Accuracy 하락 → 롤백
    → 이전 active 모델로 즉시 복원

DB 업데이트:
  ml_model_registry.status: shadow → canary → active
  ml_eval_reports: 각 단계별 평가 기록
```

**의존:** B-05, B-06
**결과:** 모델 업데이트가 안전하게 자동으로 이루어짐.

---

### B-08: Critic 추론 단계

**현재:** Scanner → Analyst (2단계). Critic 없음.

**만들 것:**

```
파일: src/lib/engine/criticStage.ts

역할:
  Analyst 출력 (방향 + confidence + 근거)을 받아서:
  1. 반대 근거 탐색 — "이 방향이 틀릴 수 있는 이유"
  2. confidence 보정 — 반대 근거가 강하면 confidence 하향
  3. 리스크 태그 — "볼륨 미확인", "레짐 전환 중", "매크로 역풍"

  runCriticStage(analystOutput, marketContext):
    반대_팩터 = 현재 방향과 반대인 팩터들 필터링
    리스크_점수 = 반대_팩터의 가중 합
    보정_confidence = analyst.confidence × (1 - 리스크_점수 × 0.3)
    리스크_태그 = 반대_팩터 중 score > 임계값인 것들의 이름

    return {
      ...analystOutput,
      confidence: 보정_confidence,
      risks: 리스크_태그,
      criticNote: "볼륨이 방향을 확인하지 못하고 있어. 주의."
    }

DOUNI 연결:
  Critic 결과가 DOUNI 대사에 반영:
  confidence 높으면 → "이번 건 확실해!"
  리스크 있으면 → "근데 한 가지 걸리는 게 있어..."
```

**의존:** 없음 (기존 팩터 엔진 위에 추가)
**결과:** 분석 품질 향상 + DOUNI가 리스크를 지적하는 근거.

---

### B-09: 결제 + 요금제

**만들 것:**

```
파일: src/lib/server/billing.ts, src/routes/api/billing/+server.ts

Stripe 연동:
  Product: COGOCHI
  Prices:
    starter_monthly: $19/mo
    pro_monthly: $49/mo
    team_monthly: $199/mo

DB:
  user_subscriptions:
    user_id, stripe_customer_id, stripe_subscription_id
    plan: free/starter/pro/team
    status: active/cancelled/past_due
    current_period_end

게이팅:
  src/lib/server/planGate.ts:
    checkPlanAccess(userId, feature):
      plan = getUserPlan(userId)
      return PLAN_FEATURES[plan][feature]

  모든 API 라우트에서:
    분석 횟수 → Free 10회/일 체크
    자산 접근 → plan별 허용 자산
    LLM 대화 → Pro+ 만 Tier 3
    스캔 주기 → plan별
    알림 횟수 → plan별
```

**의존:** 없음
**결과:** 돈을 벌 수 있음.

---

## 3. 빌드 순서 (의존 관계 기반)

```
Week 1-2: P0-a (스캐닝 엔진)
  ├─ B-01 Part A: 이상감지 18개 (3.5일)    ← 기존 팩터 재활용
  ├─ B-19 계좌 포지셔닝 (2일)              ← 병렬. Binance 무료 API.
  ├─ B-01 Part B: 복합패턴 10개 (2일)      ← Part A + B-19 후
  ├─ B-01 Part C: Source ID (1일)          ← 병렬 가능
  └─ B-04 DOUNI 성격 (3일)                ← 의존 없음, 병렬

Week 3-4: P0-b (Terminal + 스캔 연결)
  ├─ B-01 Part D: 스케줄러 (1일)           ← Part A,B 후
  ├─ B-01 Part E: NL 패턴 매핑 (2일)       ← Part A,B 후
  ├─ B-02 시그널 결과 추적 (2일)            ← B-01 후
  ├─ B-03 Terminal UI (7일)                ← B-01, B-04와 연결
  └─ B-08 Critic 단계 (2일)               ← 의존 없음, 병렬

Week 5-6: P1 (핵심 가치)
  ├─ B-05 학습 워커 (5일)                  ← 의존 없음
  ├─ B-06 per-user LoRA (7일)              ← B-05 후
  └─ B-09 결제 (5일)                       ← 의존 없음, 병렬

Week 7-8: P2 (사업화)
  ├─ B-07 모델 배포 (3일)                  ← B-05, B-06 후
  ├─ B-10 모바일 (3일)                     ← B-03 후
  ├─ B-11 Home 대시보드 (3일)              ← B-01, B-02 후
  ├─ B-12 푸시 알림 (3일)                  ← B-01 후
  └─ B-14 Oracle 리더보드 (3일)            ← B-02 후

Week 9-10: P3-a (15레이어 스캐너)
  ├─ B-13 새 4레이어 (호가창/김프/섹터/Hunt) (7일)
  ├─ B-13 기존 5레이어 보강 (와이코프/청산/돌파/BB/ATR) (5일)
  └─ B-14 Alpha Score + 컬러태그 (3일)    ← B-13 후

Week 11-12: P3-b (플랫폼 확장)
  ├─ B-16 모델 Export/API (5일)            ← B-06 후
  └─ B-17 HOOT VTR (7일)                  ← B-06 후
```

```
타임라인:
  ─────────────────────────────────────────────
  Week 1-2    Week 3-4    Week 5-6    Week 7-8
  P0 제품     P1 AI       P2 사업     P3 확장
  스캐닝      학습/LoRA   결제/모바일  Oracle/HOOT
  Terminal    Critic      Home        Export
  DOUNI성격               알림        인디확장
  시그널추적
  ─────────────────────────────────────────────

  Week 2 끝: 28개 패턴 스캐닝 엔진 작동 + DOUNI 성격
  Week 4 끝: "대화로 차트 보고 패턴 감지 + DOUNI 반응" 프로토타입
  Week 6 끝: "내 데이터로 학습된 모델" + 결제 가능
  Week 8 끝: "돈 받을 수 있는" 제품 (모바일, Home, 알림, Oracle)
  Week 10 끝: 15레이어 풀 스캐너 + Alpha Score (-100~+100) + 컬러태그
  Week 12 끝: "확장 가능한" 플랫폼 (Export, HOOT, API)
```

---

### B-13: 15레이어 스캐너 확장

**레퍼런스:** Easychartgo 15레이어 시스템 (텔레그램 미니앱)

**현재 vs 목표 레이어 매핑:**

```
Easychartgo 레이어             현재 코드                    상태
──────────────                ──────────                   ────
L1  와이코프 ACC/DIST          BOS_CHOCH 팩터 (부분)         ⚠️ PARTIAL
L2  수급 (FR+OI+L/S+Taker)    FR_TREND, OI_PRICE_CONV 등    ⚠️ PARTIAL
L3  V-Surge 거래량 이상        VOL_TREND, CLIMAX_SIGNAL      ⚠️ PARTIAL
L4  호가창 매수벽/매도벽        없음                          ❌ MISSING
L5  청산존 Basis               LIQUIDATION_TREND (부분)      ⚠️ PARTIAL
L6  BTC 온체인                 EXCHANGE_FLOW, WHALE 등       ✅ EXIST
L7  공포/탐욕                  FG_TREND                      ✅ EXIST
L8  김치프리미엄               없음                          ❌ MISSING
L9  실제 강제청산 1H           LIQUIDATION_TREND (부분)      ⚠️ PARTIAL
L10 MTF 컨플루언스             MTF_ALIGNMENT (있음)          ✅ EXIST
L11 CVD 매수/매도 누적         CVD_TREND, ABSORPTION         ✅ EXIST
L12 섹터 자금 흐름             없음                          ❌ MISSING
L13 돌파 감지                  DISPLACEMENT (부분)           ⚠️ PARTIAL
L14 볼린저밴드 스퀴즈          calcBollingerBands() 있음     ⚠️ PARTIAL
L15 ATR 변동성                 calcATR() 있음                ⚠️ PARTIAL
```

**만들어야 하는 것:**

```
=== 새로 추가 (4개 레이어) ===

L4 호가창 매수벽/매도벽:
  파일: src/lib/engine/layers/orderbookImbalance.ts
  데이터: Binance Order Book API (depth endpoint)
  로직: 상위 20호가 매수/매도 비율 계산
        매수벽 = 매수 잔량 > 매도 잔량 × 2 → 지지
        매도벽 = 매도 잔량 > 매수 잔량 × 2 → 저항
  ⚠️ 레이트리밋: depth 요청은 weight 5~50. 간격 필요.

L8 김치프리미엄:
  파일: src/lib/engine/layers/kimchiPremium.ts
  데이터: 업비트 API (무료, 키 불필요) + 빗썸 API
  로직: 업비트KRW가격 / (바이낸스USD가격 × 환율) - 1
        프리미엄 > 3% → 국내 과열
        프리미엄 < -1% → 국내 침체
  참고: 환율은 하나은행 API 또는 고정 환율

L12 섹터 자금 흐름:
  파일: src/lib/engine/layers/sectorFlow.ts
  데이터: 기존 CoinGecko categories API
  로직: 섹터별 24H 평균 변동률 → 자금 유입/유출 섹터 식별
        Layer1, DeFi, Meme, AI, GameFi 등 주요 섹터
        섹터 평균 대비 개별 코인 Alpha = 섹터 대비 초과 수익률

Hunt Score (Easychartgo의 Hunt 점수):
  파일: src/lib/engine/layers/huntScore.ts
  로직: DEX 상장 여부 + 거래량 활성도 + 유동성 + 체결 방향 + 홀더 수
        → DEX에서 발견된 초기 코인의 잠재력 평가
        → CEX 상장 임박 예측 (Bitget 상장 → Binance 선행 신호)
  데이터: DexScreener API (무료) 또는 GeckoTerminal API (이미 사용 중)

=== 기존 PARTIAL → FULL 보강 (5개) ===

L1 와이코프 풀 구현:
  현재: BOS_CHOCH (구조 전환만 감지)
  추가: PS/SC/AR/ST/Spring/UTAD/LPS/SOS 패턴 감지
        멀티 윈도우 스캐닝 (4H/1D/1W)
        C&E 목표가 계산 (×1 / ×1.5)
  공수: 3일

L5+L9 청산 상세화:
  현재: 롱/숏 총합만
  추가: 1H 단위 롱/숏 USD 집계
        가격대별 청산 밀집 (히트맵 데이터)
        Basis (현선물 스프레드) 계산
  공수: 2일

L13 돌파 감지:
  현재: DISPLACEMENT (가격 이탈만)
  추가: 저항선 돌파 + 거래량 동반 확인
        가짜 돌파 필터 (돌파 후 되돌림 체크)
  공수: 1일

L14 BB 스퀴즈 에너지:
  현재: 밴드 계산만
  추가: 밴드 폭 수축률 → 스퀴즈 에너지 점수
        "대형 스퀴즈" 자동 경보 (폭 < 20일 최저)
  공수: 0.5일

L15 ATR 자동 SL/TP:
  현재: ATR 계산만
  추가: ATR × 1.5 = 자동 SL 추천
        ATR × 3 = 자동 TP 추천
        변동성 레짐 (High/Normal/Low)
  공수: 0.5일
```

**Alpha Score 시스템 (B-14):**

```
Alpha Score = 15레이어 가중 합산 (-100 ~ +100)

가중치:
  L1  와이코프        ×15  (가장 중요: 구조)
  L2  수급            ×12
  L3  거래량          ×10
  L4  호가창          ×5
  L5  청산존          ×8
  L6  온체인          ×8
  L7  공포탐욕        ×3
  L8  김프            ×3
  L9  강제청산        ×5
  L10 MTF             ×10
  L11 CVD             ×8
  L12 섹터            ×3
  L13 돌파            ×5
  L14 BB스퀴즈        ×3
  L15 ATR             ×2
  합계               ×100

등급:
  +60 ~ +100  STRONG BULL  ⚡
  +25 ~ +59   BULL
  -24 ~ +24   NEUTRAL
  -59 ~ -25   BEAR
  -100 ~ -60  STRONG BEAR

컬러 태그:
  🟢 녹색 = 상승 시그널 (각 레이어에서)
  🟡 노란색 = 경고/주의
  🔴 빨간색 = 하락 시그널
  → 각 레이어가 태그를 생성하고 딥다이브 패널에 나열
```

**공수: 12일 (새 4개 레이어 7일 + 기존 보강 5일)**

---

### B-19: 계좌 수 기반 포지셔닝 데이터

**현재:** L/S Ratio는 Coinalyze에서 볼륨 기반만 가져옴. 계좌 수 기반 없음.

**만들 것:**

```
파일: src/lib/api/binanceFuturesData.ts

4개 엔드포인트 추가 (전부 무료, 키 불필요):

1. fetchGlobalLSAccountRatio(symbol, period, limit)
   GET /futures/data/globalLongShortAccountRatio
   → { longAccount: 57.2%, shortAccount: 42.8%, timestamp }
   → "전체 트레이더 중 57%가 롱"

2. fetchTopTraderLSAccountRatio(symbol, period, limit)
   GET /futures/data/topLongShortAccountRatio
   → { longAccount: 62%, shortAccount: 38%, timestamp }
   → "상위 20% 트레이더 중 62%가 롱"

3. fetchTopTraderLSPositionRatio(symbol, period, limit)
   GET /futures/data/topLongShortPositionRatio
   → { longPosition: 71%, shortPosition: 29%, timestamp }
   → "상위 20% 트레이더 포지션 금액 71%가 롱"

4. fetchTakerBuySellVolume(symbol, period, limit)
   GET /futures/data/takerlongshortRatio
   → { buyVol: 1234.5, sellVol: 987.2, buySellRatio: 1.25, timestamp }
   → "시장가 매수가 25% 더 많음 = 축적 중"

period: '5m' | '15m' | '1h' | '4h' | '1d'
limit: 30 (기본) — 히스토리 30개
```

```
파일: src/lib/engine/layers/accountPositioning.ts

스마트머니 vs 리테일 분석:

  analyzeAccountPositioning(global, top, taker):

  [패턴 1] 리테일 롱 극단 — 위험
    global.longAccount > 70% AND top.longAccount < 50%
    → 🔴 "리테일 72% 롱인데 고래는 숏 치우침. 조심."
    → DA-10 코드 부여

  [패턴 2] 스마트머니 축적 — 기회
    global.shortAccount > 55% AND top.longAccount > 60% AND taker.buySellRatio > 1.1
    → 🟢 "리테일은 숏인데 고래가 시장가 매수 중. 축적."
    → DA-11 코드 부여

  [패턴 3] 전원 합의 — 반전 경고
    |global.longAccount - top.longAccount| < 5%
    AND (global.longAccount > 65% OR global.shortAccount > 65%)
    → 🟡 "모두 같은 방향. 반전 가능성."
    → DA-12 코드 부여

  [패턴 4] 고래 극단 포지션 — 강한 방향
    top.longPosition > 75% OR top.shortPosition > 75%
    → ⚡ "상위 트레이더 자금 75%가 한 방향. 강한 확신."
    → DA-13 코드 부여

  [패턴 5] Taker 이상 — 급변 임박
    taker.buySellRatio > 2.0 OR taker.buySellRatio < 0.5
    → ⚠️ "시장가 매수/매도 2배 이상 차이. 급변 가능."
    → DA-14 코드 부여
```

```
DOUNI 대사 예시:

  DA-11 감지 시:
  🐦 "재밌는 거 발견했어. 리테일 58%가 숏인데,
      고래들은 조용히 시장가 매수 중이야.
      Taker buy 비율 1.35. 축적 냄새 나."

  DA-10 감지 시:
  🐦 "⚠️ 조심. 리테일 73%가 롱인데
      상위 트레이더들은 오히려 숏 쌓고 있어.
      이런 패턴에서 3번 중 2번은 롱 청산이 왔어."
```

```
비용: $0 (Binance 무료 API)
Weight: 각 엔드포인트 weight 1~2. 30코인 × 4개 = 120~240 weight.
캐시: 5분 (데이터 자체가 5분 단위)
공수: 2일 (API 연동 1일 + 패턴 감지 1일)
```

**의존:** 없음. Binance 무료 API.
**결과:** "고래가 뭘 하고 있는지" 실시간 감지. Easychartgo S3 "체결 방향"과 동급.

---

### B-20: 전략 빌더 (유저 정의 시퀀스 패턴)

**핵심:** 유저가 자기 트레이딩 전략을 입력하면, DOUNI가 24/7 감시하고 조건 맞으면 알려줌.

**예시 프리셋 5개 (기본 제공):**

```
[1] 거래량 3단 돌파
  "1차 거래량 돌파 → 횡보(비장악) → 더 큰 거래량 3차 돌파"
  Phase 1: 저항 근처 + vol > 2x avg
  Phase 2: 저항 ±2% 횡보 + 양봉 비장악 + OI↑ + 롱계좌↓
  Phase 3: vol > Phase1 vol + 장대양봉 + MSB
  Entry: Phase 2 눌림 분할 / Phase 3 MSB 추격

[2] 숏스퀴즈 셋업
  "FR 극단 + OI 누적 + 횡보 → 폭발"
  Phase 1: DA-01(FR극단) + DA-09(OI↑) + SA-02(횡보)
  Phase 2: DA-11(고래 매수) 감지
  Phase 3: SA-01(급등) + SC-A1(거래량 폭발)
  Entry: Phase 1~2 분할 매수

[3] 스마트머니 매집
  "고래 출금 + 가격 횡보 + 리테일 숏 → 반등"
  Phase 1: FA-02(거래소 출금 3x) + SA-02(횡보)
  Phase 2: DA-11(리테일 숏 + 고래 롱)
  Phase 3: SA-04(CHoCH) + 거래량 동반
  Entry: Phase 2 확인 후 분할

[4] 다이버전스 반전
  "RSI 다이버전스 + 지지선 테스트 + 거래량 확인"
  Phase 1: SA-05(RSI div) + 지지선 근처
  Phase 2: 지지선 리테스트 + 비이탈
  Phase 3: SA-01(반등) + 거래량 증가
  Entry: Phase 2 지지선 근처

[5] 온체인 선행
  "고래 이동 + 소셜 조용 → 가격 아직 안 움직임"
  Phase 1: FA-03(고래 $1M+) + SEA-02(소셜 감소)
  Phase 2: SA-02(횡보 유지)
  Phase 3: 아직 안 왔지만 대기 중
  Entry: Phase 1+2 확인 시 선진입
```

**유저 입력 방식 3가지:**

```
방식 1: 자연어 (가장 쉬움)
  프롬프트: "OI 올라가면서 가격 횡보하다가
            거래량 터지면서 돌파하는 코인 찾아줘"

  → LLM이 파싱:
    Phase 1: DA-09(OI↑) + SA-02(횡보)
    Phase 2: SC-A1(거래량 5x) + L13(돌파)
  → "이 전략으로 감시할까?" [확인] [수정]

방식 2: 블록 조합 (중급)
  UI에서 드래그/선택:
  ┌─────────────────────────────────┐
  │ Phase 1:                         │
  │  [+ 조건 추가]                   │
  │  ┌──────────┐ ┌──────────┐      │
  │  │ OI 누적  │ │ 가격 횡보│      │
  │  │ DA-09    │ │ SA-02    │      │
  │  └──────────┘ └──────────┘      │
  │                                  │
  │ Phase 2:                         │
  │  [+ 조건 추가]                   │
  │  ┌──────────┐ ┌──────────┐      │
  │  │ 거래량   │ │ 돌파     │      │
  │  │ SC-A1    │ │ L13      │      │
  │  └──────────┘ └──────────┘      │
  │                                  │
  │ 필터:                            │
  │  ☑ 롱계좌 감소 (DA-11)           │
  │  ☐ FR 극단 (DA-01)              │
  │                                  │
  │ [저장] [테스트] [감시 시작]      │
  └─────────────────────────────────┘

방식 3: 프리셋 복사 + 수정 (가장 일반적)
  프리셋 "거래량 3단 돌파" 선택
  → 조건 확인 → 임계값 수정 (vol 2x → 3x 등)
  → 자산 범위 선택 (BTC만 / Top 30 / 전체)
  → [저장] [감시 시작]
```

**데이터 구조:**

```
DB: user_strategies
  id, user_id, name, description
  phases: JSONB [
    { phase: 1, conditions: [{code: 'DA-09'}, {code: 'SA-02'}], logic: 'AND' },
    { phase: 2, conditions: [{code: 'SC-A1'}, {code: 'L13'}], logic: 'AND' }
  ]
  filters: JSONB [
    { code: 'DA-11', required: true }
  ]
  entry_rules: JSONB {
    phase_1_entry: { type: 'split', target: 'pullback_low' },
    phase_2_entry: { type: 'chase', target: 'msb_high' }
  }
  assets: string[] ['BTCUSDT', 'ETHUSDT'] 또는 ['TOP30']
  status: 'active' | 'paused'
  created_at, updated_at

DB: strategy_alerts
  id, strategy_id, user_id, asset
  current_phase: 0 | 1 | 2 | 3
  phase_data: JSONB (각 phase 진입 시점/가격/데이터)
  alerted_at, resolved_at
```

**스캐너 연동:**

```
scanScheduler에 추가:

  매 5분 (Tier 2 유저별 스캔):
  1. user_strategies WHERE status='active' 조회
  2. 각 전략의 감시 대상 코인에 대해:
     a. 현재 phase 확인
     b. 다음 phase 조건 체크 (anomalyDetector + 기존 팩터)
     c. 전이 발생 시 → strategy_alerts 업데이트 + 알림

  비용:
    전략 자체는 이미 계산된 anomaly 데이터 위에서 조건만 체크
    → 추가 API 호출 거의 없음
    → CPU만 약간 사용
```

**DOUNI 연동:**

```
전략 진행 시 DOUNI가 알려줌:

  Phase 1 진입:
  🐦 "네 '거래량 3단 돌파' 전략에서
      ETH가 Phase 1에 들어갔어.
      저항선 $3,850에 거래량 2.3배 터치 중."
      [차트 보기] [무시]

  Phase 2 진입:
  🐦 "ETH Phase 2 진입! 횡보 + 양봉 비장악 확인.
      OI +12% 상승 중 + 롱계좌 비율 58→52% 감소 중.

      분할 매수 구간:
      Entry $3,820 / SL $3,750"
      [진입] [계속 관찰]

  Phase 3 진입:
  🐦 "⚡ ETH Phase 3 — 돌파!
      거래량 Phase 1의 1.8배. MSB 확인.

      추격 매수:
      Entry $3,860 / SL $3,830 / TP $4,050"
      [진입] [패스]
```

**요금제:**

```
Free:     프리셋 사용만 (수정 불가). 전략 1개.
Starter:  프리셋 복사+수정. 전략 3개. 감시 자산 5개.
Pro:      자연어 입력 + 블록 빌더. 전략 10개. 감시 전체.
Team:     무제한 전략. API로 전략 생성. 전략 공유/판매.
```

**공수: 7일**

```
전략 DB + CRUD API (1일)
시퀀스 phase 엔진 (2일) — B-20 핵심
NL 파서 → 전략 변환 (1일) — LLM 활용
블록 빌더 UI (2일)
스캐너 연동 + 알림 (1일)
```

**의존:** B-01 (anomalyDetector), B-19 (계좌 데이터), B-04 (DOUNI), B-12 (알림)

**해자:** 전략 자체는 복사 가능. 하지만:
  1. per-user LoRA가 같은 전략을 다르게 실행 (§1.2 해자)
  2. 전략별 유저 성과 데이터가 쌓임 (복제 불가)
  3. 전략 마켓 → 네트워크 효과 (미래 B-18)

---

### API 레이트리밋 대응

```
⚠️ Binance API: 1분당 1200 weight. IP 밴 가능.

대응:
  1. Request Coalescing (이미 구현됨 ✅)
     → 같은 요청 60초 내 중복 차단

  2. 스캔 간격 관리:
     코인 1개 스캔 = ~5 API 호출 (kline + 24hr + depth + trades + OI)
     weight 약 25/코인

     30코인 스캔 = 750 weight → 1분 한도 내

     스케줄: 30코인을 5분 간격으로 → 분당 6코인 = 150 weight
     → 한도의 12.5%. 안전.

  3. 캐시 레이어:
     Binance kline:  10초 캐시 (이미 있음)
     Binance 24hr:   30초 캐시 (이미 있음)
     Depth:          30초 캐시 (추가)
     OI/FR:          5분 캐시 (Coinalyze, 별도 API)

  4. 백오프:
     429 응답 시 → 자동 60초 대기
     IP 밴 감지 → 5분 대기 후 재시도
     연속 실패 3회 → 알림 + 15분 정지

  5. 분산 (유저 5K+ 시):
     여러 서버 IP로 분산
     또는 Binance Data API Pro 구독 ($500/월)
```

---

## 4. 기존 코드 재사용 맵

| 새 기능 | 재사용하는 기존 코드 | 어떻게 |
|---------|---------------------|--------|
| B-01 스캐닝 | `opportunityScanner.ts`, `marketSnapshotService.ts` | cron에서 기존 함수 호출 |
| B-02 결과추적 | `tracked_signals` 테이블 | 기존 테이블에 outcome 컬럼 추가 |
| B-03 Terminal | `ChartPanel.svelte`, `binance.ts` WS | ArtifactPanel 안에 임베드 |
| B-04 DOUNI성격 | `llmService.ts` | buildDouniSystemPrompt로 교체 |
| B-05 학습워커 | `orpo/pairBuilder.ts`, `exportJsonl.ts` | 기존 JSONL을 학습 API에 전달 |
| B-06 LoRA | `passportMlPipeline.ts` DB 스키마 | ml_model_registry에 LoRA 경로 저장 |
| B-08 Critic | `factorEngine.ts` | 기존 팩터 결과에서 반대 근거 추출 |
| B-11 Home | `agentJourneyStore.ts` | 기존 journey state + 시그널 요약 |

---

## 5. 기술 결정 (MVP 기준)

| 결정 | 선택 | 이유 |
|------|------|------|
| 스케줄러 | node-cron | 단일 서버. 5K MAU까지 충분. |
| 학습 API | Together.ai | ORPO/DPO 지원. API 1번 호출. 서빙도 같이. |
| LoRA 서빙 | Together.ai | LoRA merge를 서버에서 처리. 인프라 불필요. |
| LoRA 저장 | Cloudflare R2 | S3 호환. egress 무료. |
| 결제 | Stripe | 표준. Subscription + Usage-based 모두 가능. |
| 푸시 알림 | Web Push + SendGrid | 브라우저 push + 이메일. |
| 차트 | TradingView Lightweight Charts | 오픈소스. 임베딩 용이. |
| 모바일 | 반응형 CSS | 네이티브 앱 아직 불필요. |

---

## 6. 리스크 체크리스트

| 항목 | 리스크 | 확인 시점 | 실패 시 플랜 B |
|------|--------|----------|---------------|
| B-05 | Together.ai ORPO가 트레이딩 데이터에서 유의미한 개선을 만드는가? | Week 3 | Modal.com으로 커스텀 학습 스크립트 |
| B-06 | per-user LoRA 추론 지연이 1초 미만인가? | Week 4 | 배치 추론 (실시간 아닌 캐시) |
| B-03 | 대화형 Terminal이 차트 분석에 실제로 편한가? | Week 2 | 기존 대시보드 유지 + 대화창 사이드 패널 |
| B-01 | 1만 유저 스캐닝이 CPU 2코어로 충분한가? | Week 5 | BullMQ + 워커 분리 |
| B-09 | Free→Starter 전환율이 5%+ 나오는가? | Week 8 | 가격/기능 조정 |
