# W-0220 — 전체 작업 체크리스트

> 범례: `[x]` 완료 / `[~]` 부분 / `[ ]` 미완료 / `[!]` 차단·결정 필요
> Source: W-0220 PRD v2.2 + feature-implementation-map.md v3.0 + 코드 실측 (3ce9cf5d)
> Updated: 2026-04-26

---

## 🚦 의사결정 (lock-in 필요)

### D — 제품 방향 (15)

- [ ] **D1** Pricing $29/mo Pro
- [ ] **D2** NSM = WVPL per user
- [ ] **D3** Persona = Jin (단일)
- [ ] **D4** Decision HUD 5-card
- [ ] **D5** IDE split-pane (free-form canvas 폐기)
- [ ] **D6** L6 1-table 유지 (4-table 분리 P2)
- [ ] **D7** L3 file-first 유지 (DB-first 보류)
- [x] **D8** 5-cat verdict 즉시 P0 (lock-in 2026-04-26 W-0223)
- [ ] **D9** Wiki = L7 ledger-driven job
- [ ] **D10** DESIGN_V3.1 features 즉시 P1
- [ ] **D11** Forward search tool (복기 X)
- [ ] **D12** 카피시그널 = F-60 gate 후
- [ ] **D13** AI Parser P0 입구 #1
- [ ] **D14** Chart drag + AI Parser 둘 다 P0
- [ ] **D15** Telegram alert → 1-click verdict deep link

### Q — 개발 전 확정 (5)

- [x] **Q1** missed vs too_late: **분리** (lock-in 2026-04-26 W-0223 — 학습 노이즈 다름)
- [ ] **Q2** F-60 accuracy threshold: **0.55** (권고, 90일 후 조정)
- [x] **Q3** Drag UI: **실제 드래그** (lock-in 2026-04-26 W-0223 — form fallback)
- [x] **Q4** Parser 입력: **자유 텍스트** (lock-in 2026-04-26 W-0223 — telegram refs 4채널 기반)
- [x] **Q5** Parser 모델: **claude-sonnet-4-6** (lock-in 2026-04-26 W-0223 — function calling)

---

## 🟥 P0 (7주, 4-5주 동시작업 시) — 입구 + 라벨 + 결과보고

### F-0a Chart Drag → PatternDraft (A-04)
- [ ] **A-04-eng** `POST /patterns/draft-from-range` — 12 features 추출 (oi_change, funding, cvd, liq_volume, price, volume, btc_corr, higher_lows, lower_highs, compression, smart_money, venue_div) [M]
- [x] **A-04-app** UI — anchor click → DraftFromRangePanel → form prefill (SaveSetupModal full integration follow-up) [S-M, **80% 재사용**] — spec: W-0230 §A-04-app

### F-0b AI Parser (A-03)
- [ ] **A-03-eng** `POST /patterns/parse` — ContextAssembler → Claude Sonnet → PatternDraftBody. **스키마/Assembler/downstream 이미 있음** [M, 3-4일]
- [x] **A-03-app** UI — AIParserModal (자유 텍스트 → Sonnet 4.6 → DraftPreview → 저장) [M] — spec: W-0230 §A-03-app

### F-1 5-cat Verdict (F-02)
- [ ] **F-02** `engine/ledger/types.py:54` + `captures.py:66` + `verdict.py`. AC: 5값 200 / 기존 3값 호환 [S, Q1 결정 후] — engine MERGED PR #370 (1cfac2e3), F-02-app pending
- [x] **F-02-app** UI — VerdictInboxPanel `.card-actions` 3 → 5 button (too_late/unclear 추가) [S, 단일 파일] — spec: W-0230 §F-02-app
- [ ] **L-04** Verdict Inbox 5-cat 버튼 UI 추가 (= F-02-app과 동일, 중복 항목)
- [ ] **F-2-test** end-to-end: UI submit → DB → stats → wiki → refinement 통합 테스트

### F-2 Search Result List + 1-click Watch (D-03)
- [ ] **D-03-eng** `POST /captures/{id}/watch` — monitoring row 생성, idempotent [M]
- [x] **D-03-app** Watch corner toggle (VerdictInboxPanel) [S] — spec: W-0230 §D-03-app
- [ ] **F-2-list** Search result top 10~20 + similarity score + 차트 미리보기 + 1-click Watch UX

### F-3 Telegram → Verdict deep link
- [ ] alert message에 signed deep link 추가 (72h TTL)
- [ ] 알림 클릭 → 자동 로그인 → verdict 30s 내 제출 가능

