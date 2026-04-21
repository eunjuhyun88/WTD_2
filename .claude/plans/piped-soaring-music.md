# WTD-v2 디자인 문서 vs 현재 코드베이스 — 갭 분석

## Context
7개 디자인 문서(Final Design, architecture v1/v2, AI Researcher, cogochi-v7, Grants, unified-design)에 명시된 전체 비전과 현재 wtd-v2 코드베이스(app + engine)의 실제 구현 상태를 비교하여 갭을 식별.

---

## 현재 구현 완료 (✅)

| 레이어 | 구현 상태 |
|---|---|
| **L0 Data** | Binance OHLCV 캐시 (109MB), 30심볼×6년, 1h 바 |
| **L1 Features** | 28개 피처 (past-only), feature_calc.py 34K LOC |
| **L1 Blocks** | 29개 빌딩블록 (entry 8, trigger 6, confirm 12, disqualify 3) |
| **L2 LightGBM** | 학습/추론/walk-forward CV, triple-barrier 라벨, AUC 0.55 |
| **L2 Regime** | BTC 30d slope + ATR → bull/bear/chop |
| **Backtest** | 시뮬레이터 + 포트폴리오 + 메트릭 (Sharpe, MDD, PF 등) |
| **API Bridge** | FastAPI `/score` → klines+perp → snapshot+p_win+blocks |
| **App Proxy** | SvelteKit `/api/engine/[...path]` → FastAPI 프록시 |
| **Auth** | 월렛 7종 (MetaMask, Phantom, WalletConnect 등) + 이메일 |
| **DB** | Supabase PostgreSQL, 12개 마이그레이션 |
| **UI Pages** | `/` `/terminal` `/lab` `/dashboard` `/settings` |
| **Data Sources** | 10+ 외부 API (CoinGecko, Coinalyze, FearGreed 등) |
| **Tests** | 엔진 302+ 테스트, mypy 통과 |

---

## 갭 분석 — 디자인에 있으나 미구현 (❌)

### 🔴 Critical (제품 가치 직결)

| # | 갭 | 디자인 출처 | 상세 | 난이도 |
|---|---|---|---|---|
| **G1** | **앙상블 필터** | v7, Final Design | ML prob > threshold AND blocks 동시 발화 → ensemble_signal. 현재 `/score`가 p_win과 blocks를 따로 반환만 하고 결합 로직 없음 | **소** |
| **G2** | **앱↔엔진 실시간 연동** | v7, unified | Terminal에서 `/score` 호출하여 p_win + blocks 시각화. 현재 프록시만 있고 Terminal UI에서 실제 호출/표시 안 함 | **중** |
| **G3** | **실시간 스캐너** | v7, v2, Final | APScheduler 1h cron, 1000코인 병렬 스캔 → alert. 현재 수동 호출만 가능, 백그라운드 스캐너 없음 | **대** |
| **G4** | **Alert/Notification** | v7, unified | Telegram bot (인라인 피드백), FCM, Discord. 스키마만 있고 실제 발송 로직 없음 | **중** |
| **G5** | **Auto Verdict** | v7, unified | +1% = HIT, -1% = MISS 자동 판정. 현재 수동 피드백만 | **소** |

### 🟡 Important (경쟁력/PMF)

| # | 갭 | 디자인 출처 | 상세 | 난이도 |
|---|---|---|---|---|
| **G6** | **Similarity Search** | v2, AI Researcher | Cosine/KNN 유사 패턴 검색 (top-k historical cases). 현재 LightGBM만 있고 similarity engine 없음 | **중** |
| **G7** | **Pattern Refinement Strategies** | v2, v7 | FeatureOutlier, TreeImportance, CosineSimilarity, ShapeMatch(DTW) — 경쟁 토너먼트. 현재 없음 | **대** |
| **G8** | **Hill Climbing 최적화** | Final, AI Researcher | trade_log → weight optimization (gradient-free). trainer.py에 walk-forward는 있으나 HC 없음 | **중** |
| **G9** | **실시간 OI/CVD 데이터** | v2, Final | CoinGlass API 실시간 연동. 현재 perp 데이터는 프론트에서 프록시하지만 실제 CoinGlass 직접 연동 미완 | **중** |
| **G10** | **Execution Agent (L4)** | Final, AI Researcher | Binance Testnet 자동 주문, 포지션 사이징 (1% rule), -3% daily halt. 코드 없음 | **대** |
| **G11** | **Free/Pro 티어 게이팅** | v7, unified | Free: 3패턴/5심볼/3세션. Pro: 무제한. 스키마에 tier 있으나 실제 게이팅 로직 없음 | **중** |

### 🟢 Phase 2+ (디퍼 가능)

| # | 갭 | 디자인 출처 | 상세 | 난이도 |
|---|---|---|---|---|
| **G12** | **DOUNI 캐릭터 시스템** | v7, unified | 7 애니메이션 상태, 에너지/신뢰/집중/무드 보너스. Pixi.js 준비됐으나 캐릭터 로직 미구현 | **대** |
| **G13** | **Per-user LoRA** | v7, AI Researcher | KTO → ORPO/DPO → LoRA 파인튜닝. 학습 코드 일부 있으나 배포 파이프라인 없음 | **대** |
| **G14** | **Adapter Marketplace** | unified | 어댑터 렌탈 + 15% take-rate. 스키마만 존재 | **대** |
| **G15** | **Battle Arena** | unified | ERA 매치업, 아키타입 대결. 미구현 | **대** |
| **G16** | **Multi-timeframe** | v2, v1 | 15m/4h/1d 지원. 현재 1h 전용 | **중** |
| **G17** | **Event Detection** | v2 | 덤프 트리거(-10%/4h), OI 스파이크(+40%), 청산 볼륨. 없음 | **중** |

### 🔵 인프라/품질

| # | 갭 | 상세 |
|---|---|---|
| **G18** | **프론트엔드 테스트** | 엔진 302+, 앱 0개. E2E 프레임워크 미설정 |
| **G19** | **Preregistration/Graveyard** | v1에 명시된 가설 등록 + 실패 로그. 코드 없음 |
| **G20** | **Bonferroni Correction** | k=20 다중 비교 보정. 수동 분석만 |

---

## 우선순위 로드맵 제안

### Phase 0: 즉시 (이번 세션)
1. **G1 앙상블 필터** — engine `/score` 응답에 `ensemble_signal` 추가
2. **G5 Auto Verdict** — +1%/-1% 자동 판정 로직

### Phase 1: 이번 주
3. **G2 앱↔엔진 연동** — Terminal에서 p_win + blocks + ensemble 시각화
4. **G4 Telegram Alert** — 시그널 발생 시 Telegram 발송

### Phase 2: 다음 주
5. **G3 실시간 스캐너** — APScheduler 백그라운드 + DB 저장
6. **G9 CoinGlass 실시간** — OI/CVD 직접 연동
7. **G11 Free/Pro 게이팅** — 패턴/심볼/세션 제한

### Phase 3: M2
8. **G6 Similarity Search** — feature space cosine + KNN
9. **G8 Hill Climbing** — trade_log 기반 weight 최적화
10. **G10 Execution Agent** — Binance Testnet 자동 주문

### Phase 4+: Deferred
- G7 (Refinement Strategies), G12-G17 (캐릭터, LoRA, 마켓플레이스, 배틀)
