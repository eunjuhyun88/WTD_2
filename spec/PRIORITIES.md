# Cogochi — Master PRD + Priority Document

> **Single source of truth**: docs/live/W-0220-product-prd-master.md + feature-implementation-map.md v3.0 + Wave 4 work items
> **Updated**: 2026-04-27 | Base SHA: 6d7de4fe
> Charter: `spec/CHARTER.md` In-Scope(L3–L7) 안에만. Non-Goal 진입 금지.

---

## Vision

**Cogochi = "Pattern Research OS"**: 트레이더가 자연어/드래그로 패턴을 가리키면 시스템이 PatternObject로 외화해서 53패턴 × 92블록 카탈로그에 합류시키고, 12개 백그라운드 잡이 시장 전체에서 자동으로 매칭·검증·학습을 돌린다.

- **핵심 차별점**: on-demand search + verdict-validated archive (broadcasting 채널 모방 아님)
- **단일 페르소나 "Jin"**: 28-38세, 크립토 perp 전업/반전업, WTP $29-79/mo
- **Core Loop**: `[Input 3-mode] → Resolve → Search → Watch → Verdict → Refinement → [Monetize]`

---

## Architecture Reality (L1~L7 코드 실측)

| Layer | 상태 | 비고 |
|---|---|---|
| L1 Market Data | ✅ | 27 modules, Binance/Bybit/Coinbase/OKX |
| L2 Feature Window | ✅ | migration 021, 40+ col, 138,915 rows backfill |
| L3 Pattern Object | ✅✅ | **53 PatternObjects × 92 Building Blocks** |
| L4 State Machine | ✅ | SQLite WAL + Supabase dual-write |
| L5 Search | ✅ | 3-layer blend (Layer A 0.45 / B LCS 0.30 / C LightGBM 0.25) |
| L6 Ledger | 🟡 | 1-table 운영, 5-cat verdict 미구현 |
| L7 AutoResearch | ✅/❌ | Phase A+B ✅, Phase C+D ❌ (GPU 필요) |

**Scheduler 11 jobs** (APScheduler): universe_scan 15m / pattern_scan / auto_evaluate 1h / outcome_resolver 1h / refinement_trigger daily + 6 more.

---

## Wave Completion

### ✅ Wave 1 — 완료 (PR #370~#373)

F-02(5-cat verdict) / A-03-eng(AI Parser engine) / A-04-eng(Chart Drag engine) / D-03-eng(Watch engine)

### ✅ Wave 2 — 완료 (PR #377~#392)

H-07(F-60 gate) / A-03-app(AI Parser UI) / A-04-app(Chart Drag UI) / D-03-app(Watch UI) / H-08(per-user stats) / F-17(Intent Router) / F-30(Ledger 4-table) / L-3(recall verify)

### ✅ Wave 3 — 완료

H-08 / F-30 / F-17 Wave 2 내 병렬 완료.

---

## P0 — MM Hunter (현재)