### F-4 Decision HUD 5-card
- [ ] Pattern Status card
- [ ] Top Evidence (3개)
- [ ] Risk (2-3)
- [ ] Next Transition
- [ ] Actions

### F-5 IDE-style split-pane
- [ ] Observe mode
- [ ] Analyze mode (default)
- [ ] Execute mode
- [ ] Resizable pane (메인 70% / HUD 20% / Workspace 30%)

### F-7 메타 자동화
- [ ] CURRENT.md SHA post-merge hook
- [ ] worktree ≤10 cron
- [ ] spec/PRIORITIES.md 자동 동기화

---

## 🟧 P1 (M3 출시 전)

### F-10 Stats Engine 보강 (대부분 BUILT)
- [x] H-01 PatternStats Engine 5-min TTL — `engine/stats/engine.py` (8.8KB)
- [x] H-02/H-03 Pattern stats endpoints
- [ ] **H-08** per-user verdict accuracy 추가 [S, 1일]

### F-11 Dashboard WATCHING + Pattern Candidate Review
- [ ] WATCHING 섹션 풀 구현 (현재 BTC/ETH 2-item 정적 placeholder)
- [ ] Pattern Candidate Review UI (`/patterns/candidates` API는 BUILT)

### F-12 DESIGN_V3.1 features
- [ ] kimchi_premium feature 등록
- [ ] session_apac / session_us / session_eu
- [ ] oi_normalized_cvd

### F-13 Telegram Bot 연결 UI
- [ ] 6자리 코드 인증 플로우
- [ ] 알림 라우팅 설정 UI

### F-14 PatternObject lifecycle (Draft → Candidate → Object)
- [x] PatternDraft 스키마 — `engine/api/schemas_pattern_draft.py`
- [x] `/patterns/candidates` API
- [ ] Draft → Candidate 승격 UI
- [ ] Candidate review queue
- [ ] Candidate → Object promote

### F-15 PersonalVariant runtime
- [x] `engine/patterns/active_variant_registry.py` (6KB)
- [ ] 유저별 threshold override UI
- [ ] variant 생성 → A/B 추적

### F-16 Search recall 검증
- [ ] 50 query eval set 작성
- [ ] Layer A/B/C 가중 튜닝 (0.6/0.3/0.1)
- [ ] recall@10 ≥ 0.7 측정

### F-17 Visualization Intent Router (6×6)
- [ ] Intent Classifier (LLM, cheap)
- [ ] WHY → event_focus template
- [ ] STATE → state_view template
- [ ] COMPARE → compare_view template
- [ ] SEARCH → scan_grid template
- [ ] FLOW → flow_view template
- [ ] EXECUTION → execution_view template

### F-18 Auth + Stripe
- [x] O-01~O-08 wallet auth + JWT + JWKS + 블랙리스트 + 에러 노출
- [ ] tier enforcement (Free / Pro)
- [ ] Stripe 결제 연동
- [ ] rate limit per tier

### F-19 Observability
- [x] H-04 Flywheel health check
- [x] H-05 Observability metrics
- [ ] Sentry 연동
- [ ] p95 latency / error rate / cost-per-WAA 대시보드

