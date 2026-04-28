# Cogochi — NSM + 비즈니스 모델 (설계문서 v3 보충)

**2026-04-05 | v3 보충 섹션**

---

## A. North Star Metric

### Business Game 분류

```
Primary:   Transformation — "내 AI가 정확해진다" = 역량 변화
Secondary: Productivity   — "시장 분석을 더 빠르게" = 작업 완료
```

### NSM 정의

```
NSM: Weekly Completed Analysis Sessions (주간 완료 분석 세션 수)

정의: 한 주 동안, 유저가 DOUNI와 분석을 시작해서
      최종 판단(LONG/SHORT/FLAT)까지 완료한 세션 수.
      Terminal 대화 분석 + Arena 배틀 모두 포함.

"완료" 기준:
  ✅ 분석 스택에 증거 1개 이상 축적
  ✅ 최종 판단(방향 + 근거) 제출
  ✅ 결과 확인 (실시간 or 역사 시나리오)
  ❌ 중도 이탈 = 미카운트

현재값: 0 (프로덕트 미출시)
M3 목표: 주간 500회 (DAU 50 × 일 1.4회 × 7일)
M6 목표: 주간 5,000회
Kill:    주간 < 140회 at M3
```

### NSM 7가지 검증

```
✅ 1. 고객 가치 반영: 분석 완료 = 가치 경험
✅ 2. 수익 선행: 분석 → 훈련 데이터 → 정확도 → 리텐션 → 수익
✅ 3. 팀 영향 가능: UX, 온보딩, 프롬프트, DOUNI 반응 개선
✅ 4. 측정 가능: 이벤트 로그 (session_completed)
✅ 5. 이해 쉬움: "분석 몇 번 했나"
✅ 6. 행동 변경 유도: 낮으면 → 세션 이탈 지점 퍼널 분석
✅ 7. 허영 아님: 완료만 카운트
```

### Input Metrics Constellation

```
                    NSM
        주간 완료 분석 세션 수
       /     |      |      \
  Breadth  Depth  Frequency  Quality
```

| # | 지표 | 차원 | 정의 | M3 목표 |
|---|------|------|------|---------|
| I1 | Weekly Active Analysts (WAA) | Breadth | 주간 1회+ 분석 완료 유저 수 | 200명 |
| I2 | Sessions per WAA | Frequency | WAA당 주간 평균 세션 수 | 2.5회 |
| I3 | Session Completion Rate | Efficiency | 시작된 세션 중 완료 비율 | 60% |
| I4 | D7 Retention | Quality | 가입 후 7일째 재방문율 | 30% |
| I5 | Model Accuracy Delta | Quality | 파인튜닝 전후 승률 변화 | +5%p |

### NSM 하락 시 디버깅

```
NSM 하락
  ├── I1(WAA) 하락?    → 유입 문제 → 온보딩/마케팅
  ├── I2(빈도) 하락?    → 가치 체감 문제 → 분석 품질/DOUNI 반응
  ├── I3(완료율) 하락?  → UX 문제 → 세션 이탈 퍼널
  ├── I4(리텐션) 하락?  → 장기 가치 문제 → I5 확인
  └── I5(정확도) 정체?  → ML 문제 → AutoResearch 점검
```

---

## B. 비즈니스 모델

### 수익 모델: Subscription + Usage-based 하이브리드

| 수익원 | 유형 | 메커니즘 | Phase |
|--------|------|----------|-------|
| Pro 구독 | Subscription | $19/월 or $190/년 | Phase 1 |
| GPU 크레딧 | Usage-based | 파인튜닝 1회 $2 | Phase 1 |
| 에이전트 임대 | Take Rate | 임대료의 5% | Phase 2 |

### 티어

```
FREE
  ├── Terminal 분석: 일 3세션
  ├── Arena 배틀: 일 2회
  ├── Skills: CoinGecko + Binance 기본
  ├── 메모리: 50장
  ├── AutoResearch: 월 1회 (자동)
  └── Stage: EGG→CHICK

PRO $19/월
  ├── Terminal 분석: 무제한
  ├── Arena 배틀: 무제한
  ├── Skills: 전체 (Nansen, Coinglass)
  ├── 메모리: 200장
  ├── AutoResearch: 주 1회 + 수동 트리거
  ├── Stage: 제한 없음
  └── 우선 지원

GPU 크레딧 (추가)
  ├── 수동 파인튜닝: $2/회
  ├── LoRA Rank 업그레이드: $5
  └── 팩: 10회 $15 / 50회 $60
```