| Work Item | Feature | 상태 |
|---|---|---|
| W-0214 | MM Hunter design D1~D8 LOCKED-IN | ✅ main (#396) |
| W-0215 | `pattern_search.py` audit (V-00) | 🟡 즉시 시작 가능 |
| W-0216 | `validation/` 모듈 구현 | ⬜ W-0215 후 |

---

## P1 — Wave 4 (다음)

| Work Item | Feature | Owner | 선행 |
|---|---|---|---|
| W-0241 | A-03-eng: `POST /patterns/parse` (AI Parser) | engine | — |
| W-0242 | A-04-eng: `POST /patterns/draft-from-range` (Chart Drag) | engine | — |
| W-0233 | F-3: Telegram alert → 1-click Verdict deep link | infra+L7 | — |
| W-0234 | F-4: 5-card Decision HUD | app | — |
| W-0235 | F-5/F-6: IDE split-pane (Observe/Analyze/Execute) | app | — |
| W-0243 | F-5: IDE split-pane CSS Grid + resizable | app | — |
| W-0244 | F-7: meta 자동화 (CURRENT.md hook + worktree cron) | meta | — |
| W-0236 | F-12: DESIGN_V3.1 features (kimchi/session/oi_norm) | engine | — |
| W-0237 | F-13: Telegram Bot 연결 UI (6자리 코드) | app | — |
| W-0245 | F-14: PatternObject lifecycle (Draft→Candidate→Object) | engine+app | A-03-eng |
| W-0246 | F-15: PersonalVariant runtime threshold override | engine | — |
| W-0247 | F-16: search recall@10 ≥ 0.7 검증 | engine | — |
| W-0238 | F-18: Stripe + tier enforcement + rate limit | app | — |
| W-0248 | F-18: Stripe $29/mo + migration 028 | app | — |
| W-0239 | F-19: Sentry + observability (p95 / error / cost/WAA) | infra | — |
| W-0249 | F-19: observability dashboard | infra | — |
| W-0240 | F-11: Dashboard WATCHING + Candidate Review UI | app | — |
| W-0250 | F-20~22: Vercel guardrail + GCP Cloud Build | infra | — |

---

## P2 — M6 출시

| # | 항목 |
|---|---|
| F-31 | LightGBM Reranker 1차 학습 (verdict 50+) NDCG@5 +0.05 |
| F-32 | Capture duplicate detection |
| F-33 | Negative set curation (hard_negative / near_miss / fake_hit) |
| F-34 | Isotonic calibration |
| F-35 | Regime-conditioned stats (bull/bear/range) |
| F-36 | Push/Telegram alerts 정밀화 |
| F-37 | Personal stats panel + X 공유 |
| F-38 | Pattern decay monitor |
| F-39 | Screener Sprint 2 (Twitter API + 섹터 LLM + 이벤트 크롤러) |

---

## P3 — Phase 2+

| # | 항목 | 선행 |
|---|---|---|
| F-50 | LLM Judge (Stage 4 advisory) | reranker 안정 |
| F-51 | Chart Interpreter (multimodal) | F-50 |
| F-52 | Auto-Discovery agent (새 패턴 후보 제안) | verdict 1000+ |
| F-55 | LambdaRank reranker | verdict 200+ |
| F-56 | Pattern Wiki 본격화 | Phase 2 |
| F-57 | Semantic RAG (pgvector + news) | F-50 |
| F-59 | ORPO/DPO Phase C + per-user LoRA Phase D | GPU + 500+ samples |
| **F-60** | **카피시그널 Phase 1** — kol_style_engine.py 캡션 + 알림 구독 | verdict 200+ × 5 |
| **F-61** | **카피시그널 Phase 2** — revenue share marketplace | F-60 + KYC |

---

## 확정된 결정 (D/Q)

| # | 결정 |
|---|---|
| D1 | Pricing **$29/mo Pro** |
| D2 | NSM = **WVPL per user** (Weekly Verified Pattern Loops) |
| D3 | Persona = **Jin** (28-38세 perp 전업/반전업) |
| D5 | Layout = **IDE split-pane** (free-form canvas 폐기) |
| D6 | L6 **1-table 유지** (P2 4-table 분리) |
| D7 | L3 **file-first** 유지 (53패턴 file 등록 OK) |
| D8 | 5-cat verdict **P0 즉시** (reranker 라벨 = moat) |
| D11 | Mental model = **Forward search tool** (복기 저널 아님) |
| D12 | 카피시그널 = **F-60 gate** (verdict 200+ × 5 패턴 후) |
| D13 | AI Parser = **P0 입구 #1** |
| D15 | Telegram alert → verdict = **P0 1-click 링크** |
| Q1 | missed vs too_late = **분리** |
| Q3 | Chart Drag = **실제 드래그 UI** |
| Q4 | AI Parser 입력 = **자유 텍스트** |
| Q5 | AI Parser 모델 = **claude-sonnet-4-6** |

---

## Success Metrics

| Metric | Target |
|---|---|
| **NSM** WVPL per user | M1: 2 / M3: 3 / M6: 4 / M12: 5 |
| Search hit@5 | M3: 55% / M6: 70% |
| Parser schema compliance | ≥ 95% |
| Revenue MRR | M3: $1K / M6: $15K / M12: $80K |
| Infra cost/WAA | < $8 |
| p95 latency | < 2s |
| Error rate | < 0.5% |

**Kill switch**: M3 WVPL < 1.0 → 재설계 / M6 총 < 1500 WAA → positioning kill.

---

## Frozen / Non-Goals

- ❌ Copy Trading (대중형 소셜/카피) — W-0132 영구 폐기
- ❌ Chart UX polish / TradingView feature parity
- ❌ MemKraft / Multi-Agent OS 추가 개발
- ❌ AI 차트 분석 툴 / 범용 스크리너 / 자동매매 실행
- ❌ Broadcasting-only 시그널 채널 모방 (Alpha Hunter 방식)
- ❌ 자유 텍스트 LLM chat (AI Parser 외)
- ❌ 모바일 native 앱 (PWA 우선, Phase 2+)
- ❌ Portfolio P&L / social comments / paper trading / options / price prediction