### F-20~F-22 Infra cleanup
- [ ] App `vercel.json` 브랜치 가드레일
- [ ] Production = `release` 브랜치 분리
- [ ] GCP cogotchi-worker Cloud Build trigger
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` 프로덕션

---

## 🟨 P2 (M6 출시)

- [ ] **F-30** Ledger 4-table 분리 (entries / scores / outcomes / verdicts) + materialized view
- [ ] **F-31** LightGBM Reranker 1차 학습 (verdict 50+) NDCG@5 +0.05
  - [~] C-11 PARTIAL — `predict_one()` 있음, 미훈련 시 None 반환
- [ ] **F-32** Capture duplicate detection + selection range 재호출
- [ ] **F-33** Negative set curation (hard_negative / near_miss / fake_hit)
- [ ] **F-34** Isotonic calibration
- [ ] **F-35** Regime-conditioned stats (bull/bear/range)
- [ ] **F-36** Push/Telegram alerts 정밀화
- [ ] **F-37** Personal stats panel + Telegram/X 공유
- [ ] **F-38** Pattern decay monitor
- [ ] **F-39** Screener Sprint 2 (20% 결손)
  - [ ] Twitter API 7%
  - [ ] 섹터 LLM 5%
  - [ ] 호재·이벤트 크롤러 4%
  - [ ] 봇 활동 2%
  - [ ] 아스터 2%

---

## 🟦 P3 (Phase 2+)

- [ ] **F-50** LLM Judge Stage 4 (advisory only)
- [ ] **F-51** Chart Interpreter (multimodal)
- [ ] **F-52** Auto-Discovery agent (verdict 1000+ 후)
- [ ] **F-53** Multi-TF search + benchmark pack
- [ ] **F-54** Team workspace + shared library
- [ ] **F-55** LambdaRank 학습 reranker (verdict 200+)
- [ ] **F-56** Pattern Wiki engine/wiki/ 본격화
- [ ] **F-57** Semantic RAG (pgvector + news)
- [ ] **F-58** Native mobile (PWA 우선)
- [ ] **F-59** ORPO/DPO Phase C + per-user LoRA Phase D (GPU + 500+ samples)
- [ ] **F-60** **카피시그널 Phase 1** — verdict 200+ × 5 패턴 gate, kol_style_engine.py 캡션 자동
  - [ ] **H-07** F-60 Gate `GET /users/{user_id}/f60-status` [S-M]
  - [ ] **L-05** F-60 progress bar UI
- [ ] **F-61** **카피시그널 Phase 2** — Marketplace revenue share + KYC + KOL guardrail
  - [ ] **N-05** `POST /marketplace/signals/publish` + listing + subscribe [L]
  - [ ] **N-06** Marketplace publish UI

---

## ✅ BUILT — 이미 완료된 자산 (참조용)

### L1 Market Data (33/33) ✅
- [x] OI / Funding / Liquidations / Derivatives / Snapshot / OHLCV / Depth / CVD / Funding-flip / Venue-divergence
- [x] Microstructure / Options / RV cone / Sparklines / Trending / Symbols / News / Macro / Stablecoin / Indicator
- [x] Chain intel / Onchain alerts / Influencer / Events / F&G / CoinGecko / CoinAnalyze / Etherscan / CryptoQuant
- [x] Yahoo / FRED / Macro indicators

### L2 Feature Window ✅
- [x] migration 021 (40+ col)
- [x] `engine/features/` materialization + registry + compute
- [ ] DESIGN_V3.1 patch (F-12)

### L3 Pattern Object ✅
- [x] **53 PatternObjects** (Core OI 6 / Short 3 / Alpha Terminal 7 / Alpha Flow 6 / Alpha Hunter 22 / Radar 5 / Breakout 2)
- [x] **92 Building Blocks** (Confirmations 60+ / Disqualifiers 5 / Entries 8 / Triggers 11+)
- [x] PatternRegistry + ActiveVariantRegistry
- [x] PatternDraft 스키마

### L4 State Machine ✅
- [x] `state_store.py` SQLite WAL primary
- [x] `supabase_state_sync.py` background dual-write
- [x] `state_machine.py` phase transitions
- [x] `scanner.py:49` hydrate_states() on boot
- [x] `alert_policy.py` shadow/visible/ranked/gated

### L5 Search ✅
- [x] Layer A 40+dim L1 — `engine/search/similar.py`
- [x] Layer B LCS phase path — `similarity_ranker.py`
- [~] Layer C LightGBM — 코드 BUILT, 미훈련 시 None
- [x] `quality_ledger.py` 가중치 자동 조정
- [x] Benchmark pack draft + search-from-capture

### L6 Ledger ✅
- [x] 4-type Python (entry / score / outcome / verdict / training_run / model / phase_attempt)
- [x] `pattern_ledger_records` Supabase 단일 테이블 (W-0215)
- [ ] DB 4-table 분리 (F-30, P2)

### L7 AutoResearch ✅ (Phase A+B / ❌ C+D)
- [x] Hill Climbing — `hill_climbing.py` (7KB)
- [x] LightGBM per-user — `lightgbm_engine.py` (11KB) walk-forward CV
- [x] Trainer + label_maker + ensemble
- [x] refinement_trigger 10+ verdicts + 7d gate
- [ ] Phase C ORPO/DPO (GPU)
- [ ] Phase D per-user LoRA (GPU)

### Scheduler ✅ (등록 4 jobs)
- [x] pattern_scan 15m
- [x] auto_evaluate 15m (1h ±1% 알림 품질)
- [x] outcome_resolver 1h (72h ±15%/-10% 패턴 성과)
- [x] refinement_trigger daily

### Search Engine 60 routes / App 150 routes ✅
- [x] patterns.py 24개 routes
- [x] search.py 6+ routes
- [x] alpha endpoints
- [x] runtime/captures + workspace + setups
- [x] refinement stats + suggestions + leaderboard
- [x] features + facts + macro + onchain

### Branding & Social ✅ (8/8)
- [x] PnL renderer (Pillow)
- [x] KOL caption (Claude Haiku)
- [x] Twitter auto-post
- [x] Dalkkak gainers/positions/caption/risk

### Auth ✅ (8/8)
- [x] Wallet login / Session / Nonce / Logout / RS256 JWT / 블랙리스트 / JWKS 캐싱 / 에러 노출 방지

### Profile/Passport ✅ (9/9)
- [x] Profile / Passport / Learning datasets / evals / reports / train-jobs / workers / preferences / progression

### DeFi Trading ✅ (11/11)
- [x] GMX / Polymarket / Predictions / Quick trades / Exchange connect / Unified positions / Portfolio / Wallet intel

### Pine Script & Indicators ✅ (7/7)
- [x] Pine generate / templates / cogochi / facts / confluence / features

### Infra ✅ (대부분)
- [x] SQLite WAL primary
- [x] Supabase dual-write
- [x] Feature windows 138,915 rows
- [x] PatternStats 5-min TTL cache
- [x] GCP Cloud Run cogotchi-00013-c7n
- [x] APScheduler
- [x] Pattern Wiki (engine/wiki/)
- [~] **S-08** ContextAssembler — 토큰 버짓 코드 있음, LLM 미연결 (A-03-eng에서 연결)
- [x] RAG terminal endpoints
- [x] Memory query/feedback/debug
- [x] Backtest / Screener / Universe / Opportunity / Deep / Score
- [~] **S-17** 동시 100명+ — read-heavy Supabase 라우팅 검증 필요

---

## 📊 진척률 요약

| 카테고리 | Built | Partial | Not Built | 합계 |
|---|---|---|---|---|
| L1 Market Data | 33 | 0 | 0 | 33 |
| L2 Feature Window | 5 | 0 | 4 (DESIGN_V3.1) | 9 |
| L3 Pattern Object | 7 | 0 | 0 | 7 |
| L4 State Machine | 5 | 0 | 0 | 5 |
| L5 Search | 10 | 1 (LightGBM untrained) | 0 | 11 |
| L6 Ledger | 4 | 0 | 1 (4-table split P2) | 5 |
| L7 AutoResearch | 6 | 0 | 2 (Phase C/D P3) | 8 |
| Scheduler | 4 | 0 | 0 | 4 |
| Branding | 8 | 0 | 0 | 8 |
| Auth | 8 | 0 | 0 | 8 |
| Dashboard | 4 | 1 (WATCHING placeholder) | 4 (5-cat / F-60 / Watch / Telegram connect) | 9 |
| Input modes | 5 | 0 | 4 (A-03-eng/app, A-04-eng/app) | 9 |
| Watch | 6 | 0 | 2 (D-03-eng/app) | 8 |
| Verdict | 8 | 0 | 1 (F-02 5-cat) | 9 |
| Refinement | 14 | 0 | 0 | 14 |
| Stats | 6 | 0 | 2 (H-07, H-08) | 8 |
| Marketplace | 3 | 0 | 3 (N-04/05/06) | 6 |
| Profile/DeFi/Pine | 27 | 0 | 0 | 27 |
| **합계** | **163** | **2** | **23** | **188** |

**Built ratio: 86.7%** (163/188)
**열린 작업: 23개** (P0=14 / P1=5 / P2=8 / P3=11) ← 일부 중복

---

## 🎯 즉시 다음 액션

1. [ ] D1~D15 + Q1~Q5 사용자 lock-in
2. [ ] spec/PRIORITIES.md 갱신 (F-0b/F-1/F-3 새 P0)
3. [ ] CURRENT.md main SHA 동기화 + 본 PRD 등록
4. [ ] 4 independent engine 이슈 GitHub 등록 + 병렬 시작:
   - [ ] A-03-eng AI Parser engine
   - [ ] A-04-eng Chart Drag engine
   - [ ] D-03-eng 1-click Watch engine
   - [ ] F-02 Verdict 5-cat
5. [ ] F-7 메타 자동화 (CURRENT SHA hook + worktree cron)

---

**A022 / 3ce9cf5d / 2026-04-26**
