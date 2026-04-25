# Cogochi AutoResearch — Per-User Fine-Tuning Pipeline

## 프로젝트 한 줄 요약

유저의 트레이딩 패턴 피드백(✓/✗)을 수집하고, per-user LoRA 파인튜닝으로 패턴 인식 성능을 자동 개선하는 파이프라인.

## 왜 만드는가

- 크립토 트레이더는 각자 고유한 패턴(CVD 다이버전스, 펀딩비 과열 등)으로 매매
- 기존 도구(TradingView, 3Commas)는 패턴을 "기억"하지 못하고, 개인화 학습 없음
- FinGPT 등 금융 LLM은 범용 모델만 — **실제 모델 weight를 유저별로 업데이트**하는 크립토 트레이딩 서비스는 상용화 0건 (§시장조사 참조)
- OPPU (EMNLP 2024)가 per-user LoRA의 학술적 유효성을 검증함
- 이 파이프라인이 작동하면 → Cogochi 제품의 핵심 엔진이 되고, 독립 API(인프라)로도 제공 가능

## 시장조사 결과 (2026-04-18)

### Cogochi 코어 4동사 중 3동사는 commodity

| 동사 | 상용화 현황 | 대표 경쟁자 |
|---|---|---|
| Scan (24/7 패턴 감지) | 완전 상용화 | Altrady, ChartScout, Cryptolume, Tickeron |
| Chat (AI와 차트 대화) | 완전 상용화 | ChatGPT, Bitget GetAgent, PAAL AI |
| Judge (✓/✗ 피드백) | 부분 상용화 | Cryptohopper marketplace (소셜 평가) |
| **Train (per-user LoRA 파인튜닝)** | **상용화 0건** | — |
| Deploy (자동 롤백 게이트) | 일반화됨 | CI/CD 표준 |

**결론:** Cogochi의 USP는 오직 **Train**에 걸려있음. 다른 3동사는 차별화 요소 아님.

### "가짜 개인화" vs "진짜 개인화" — 시장은 이미 혼동 상태

**Bitget GetAgent (2025-07 런칭, 25,000명 beta 대기)**:
- 마케팅: "closed-loop feedback system으로 유저 행동에 지속 적응, 사용할수록 정확해짐"
- 실제: **프롬프트에 유저 portfolio/history를 context로 주입.** 모델 weight는 그대로.
- 분류: context injection 개인화

**PAAL AI, Bitsgap AI Assistant, Gainium Max Gain AI 등**:
- 마케팅: "personalized" / "learns from you" / "adapts over time"
- 실제: RAG + 프롬프트 개인화. per-user 모델 학습 증거 없음
- 분류: context injection 개인화

**Cogochi가 하려는 것:**
- 유저 피드백 20개 → KTO + LoRA 파인튜닝 → 실제 모델 weight 업데이트 → hot swap
- 분류: **진짜 모델 수준 개인화**

### 학술 선행 연구는 있지만 트레이딩 도메인 상용화 0

- OPPU (EMNLP 2024): per-user LoRA 검증, 근데 **언어 태스크 (리뷰, 이메일 요약)**
- Per-Pcs (EMNLP 2024): LoRA 조각 조합, **범용 personalization**
- FinLoRA (arXiv 2505.19819): LoRA로 금융 태스크 36% 향상, 근데 **CFA 시험/XBRL 분석**
- Decision Transformer + LoRA (arXiv 2411.17900): offline RL 퀀트, **DJIA 29종목 통합 모델**

**"유저 피드백 → per-user 어댑터 → hot swap"을 크립토 트레이딩에 적용한 상용/오픈소스 사례 검색 범위 내 0건.**

### 함의

1. **기술 조합 자체는 진짜 unique** — Cogochi가 상용화 첫 시도라는 주장은 근거 있음
2. **시장은 이미 "개인화" 마케팅에 둔감** — GetAgent 같은 context 개인화를 "personalized AI"로 팔고 있음. Cogochi의 "진짜 개인화"를 유저가 체감할 수 있어야 함
3. **H1이 증명되면 Cogochi는 "개인화 마케팅이 공허한 시장에서 유일한 실제 개인화 서비스"로 포지셔닝 가능**
4. **H1이 실패하면 Cogochi도 결국 context 개인화로 후퇴 = 기존 경쟁자와 구분 불가**

### 주의할 직접 경쟁자 (H1 성공 시에도 모니터링)

- **Bitget GetAgent** — 거래소 네이티브, 유저베이스 수백만, context 개인화에서 모델 개인화로 넘어갈 가능성
- **Capitalise.ai** (Kraken 2025-08 인수) — 자연어 전략 자동화, Kraken Pro 통합 중
- **Carrotfunding** (2026-01 live) — prop trading verifiable compute, 도메인 인접

## 현재 상태

- 설계문서 v5 완료 (Cogochi_MasterDesign_v5_FINAL.md)
- 기존 코드: 48팩터 엔진, ORPO pair builder, Binance WS, LLM 서비스 연동
- 구현: 0% — 이 파이프라인이 첫 번째 빌드

## 증명해야 할 것 (H1)

> "유저 피드백 20개 → LoRA 파인튜닝 1회 → 패턴 적중률 +5%p 이상"

이 숫자가 나오면 사업 가설 성립. 안 나오면 재설계.

**H1의 의미 (2026-04-18 시장조사 반영):**

- 기술적: OPPU/Per-Pcs를 크립토 트레이딩에 처음 적용, 학술 contribution 가능
- 사업적: "진짜 모델 개인화 vs 가짜 개인화 (context 주입)"의 차이를 데이터로 증명 → 기존 경쟁자 마케팅 반박 가능
- 실패 시: context 개인화 수준으로 후퇴 → GetAgent/PAAL AI와 기술적 차별화 사라짐 → 제품 재설계