### 가격 근거

```
$19/월:
  TradingView Pro $14.95 + Claude Pro $20 = $35 합산
  Cogochi: $19로 둘 다 커버 → 심리적 가격 우위
  크립토 트레이더 WTP [추정]: $15~40/월 (도구에 기존 지출)

$2/파인튜닝:
  Apple Silicon LoRA 원가 ~$0.30/회
  CUDA A100 spot 원가 ~$0.80/회
  마진 60~85%
```

### Unit Economics [추정]

| 지표 | 수치 | 가정 |
|------|------|------|
| ARPU (Free) | $0.40/월 | GPU 크레딧 가끔 |
| ARPU (Pro) | $23/월 | $19 + $4 크레딧 |
| Blended ARPU | $7.60/월 | Free 70% : Pro 30% |
| LTV (Pro) | $184 | 8개월 (churn 12.5%) |
| CAC | $15~30 | Twitter/Discord |
| LTV/CAC | 6.1~12.3x | ✅ 건강 |
| Gross Margin | 75~85% | GPU + API 비용 |
| BEP | 38명 Pro | 고정비 $700/월 |

### 월간 고정비 [추정]

```
Vercel Pro:          $20
Railway (FastAPI):   $50~100
Qdrant Cloud:        $25
Supabase Pro:        $25
Redis:               $10
GPU 서버:            $200~500
CoinGecko Pro API:   $130
Coinglass API:       $50
─────────────────────
합계:                $510~860/월 (중간값 $700)
```

### Sensitivity Matrix — MRR vs Profit

| | MAU 200 | MAU 500 | MAU 1,000 |
|---|---------|---------|-----------|
| 전환율 10% | MRR $520 / -$180 | $1,300 / +$600 | $2,600 / +$1,900 |
| 전환율 20% | MRR $1,000 / +$300 | $2,500 / +$1,800 | $5,000 / +$4,300 |
| 전환율 30% | MRR $1,440 / +$740 | $3,600 / +$2,900 | $7,200 / +$6,500 |

### Free → Pro 전환 포인트

```
1. 일 3세션 소진 → DOUNI Sleep 애니메이션 + "Pro면 무제한"
2. FLEDGLING 진화 직전 → "Pro면 내일 진화 가능"
3. AutoResearch 결과 → "Pro면 주 1회 파인튜닝 + 추가 데이터"
```

### 플라이휠

```
무료 분석 (일 3회)
  → 훈련 데이터 축적 → 정확도 향상 체감
  → "더 분석하고 싶다" → Pro 전환 ($19)
  → 무제한 분석 + Skills → 모델 빠르게 성장
  → Arena 성적 향상 → Stage 진화
  → 마켓 등록 (Phase 2) → 임대 수익
  → 다른 유저 유입 → 루프 재시작
```

### Kill Criteria (수익)

| 시점 | 조건 | 액션 |
|------|------|------|
| M3 | Pro 전환율 < 5% | 무료 제한 강화 or 가격 인하 |
| M3 | Blended ARPU < $3 | 크레딧 폐기, 순수 구독 |
| M6 | MRR < $1,000 | Pivot or Kill |
| M6 | Pro churn > 20%/월 | 가치 재설계 |

### 가장 취약한 가정 3개

```
1. Pro 전환율 20~30% [추정] — 현실적 base case는 10%
2. Churn 12.5%/월 [추정] — Bear market 시 20%+ 가능
3. 파인튜닝 원가 $0.30~0.80 [추정] — 동시 요청 스케일링 미산정
```

---

## C. 설계문서 v3에 아직 빠진 것 (남은 작업)

| 항목 | 상태 | 우선순위 |
|------|------|----------|
| NSM + Input Metrics | ✅ 이 문서 | — |
| 수익 모델 + Unit Economics | ✅ 이 문서 | — |
| 페르소나 통합 (3→1) | ❌ 미결정 | 🔴 |
| DOUNI 상태 벌칙→보너스 전환 | ❌ 미수정 | 🟡 |
| 타임라인 현실화 (14→20주) | ❌ 미수정 | 🟡 |
| 시나리오 수 (50→200+) | ❌ 미수정 | 🟡 |
| Skills MCP 존재 확인 | ❌ 미확인 | 🟡 |