## 기술 스택

```
Language:     Python 3.12
LLM Base:     Qwen2.5-1.5B
Fine-tuning:  trl (KTOTrainer, ORPOTrainer, DPOTrainer) + peft (LoRA)
Data:         Supabase (PostgreSQL)
Cache:        Redis (optional, phase 2)
Scanner:      APScheduler + Binance API
Alerts:       Telegram Bot API
Compute:      Computalot (free credits) or Together.ai ($0.48/1M tokens)
Local:        mlx-lm (Apple Silicon) or transformers+peft (CUDA)
```

## 디렉토리 구조

```
cogochi-autoresearch/
├── CLAUDE.md                    # 이 파일 (프로젝트 컨텍스트)
├── PIPELINE.md                  # 구현 가이드 (Step 0~5 상세)
├── config/
│   └── patterns.json            # 유저 패턴 정의
├── scanner/
│   ├── fetcher.py               # Binance API 데이터 수집
│   ├── matcher.py               # 패턴 매칭 로직
│   └── scheduler.py             # APScheduler 15분 cron
├── feedback/
│   ├── telegram_bot.py          # Telegram 알림 + ✓/✗ 피드백 수집
│   └── auto_judge.py            # 1H 후 자동 적중 판정
├── data/
│   ├── formatter.py             # 피드백 → KTO/ORPO/DPO JSONL 변환
│   ├── scenarios.py             # FIXED_SCENARIOS 생성 (과거 데이터 기반)
│   └── scenarios/               # 생성된 시나리오 파일
├── training/
│   ├── search_loop.py           # 탐색 루프 (메인 오케스트레이터)
│   ├── train_kto.py             # KTO 학습 스크립트
│   ├── train_orpo.py            # ORPO 학습 스크립트
│   ├── train_dpo.py             # DPO 학습 스크립트
│   ├── hill_climb.py            # Phase A: 패턴 weight 힐클라이밍
│   └── computalot_submit.py     # Computalot job 제출
├── eval/
│   ├── evaluate.py              # 모델 평가 (FIXED_SCENARIOS 기준)
│   └── compare.py               # before/after 비교
├── deploy/
│   ├── adapter_swap.py          # LoRA 어댑터 교체
│   └── version_manager.py       # 모델 버전 관리
├── db/
│   ├── schema.sql               # Supabase 스키마
│   └── client.py                # DB 클라이언트
└── tests/
    ├── test_matcher.py
    ├── test_formatter.py
    └── test_evaluate.py
```

## 빌드 순서 (의존성 기준)

```
Step 0: db/schema.sql → db/client.py
Step 1a: config/patterns.json (수동)
Step 1b: scanner/fetcher.py → scanner/matcher.py → scanner/scheduler.py
Step 1c: feedback/telegram_bot.py → feedback/auto_judge.py
Step 1d: data/scenarios.py (병렬 가능)
Step 2: data/formatter.py
Step 3a: training/hill_climb.py
Step 3b: training/train_kto.py → training/search_loop.py
Step 4: eval/evaluate.py → eval/compare.py
Step 5: deploy/adapter_swap.py → deploy/version_manager.py
```

## 핵심 원칙

1. **KTO first** — 초기에는 KTO (good/bad 단독 라벨). 쌍 매칭 불필요. Scanner ✓/✗ 그대로 사용.
2. **탐색 루프** — 방법론(KTO/ORPO/DPO) × 하이퍼파라미터를 병렬로 돌리고 val 기준 best 채택.
3. **보너스 구조** — 파인튜닝 실패해도 기존 성능 유지. 성공해야만 업그레이드.
4. **FIXED_SCENARIOS** — 과적합 방지. TRAIN 160 / VAL 40 분할.
5. **최소 비용** — Computalot 무료 크레딧 활용. 학습 1회 ~$0.07.

## 관련 논문

- OPPU: "One PEFT Per User" (EMNLP 2024) — per-user LoRA 검증
- Per-Pcs: "Personalized Pieces" (EMNLP 2024) — LoRA 조각 조합
- SFP: Paradigm — catastrophic forgetting 보존 (나중에 필요)
- FinGPT: RLSP — 시장 결과를 피드백으로 사용

## Kill Criteria (2026-04-18 재조정)

**Tier 1 — 기술 검증 실패:**
- H1 실패 (적중률 변화 없음): 패턴 품질/시나리오 재검토 후 1회 재시도. 2회 실패 시 접근 변경.
- 피드백 수집 불가 (2주 내 20개 미만): Scanner 정밀도 또는 패턴 정의 재검토.

**Tier 2 — 차별화 실패 (시장조사 반영):**
- H1 성공했지만 +5%p가 유저에게 체감 안 됨 (survey/interview): UX 재설계. "진짜 개인화"를 시각화할 방법 필요.
- 유저가 context 개인화 (GetAgent 스타일)와 모델 개인화 (Cogochi)의 차이를 구분 못 함: 교육 UX + 수치적 증명 대시보드 필요.

**Tier 3 — 시장 변화 모니터링:**
- Bitget GetAgent / PAAL AI가 per-user 모델 파인튜닝으로 넘어옴: Cogochi 기술 해자 소멸, 재검토 필요.
- Capitalise.ai (Kraken) 또는 Altrady가 LoRA 기반 개인화 추가: distribution 격차 심각, 피봇 고려.

**판정 주기:** H1 검증 후 2주 (Tier 1), 런칭 후 8주 (Tier 2), 분기별 (Tier 3).
