# W-0220 — Product PRD Master (CTO + AI Researcher Edition, v3)

> **개정**: v1 (2026-04-26 오전) → v2 (2026-04-26 저녁) → v2.1/v2.2 (2026-04-26 후속) → **v3 (2026-04-28)**
> **사유**: v1은 "이미 만들어진 것"을 "갭"으로 잘못 잡았다. v2는 코드 실측 + 설계문서 9-Doc + telegram refs 4채널 분석 + flywheel-closure-design 통합으로 재작성. **v3는 Pattern Verification Lane (Paper Trading) 통합** — 검증 루프를 사람 판단(JUDGE)에서 시장 판단(Paper P&L)까지 확장.
> **저자**: A022 (CTO + AI Researcher hat)
> **Source of truth**: `engine/`(~200 .py) + `app/`(180 routes) + `~/Downloads/2222/` 캐노니컬 + `docs/live/flywheel-closure-design.md` + `docs/design/11_CTO_DATA_ARCHITECTURE_REALITY.md` + `tmp/telegram_refs/` 4채널
> **Base SHA**: 3ce9cf5d

---

## 0.3 v3 — Pattern Verification Lane (Paper Trading) 통합 (2026-04-28)

> **트리거**: 사용자 인사이트 — "그래야 맞는지 알잖아"
> **저자**: A066 (relaxed-chatelet worktree)
> **Base SHA**: 6aeafff9
> **상태**: 설계 lock-in only. 구현은 W-0254 H-07/H-08 완료 후.

### 0.3.1 핵심 재정의

WTD 검증 루프는 지금까지 **사람의 판단 (JUDGE/Verdict)** 만으로 패턴 품질을 측정해왔다. v3는 **시장의 판단 (Paper Execution P&L)** 을 ground truth 신호로 추가한다.

```
[기존 루프]   Capture → Refinement → JUDGE/Verdict (human signal)
                                           ↓
[v3 추가]                          Paper Execution → P&L (market signal)
                                           ↓
                              두 신호 비교 → 패턴 품질 진짜 검증
```

**JUDGE = "사람이 보기에 좋은 패턴" / Paper = "진짜로 먹히는 패턴"** — 두 신호의 일치/불일치 자체가 학습 라벨이 된다 (e.g. "JUDGE valid인데 paper P&L 음수" = false-positive 패턴 후보).

### 0.3.2 Minara Strategy Studio와의 차이 (Frozen 보호)

| 축 | Minara | WTD v3 Pattern Verification |
|---|---|---|
| 코어 가치 | 자동매매 실행 | **패턴 품질 검증** |
| 자금 | 실자금 perp 선물 | **paper only** (실자금 X) |
| 변환 흐름 | 전략 → 자동 swap | 패턴 → 시그널 카드 → 시뮬 체결 → P&L |
| 사용자 | 자동매매 트레이더 | 패턴 리서처/MM 헌터 |
| Frozen 관계 | — | W-0132 copy trading **별 surface 격리** (engine/copy_trading 미접근) |

**격리 원칙**:
- 신규 코드는 `engine/verification/` (신설), `app/routes/paper/` (신설)에만 위치
- 기존 `engine/copy_trading/` (Frozen) 코드 import/수정 금지
- spec/CHARTER.md §Non-Goals 항목은 그대로 — **paper trading은 검증 도구이지 실행 도구가 아니다**

### 0.3.3 4-Phase Roadmap

| Phase | 기능 | 산출물 | 실자금 위험 |
|---|---|---|---|
| **P1: Signal Card** | 패턴 → entry/exit/stop 제안 카드 (체결 X) | UI 카드 + 제안 JSON spec | 0 (제안만) |
| **P2: Backtest Engine** | corpus seed-search × 과거 hit rate / Sharpe | `/verification/backtest` API | 0 (과거 데이터) |
| **P3: Paper Execution** | live 시뮬 체결 + 슬리피지/수수료 모델 + P&L 곡선 + 포트폴리오 추적 | `engine/verification/paper_executor.py` + UI 대시보드 | 0 (시뮬) |
| **P4: Mode 비교** | 수동 vs AI 자동 vs rule-based archetype 변환 hit rate 비교 | A/B/C mode 메트릭 + 라벨 대시보드 | 0 |

각 phase는 독립 머지 가능. P1만 머지해도 가치 있음 (패턴 카드의 actionable 표현 추가).

### 0.3.4 패턴 → 실행 변환 (3-mode 비교)

사용자 결정: **3-mode 다 구현 후 비교**. mode 자체가 데이터.

| Mode | 변환 주체 | 입력 | 학습 가치 |
|---|---|---|---|
| **A: Manual** | 사용자가 직접 entry/exit/stop 입력 | 패턴 카드 + 사용자 판단 | 사용자 mental model 캡처 |
| **B: AI Auto** | LLM이 패턴 spec → 노드 자동 생성 | PatternObject + LLM (Sonnet 4.5) | AI 변환 품질 측정 |
| **C: Rule-based** | archetype A-J별 디폴트 룰 적용 | PatternObject.archetype + 파라미터 | 기준선 (baseline) |

3-mode P&L 비교 → "AI 변환이 사용자 변환보다 나은가" / "rule-based가 그냥 충분한가" 검증.

### 0.3.5 신규 lane 등록

| 이슈 ID | 기능 | Effort | 선행 | F-매핑 |
|---|---|---|---|---|
| **V-PV-01** | `engine/verification/` 모듈 scaffold + paper_executor 인터페이스 | M | W-0254 H-07/H-08 | 신규 F-VERIFY |
| **V-PV-02** | Signal Card UI (패턴 → entry/exit/stop 카드) | M | V-PV-01 | F-VERIFY-P1 |
| **V-PV-03** | Backtest engine `POST /verification/backtest` | L | V-PV-01 | F-VERIFY-P2 |
| **V-PV-04** | Paper executor (시뮬 체결 + P&L 추적) | L | V-PV-03 | F-VERIFY-P3 |
| **V-PV-05** | Mode A/B/C 변환기 + 비교 메트릭 | L | V-PV-04 | F-VERIFY-P4 |
| **V-PV-06** | JUDGE × Paper 신호 비교 라벨 export (refinement 학습용) | M | V-PV-04, F-02 | F-VERIFY-LOOP |

총 6 이슈. **W-0254 (H-07/H-08) 머지 후 V-PV-01 시작**. V-PV-06이 기존 refinement loop와 닫히는 지점 — paper P&L이 새 학습 라벨이 됨.

### 0.3.6 Open Questions (구현 전 결정)

| # | 질문 | 영향 이슈 | 권고 |
|---|---|---|---|
| **PV-Q1** | 슬리피지 모델 — 고정 bps vs orderbook depth 시뮬? | V-PV-04 | **고정 bps 시작** (10 bps), depth 시뮬은 P5 |
| **PV-Q2** | 수수료 — perp 선물 maker/taker 분리 vs 단일 평균? | V-PV-04 | **maker 0.02% / taker 0.05%** Bybit 기준 |
| **PV-Q3** | 포지션 사이즈 — fixed notional vs Kelly vs 사용자 설정? | V-PV-04 | **사용자 설정** + 기본값 1000 USDT notional |
| **PV-Q4** | Mode A/B/C 비교 horizon — 7d / 30d / 패턴별? | V-PV-05 | **패턴별** (PatternObject.expected_horizon) |
| **PV-Q5** | JUDGE × Paper 불일치 시 어느 신호 우선? | V-PV-06 | **둘 다 라벨로 보존** (라벨 차원 추가, 우선순위 X) |

### 0.3.7 Success Metrics (v3 한정)

- **Phase 1 KPI**: 시그널 카드 본 사용자 중 entry/exit 직접 정의해본 비율 ≥ 30% (engagement)
- **Phase 2 KPI**: 백테스트 hit rate가 corpus seed-search hit rate와 ±5%p 일치 (validity)
- **Phase 3 KPI**: paper P&L과 JUDGE valid 비율 상관계수 ≥ 0.5 (signal alignment)
- **Phase 4 KPI**: Mode B (AI auto) P&L이 Mode A (manual) 대비 -5%p 이내 (AI 신뢰성)

### 0.3.8 v3가 v2.2와 다른 점

| v2.2 범위 | v3 추가 |
|---|---|
| F-60 monetize gate (verdict 200건 + accuracy 0.55) | + paper P&L Sharpe 가중 (검증 신호 다양화) |
| Verdict 5-cat (사람 라벨) | + Paper outcome 라벨 (시장 라벨) → refinement 학습 입력 2배 |
| N-05 Copy Signal Marketplace | paper-verified 시그널만 marketplace 진입 가능 (품질 게이트) |
| Pattern → 카드 (시각화 끝) | Pattern → 카드 → 시그널 → 시뮬 체결 → P&L (actionable 끝까지) |

→ v3 = "**검증 루프의 닫힘**". 기존 v2.2가 "사람이 패턴 보고 평가"였다면, v3는 "패턴이 진짜 시장에서 먹히는지 시뮬로 확인" 까지 확장.

---

## 0.2 v2.2 — feature-implementation-map.md v3.0 통합 (2026-04-26 후속)

`docs/live/feature-implementation-map.md` v3.0 (A023 작성, code-verified) 결과를 정본으로 채택. 19 도메인 (A-S) × 160+ Built / 9 NOT BUILT / 4 PARTIAL.

### 정정 사항 (v2 → v2.2)

| v2 주장 | 정정 |
|---|---|
| F-10 Stats Engine 미구현 → P1 4일 | **이미 BUILT** — `engine/stats/engine.py` (8.8KB, 5-min TTL, batch SQL aggregations, PatternPerf dataclass). 새 작업: per-user verdict accuracy 추가만 (H-08, S 사이즈) |
| Scheduler 11 jobs | map 기준 **APScheduler 등록 4 jobs** (`pattern_scan` 15m / `auto_evaluate` 15m / `outcome_resolver` 1h / `refinement_trigger` daily). 나머지 7개는 jobs 디렉토리 파일이지만 scheduler 등록 미상 → 검증 필요 |
| F-3 Telegram → Verdict 1-click | map에는 별도 항목 없음. **이미 verdict endpoint 있고**(F-01 BUILT) → 새 작업은 **Telegram message에 deep link 추가**만 (S 사이즈) |
| Ledger 4-table 분리 | map F-08 = "Ledger 4-type records" `engine/ledger/types.py` BUILT. **Python types는 4종 분리됨**. Supabase는 단일 테이블 (W-0215). → 4-table DB 분리는 P2 (분리 효과 vs 단일 운영 안정성 trade-off) |

### 9개 이슈 (canonical 등록 단위)

| 이슈 ID | 기능 | Effort | 선행 | F-매핑 |
|---|---|---|---|---|
| **A-03-eng** | AI Parser engine `POST /patterns/parse` | M | — | F-0b |
| **A-03-app** | AI Parser UI (텍스트 입력 + Parse 버튼 + Draft 미리보기) | M | A-03-eng | F-0b |
| **A-04-eng** | Chart Drag engine `POST /patterns/draft-from-range` (12 features 추출) | M | — | F-0a |
| **A-04-app** | Chart Drag UI (range 드래그 → 하이라이트 → 확인) | M-L | A-04-eng | F-0a |
| **D-03-eng** | 1-click Watch engine `POST /captures/{id}/watch` | M | — | F-2 (Watch 버튼) |
| **D-03-app** | 1-click Watch 버튼 (Verdict Inbox 카드) | S | D-03-eng | F-2 |
| **F-02** | Verdict 5-cat 확장 (`engine/ledger/types.py:54` + `captures.py:66` + `verdict.py` + 앱 버튼) | **S** | Q1 결정 후 | F-1 |
| **H-07** | F-60 Gate `GET /users/{user_id}/f60-status` (verdict count + accuracy + 200건 progress) | S-M | F-02 권장 | F-60 gate |
| **N-05** | Copy Signal Marketplace `POST /marketplace/signals/publish` + `GET /marketplace/signals` + subscribe | L | H-07 | F-60 |

**총 9 이슈**: independent 4 (A-03-eng, A-04-eng, D-03-eng, F-02) + dependent 5.

### Q1-Q5 확정 필요 (개발 전)

| # | 질문 | 영향 이슈 | 권고 |
|---|---|---|---|
| **Q1** | "missed" + "too_late" 통합 vs 분리? | F-02 | **분리 권고** — too_late는 진입 타이밍, missed는 패턴 자체 무효. 학습 라벨 노이즈 다름 |
| **Q2** | F-60 accuracy threshold (0.55 / 0.60 / X)? | H-07 | **0.55** 시작 → 90일 운영 후 데이터로 조정 |
| **Q3** | F-0a Chart Drag — 실제 드래그 UI vs form input? | A-04-app | **실제 드래그** (D11 mental model 일치). form input은 fallback |
| **Q4** | F-0b AI Parser — 자유 텍스트 vs 단계별 템플릿? | A-03-app | **자유 텍스트** (telegram 메모 그대로 붙여넣기) — telegram refs 4채널 형식 학습됨 |
| **Q5** | AI Parser 모델 — Haiku vs Sonnet? | A-03-eng | **Sonnet 4.5** (function calling 안정성 + JSON schema 강제) — Haiku는 KOL 캡션 (M-02)에 이미 사용 중 |

---

## 0.1 v2.1 추가 정밀 검증 (2026-04-26 저녁)

5개 설계문서(PATTERN_ENGINE / COIN_SCREENER / 06_autoresearch_ml / 05_scanner_alerts / 03_dashboard) × 코드 실측 결과:

| 발견 | 영향 |
|---|---|
| **`engine/api/routes/patterns.py`에 24개 routes 존재** (`/library`, `/registry`, `/states`, `/candidates`, `/scan`, `/{slug}/verdict`, `/{slug}/capture`, `/{slug}/evaluate`, `/{slug}/train-model`, `/{slug}/promote-model`, `/{slug}/benchmark-pack-draft`, `/{slug}/benchmark-search-from-capture` 등) — `/parse`만 빠짐 | **AI Parser는 단지 LLM 호출 + Validator만 추가하면 끝**. 모든 downstream consumer가 이미 PatternDraft를 받는다 |
| **`engine/api/schemas_pattern_draft.py` PatternDraftBody 스키마 완전 정의** (pattern_family, pattern_label, phases[PatternDraftPhaseBody], search_hints[PatternDraftSearchHintsBody], signals_required/preferred/forbidden) | F-0b 작업 범위 축소 — 스키마 합의 필요 없음 |
| **`/patterns/{slug}/benchmark-pack-draft` + `/benchmark-search-from-capture`** 존재 (line 515, 533) | F-0a (drag → Draft) → 즉시 benchmark search 호출 가능, 새 routing 불필요 |
| **`engine/scanner/jobs/` 11개 파일 확인** (alpha_observer / alpha_warm / auto_evaluate / feature_materialization / outcome_resolver / pattern_refinement / pattern_scan / refinement_trigger / search_corpus / universe_scan) | Scheduler 12 jobs 주장 정정: **실제 11 jobs** |
| **Dashboard WATCHING_QUERIES (line 86)** 는 BTC + ETH 2-item 정적 하드코드 placeholder | "WATCHING 섹션 있다 vs 없다" 양쪽 다 부분 정답. **실질 기능 0**, 마크업만 존재 → F-11 풀 구현 필요 |
| **Screener scorers 6개 확인** (`engine/screener/scorers.py`): score_market_cap (line 5), score_drawdown (21), score_history (35), score_supply (47), score_pattern (59 — Pattern Engine 직접 연동), score_onchain (75) | Sprint 1 80% 가중 검증 ✅. Sprint 2 5개(Twitter 7% / 섹터 LLM 5% / 이벤트 4% / 봇 2% / 아스터 2%) = 20% 결손 |
| **AutoResearch ML 4 파일 모두 존재**: `hill_climbing.py` (7KB) + `lightgbm_engine.py` (11KB) + `trainer.py` (11KB) + `label_maker.py` (6.8KB) | Phase A+B = 100%. Phase C+D는 GPU + 500+ samples 필요로 P3 |
| **state_machine.py에 5-phase enum 없음** (FAKE_DUMP/ARCH_ZONE/REAL_DUMP/ACCUMULATION/BREAKOUT) | 5-phase는 **PatternObject 단위 phase 정의** (PhaseDef.phase_id로). state_machine은 generic. 의도된 설계 — 패턴별로 phase가 다르기 때문 |
| **1h auto_evaluate vs 72h outcome_resolver 의도된 분리** | `engine/scanner/jobs/auto_evaluate.py` = 1h ±1% 알림 품질 피드백. `engine/scanner/jobs/outcome_resolver.py` = 72h +15%/-10% 패턴 성과. **둘 다 P0, 별도 학습 라벨로 사용** |

→ **결론**: AI Parser 구현 비용은 v2 추정(7일)에서 **3-4일로 축소**. 스키마 + downstream + ContextAssembler 모두 이미 있다.

---

## 0. v2가 v1과 다른 점 (정확성 정정)

v1에서 갭이라고 본 항목 중 **실제로는 이미 구현된** 것들:

| v1 갭 주장 | 실측 결과 | 정정 |
|---|---|---|
| L4 State Machine durable 미구현 | `state_store.py` (SQLite WAL primary) + `supabase_state_sync.py` (background dual-write) | ✅ 이미 완성 |
| L5 Sequence Matcher 미구현 | `engine/search/similar.py:582줄` Layer B LCS DP O(min(m,n)) space | ✅ 이미 완성 |
| Phase A+B AutoResearch 없음 | `hill_climbing.py:214줄` + `lightgbm_engine.py:302줄` per-user + AUC gate | ✅ 이미 완성 |
| Pattern Engine 17개 정도 | **52 PatternObjects + 85 Building Blocks** (Alpha Hunter 22개 포함) | ✅ 압도적 |
| Outcome resolver 없음 | `outcome_resolver_job` 매시간 + 72h window + HIT(+15%)/MISS(-10%)/EXPIRED | ✅ 이미 완성 |
| Refinement loop 미구현 | `refinement_trigger_job` 10 verdicts + 7d gate → Hill Climbing 재실행 | ✅ 이미 완성 |
| Branding layer 없음 | `pnl_renderer.py` + `sns_poster.py` + `kol_style_engine.py` (Claude Haiku 한국어 KOL) | ✅ 이미 완성 |
| Screener 미구현 | Sprint 1 6기준 (MC/drawdown/supply/pattern/onchain/history) + A/B/C grading | ✅ 이미 완성 |
| Context Assembler 없음 | `engine/agents/context.py` 토큰 예산 (Parser 10K / Judge 12K / Refinement 12K) | 🟡 **코드만 있음, LLM 호출 엔드포인트 없음** |

**진짜 갭은 9-Doc이 말한 것보다 훨씬 좁다**. 기계는 이미 자동으로 돈다 — 12개 APScheduler 잡이 매일 스캔 → outcome → verdict → refinement 사이클을 돌리고 있다. **빠진 건 사용자가 그 루프에 들어오는 입구 + 결과를 보는 창**이다.

---

## 1. Vision

**Cogochi/WTD = "Pattern Research OS"**: 트레이더가 손으로 가리키거나 자연어로 말하면, 시스템은 그 감각을 PatternObject로 외화해서 52패턴 × 85블록 카탈로그에 합류시키고, 12개 백그라운드 잡이 시장 전체에서 매칭·검증·학습을 자동으로 돌린다. 검증된 패턴은 카피시그널 marketplace로 monetize 된다.

본질:
- **broadcasting 시그널 SaaS 아님** (Alpha Hunter / Alpha Terminal / Alpha Flow / 시그널 레이더와의 결정적 차이)
- **on-demand search + verdict-validated archive**
- **사용자 감각 → PatternObject → market match → ledger verdict → refinement → 자산화** 플라이휠

차별점:
- 52 PatternObject × 85 Building Block — 한국 derivatives 패턴 커버리지에서 압도적
- Phase Path LCS Sequence Matcher — broadcasting 채널 어디에도 없음
- 5-category Verdict ledger — 책임 추적 + reranker 학습 라벨
- KOL-style 한국어 자동 캡션 — 카피시그널 발행시 즉시 사용 가능

---

## 2. Persona

**P0 단일: "Jin"** — 28-38세, 크립토 perp 전업/반전업, 3-7년차, 운용 $50K-$2M, Binance/Bybit, OI/funding/liq 능숙, **자기가 수익 내는 패턴 한두 개를 이미 안다**, 한국·아시아. WTP $29-79/mo.

JTBD: *"내가 아는 그 패턴을 시장 전체에서 지금 찾고 싶다. 차트 한 구간만 가리키거나 텔레그램 메모 붙여넣으면 시스템이 알아서 PatternObject로 외화해서 검색·검증·학습까지 다 해줘야 한다."*

→ 우리는 **사냥 도구**. 복기 저널 아님, broadcasting 시그널 아님.

P1 (Phase 2): 3-10명 trading desk. ARPU $200-1000.
P2 (Phase 3): Signal consumer (카피시그널 구독자) — 별도 페르소나, F-60 gate 후.
Anti: 초보, follower, holder, KYC/wallet 유저, broadcasting 시그널 의존자.

---

## 3. Core Loop (3 input mode)

> **Mental model**: 입력 모드는 3가지 — 차트 드래그(F-0a) / 자연어(F-0b AI Parser) / 53 카탈로그에서 선택. 셋 다 동일한 PatternDraft → SearchQuerySpec → 52패턴 × 85블록 매칭 → 결과 리스트 → Watch → 72h Outcome → 5-cat Verdict → Refinement → 카피시그널.

```
[Input — 3 modes]
  A. /terminal에서 차트 드래그 (F-0a)
     → 선택 구간 phase path (state_store에서 추출) + 12 features 자동 추출
     → PatternDraft 자동 생성
  B. 자연어 메모 / 텔레그램 붙여넣기 (F-0b AI Parser)
     → POST /api/patterns/parse → ContextAssembler → Claude → PatternDraft
  C. 53 카탈로그에서 기존 PatternObject 선택 + threshold 살짝 수정

[Resolve — 공통]
  PatternDraft → Validator → SearchQuerySpec
    (Layer A 가중치 0.45 / B LCS 0.30 / C LightGBM 0.25)

[Search]
  engine/search/similar.py 3-layer parallel blend
  → top 10~20 candidate symbols + similarity score + 차트 미리보기

[Watch]
  유저가 후보 중 일부 선택 → 1-click Watch 등록
  → pattern_scan_job (15분마다) phase 추적
  → ACCUMULATION 진입 시 alert + capture pending_outcome

[Verdict & Refinement — 자동]
  72h 후 outcome_resolver_job → HIT(+15%)/MISS(-10%)/EXPIRED
  → 유저 5-cat Verdict (VALID/INVALID/NEAR_MISS/TOO_EARLY/TOO_LATE)
  → 10+ verdicts → refinement_trigger_job → Hill Climbing + LightGBM 재학습
  → PersonalVariant or 새 PatternObject version

[Monetize — Phase 3 (F-60 gate)]
  검증된 PatternObject (verdict accuracy ≥X% × 200+ verdicts) 
  → KOL-style 캡션 자동 생성 (kol_style_engine.py)
  → 카피시그널 알림 구독 marketplace
```

ACCUMULATION 서페이싱이 product의 엣지. BREAKOUT 확인은 늦다.

---

## 4. Architecture Reality (코드 실측)

### L1 — Market Data Plane ✅
- 27 modules in `engine/data_cache/` (Binance/Bybit/Coinbase/OKX)
- raw_store + raw_ingest + freshness + market_search

### L2 — Feature Window ✅ (DESIGN_V3.1 patch 필요)
- migration 021 (40+ col)
- `engine/features/` materialization (23KB) + registry + compute (16KB)
- canonical_pattern.py
- **GAP**: kimchi_premium / session_apac/us/eu / oi_normalized_cvd 미반영 — F-6

### L3 — Pattern Object Plane ✅✅
- **52 PatternObjects** (코드 실측: `len(PATTERN_LIBRARY) == 52`. 카테고리 분포는 PR 시점 기준 추정값)
- **85 Building Blocks** (Confirmations 58 / Disqualifiers 5 / Entries 8 / Triggers 14 — 코드 실측: `engine/building_blocks/*/*.py` 카운트)
- `library.py` + `registry.py` (JSON metadata) + `definitions.py`
- `active_variant_registry.py` — 유저별 threshold override

### L4 — State Machine ✅
- `state_store.py` (18KB) — SQLite WAL primary
- `supabase_state_sync.py` (10KB) — background dual-write
- `state_machine.py` (23KB) — phase transitions
- `scanner.py:49` STATE_STORE.hydrate_states() on boot
- `alert_policy.py` — shadow/visible/ranked/gated

### L5 — Search ✅
- `engine/search/similar.py:582줄` 3-layer:
  - Layer A: Feature L1 distance (40+ dim, 가중 0.45)
  - Layer B: Phase path LCS DP O(min(m,n)) space (가중 0.30)
  - Layer C: LightGBM P(win) per-user (가중 0.25)
- `quality_ledger.py:11KB` — 성능 기반 가중치 자동 조정
- `corpus.py:16KB` + `corpus_builder.py` (W-0145 40+dim)
- `engine/research/pattern_search.py:3283줄` — 벤치마크 팩, 변형 평가, MTF 검색, 가설 테스트

### L6 — Ledger 🟡 (1-table 통합 운영)
- LedgerRecordType: entry / capture / score / outcome / verdict / training_run / model / phase_attempt (8종)
- W-0215 → Supabase `pattern_ledger_records` 단일 테이블 + JSON `record_type` discriminator
- 8 record type 코드는 분리되어 있지만 DB는 1 table
- `verdict.py:60KB` outcome HIT/MISS/VOID/PENDING — **5-cat 미구현**
- migration 014 (verdict_block_jsonb), 018 (pattern_ledger_records), 020 (capture_records)

### L7 — AutoResearch ✅ Phase A+B / ❌ Phase C+D
- Phase A: `hill_climbing.py:214줄` greedy ±δ + simulated annealing + SHAP
- Phase B: `lightgbm_engine.py:302줄` per-user + global fallback, walk-forward CV, AUC gate
- Phase C: ORPO/DPO 파인튜닝 ❌ (GPU + 데이터 규모)
- Phase D: per-user LoRA ❌ (GPU + 500+ samples)
- `trainer.py:291줄` + `label_maker.py` + `ensemble.py`
- `refinement_trigger_job` 10+ verdicts + 7d gate

### Scheduler (실측 11 jobs APScheduler) ✅
```
engine/scanner/jobs/
  universe_scan.py         15분  Alpha Score + block signals
  pattern_scan.py          별도  52패턴 phase 추적
  auto_evaluate.py         1h    알림 품질 피드백 (1h ±1%)
  outcome_resolver.py      1h    capture outcome (72h +15%/-10%)
  pattern_refinement.py    daily threshold 개선 제안
  refinement_trigger.py    daily 10+ verdict → 재학습
  alpha_observer.py        —     Alpha Score 모니터
  alpha_warm.py            —     cache warming
  search_corpus.py         —     feature_windows 업데이트
  feature_materialization.py — 주기적 프리패치
  __init__.py              —     APScheduler 등록
```

**중요 — 1h vs 72h 이중 표준 (의도된 설계)**:
- `auto_evaluate.py` = 1h ±1% — **알림 품질 피드백**용. 잘못된 알림 빠르게 잡음
- `outcome_resolver.py` = 72h +15%/-10% — **패턴 성과 ledger** 기록용. PatternObject win_rate 측정
- 두 라벨은 별도 학습 신호로 사용. `05_scanner_alerts.md` (1h)와 `02_ENGINE_RUNTIME.md` (72h)가 모순이 아니라 분리된 책임

### Alpha Score ✅
- 15 scorers (s1-s15) in `engine/market_engine/l2/alpha.py`
- STRONG BULL / BULL / NEUTRAL / BEAR / STRONG BEAR (-55 ~ +55)

### Screener Sprint 1 ✅ / Sprint 2 ❌
**`engine/screener/scorers.py` 6 함수 검증** (line numbers 인용):
| 기준 | 가중 | 함수 | line |
|---|---|---|---|
| Market Cap | 20% | `score_market_cap()` | 5 |
| 고점/저점 비율 | 15% | `score_drawdown()` | 21 |
| 과거 이력 | 10% | `score_history()` | 35 |
| 물량 독점 | 15% | `score_supply()` | 47 |
| 패턴 (Pattern Engine 연동) | 12% | `score_pattern(pattern_phase)` | 59 |
| 온체인 | 8% | `score_onchain()` | 75 |
| **합계** | **80%** | | |

`engine/screener/pipeline.py` A/B/C grading + hysteresis + composite_sort_score, API route `engine/api/routes/screener.py`. ACCUMULATION → action_priority P0.

**Sprint 2 결손 20%** (F-39):
- Twitter API 7% / 섹터 LLM 5% / 호재·이벤트 크롤러 4% / 봇 활동 2% / 아스터 2%

### Branding Layer ✅ (카피시그널 marketplace 사전 자산)
- `pnl_renderer.py` Pillow PnL 카드 PNG
- `sns_poster.py` Twitter 자동 포스팅
- `kol_style_engine.py` Claude Haiku 한국어 KOL 캡션
- → F-60 카피시그널 발행 시 그대로 사용 가능

### Context Assembler 🟡
- `engine/agents/context.py` ContextAssembler 클래스 + 토큰 예산
- Parser ~10K / Judge ~12K / Refinement ~12K
- COGOCHI.md 섹션 lazy loading
- ❌ POST /api/patterns/parse 엔드포인트 (Slice 3 미구현)

### Dashboard 🟡 (755줄, 8 섹션 중 4 완성)
`app/src/routes/dashboard/+page.svelte`:

| 섹션 | 상태 | 코드 위치 / 비고 |
|---|---|---|
| 6-gate Flywheel KPI | ✅ 완성 | captures/day · capture→outcome · outcome→verdict · verdict→refinement · active models · promotion gate |
| Verdict Inbox | ✅ 완성 | line 309 `submitVerdict()`, pendingVerdicts 연동 |
| MY CHALLENGES | ✅ 완성 | challenge/strategy store 연동 (line 99-108) |
| Signal Alerts | 🟡 부분 | alert_logs ↔ dashboard 연결 일부 |
| **WATCHING** | 🟡 **placeholder** | line 86: `WATCHING_QUERIES` 2-item 정적 하드코드 (BTC + ETH 텍스트). **실질 기능 0**. F-11에서 풀 구현 |
| MY ADAPTERS | 🟡 stub | AdapterDiffPanel placeholder, Phase 2+ |
| Telegram Connect | ❌ | 6자리 코드 인증 UI 없음 (alert 발송 인프라는 있음). F-13 |
| AutoResearch 상태 | ❌ | "다음 실행 D-3, 피드백 수" 표시 없음 |

### Flywheel Closure (docs/live/flywheel-closure-design.md)
4축 모두 닫힘:
- A: Capture wiring ✅
- B: Outcome resolver ✅
- C: Verdict labeling ✅
- D: Refinement trigger ✅

---

## 5. Real Gaps (확정)

| 우선순위 | Gap | 파일 위치 | 근거 |
|---|---|---|---|
| **P0** | AI Parser POST /api/patterns/parse | 없음 | Slice 3 / 입구 없음 = 온보딩 없음 |
| **P0** | 5-category Verdict (VALID/INVALID/NEAR_MISS/TOO_EARLY/TOO_LATE) | `verdict.py` 3-state만 | reranker 학습 라벨 노이즈 = moat 약화 |
| **P0** | Chart Range Selection → PatternDraft (대체 입력) | 없음 | F-0a, F-0b와 양 입력 모드 |
| **P0** | Telegram alert → 1-click Verdict 링크 | alert 발송 있음, verdict 링크 없음 | Verdict 제출률이 학습 속도 결정 |
| **P1** | Stats Engine `engine/stats/engine.py` | 없음 | 패턴별 win_rate / occurrence / hold 표시 안 됨 |
| **P1** | Dashboard WATCHING 섹션 | 없음 | 라이브 모니터링 진입점 |
| **P1** | DESIGN_V3.1 features (kimchi/session/oi_normalized_cvd) | feature_windows 미반영 | Korea persona 직결 |
| **P2** | Ledger 4-table 실제 분리 | Supabase 1 table | ML 학습 효율 + reproducibility |
| **P2** | Visualization Intent Router 6×6 | 없음 | 단일 흐름 검증 후 multi-mode |
| **P2** | Telegram Bot 연결 UI (6자리 코드) | 없음 | 사용자가 손으로 토큰 복사 중 |
| **P2** | Pattern Candidate Review UI | 없음 | AI Parser 후 Draft → Object 승격 |
| **P2** | Screener Sprint 2 (Twitter/섹터 LLM/이벤트) | 없음 | 80% → 100% coverage |
| **P3** | LambdaRank 학습 reranker | 현재는 rule-based | verdict 200+ 후 |
| **P3** | Pattern Wiki `engine/wiki/` 본격화 | ingest.py 일부만 | Phase 2 |
| **P3** | Semantic RAG (pgvector + news) | 없음 | F-50 LLM Judge 직전 |
| **P3** | Phase C/D ML (ORPO/DPO + per-user LoRA) | 없음 | GPU + 500+ samples |

---

## 6. Telegram Refs Integration (별도 부록 W-0220-telegram-refs-analysis.md)

### 13개 Base Signal Vocabulary 채택
4채널(Alpha Hunter / Alpha Terminal / 시그널레이더 / Alpha Flow) 공통:
```
oi_surge, oi_collapse, liq_cascade,
funding_extreme_short, funding_extreme_long,
cvd_breakout, whale_block,
bb_squeeze_breakout, orderbook_imbalance, micro_volatility_low,
taker_ratio_extreme_buy, taker_ratio_extreme_sell,
kimchi_premium_extreme
```
→ 85 Building Blocks 어휘에 이미 다수 포함됨. 누락된 것만 추가 (kimchi_premium은 신규).

### Wyckoff Phase 명명 (canonical 채택)
ACCUMULATION → DISTRIBUTION → BREAKOUT → RETEST → [SQUEEZE 전조]
4채널 모두 동일 → **한국 시장 표준**. 52 PatternObject 중 wyckoff-spring/accumulation/absorption 이미 있음.

### F-60 카피시그널 메시지 표준 (JSON 스키마)
별도 부록에 13-field schema 명세 (signal_id / issuer.verified_badge / phase_path_observed / alpha_score / trigger_features / trade_plan / thesis_one_liner / chart_attachment_url / verdict_eta).

### F-60 발행자 책임
- verified badge + 3개월+ 트랙레코드
- 결과 보고 자동화 (slippage + fee 반영 수익률)
- disclaimer 자동 삽입
- 손실 시 환불/재신청 정책

---

## 7. 의사결정 (D1~D15)

| # | 이슈 | 결정 | 근거 |
|---|---|---|---|
| D1 | Pricing | **$29/mo Pro** | 83% gross margin, 7-Doc cost model |
| D2 | NSM | **WVPL per user** | PRD_04 정본 |
| D3 | Persona | **Jin** | -1_PRODUCT_PRD canonical |
| D4 | Decision HUD | **5-card** | 의사결정 incomplete 방지 |
| D5 | Layout | **IDE split-pane** | free-form canvas 폐기 |
| D6 | L6 1-table vs 4-table | **현재 1-table 유지 (P2 분리)** | W-0215 운영 안정 |
| D7 | L3 hardcoded vs DB-first | **현재 file-first 유지** | 52패턴 file 등록 OK, lifecycle만 명확화 |
| D8 | 5-cat verdict 시점 | **즉시 P0** | reranker 라벨 = moat |
| D9 | Wiki Agent 분류 | **L7 ledger-driven job** | 별도 AI agent 아님 |
| D10 | DESIGN_V3.1 features | **즉시 P1** | Korea persona 직결 |
| D11 | Mental model | **Forward search tool** | 복기 저널 아님 |
| D12 | 카피시그널 시점 | **F-60 gate** (verdict 200+ × 5 패턴) | 데이터 검증 전 X |
| D13 | AI Parser 포지션 | **P0 입구 #1** | 온보딩 진입점 |
| D14 | Chart drag (F-0a) vs AI Parser (F-0b) | **양쪽 다 P0**, 동일 PatternDraft 스키마 | 입력 모드 다양화 |
| D15 | Telegram alert → verdict | **P0 1-click 링크** | 학습 속도 결정 |

---

## 8. Feature Priority (rebalanced)

### 🟥 P0 — 6주, 입구 + 라벨 + 결과 보고

| # | 항목 | Layer | 예상 |
|---|---|---|---|
| **F-0a** | Chart Range Selection → PatternDraft 자동 (drag → phase path + 12 features → Draft JSON) | UI+L2+L3 | 7일 |
| **F-0b** | AI Parser **POST /api/patterns/parse** — `schemas_pattern_draft.PatternDraftBody` 이미 정의됨 + `engine/agents/context.py` ContextAssembler.for_parser() 이미 있음 → Claude Sonnet/Haiku function calling + Validator + 재시도 (≥95% schema compliance). **downstream 자동 연결**: `/{slug}/benchmark-pack-draft` (line 515) + `/{slug}/benchmark-search-from-capture` (line 533) | API+L3 | **3-4일** (스키마/Assembler/downstream 모두 있음) |
| **F-1** | 5-category Verdict (VALID/INVALID/NEAR_MISS/TOO_EARLY/TOO_LATE + comment) — DB migration + UI + label_maker 수정 | L7 | 3일 |
| **F-2** | Search Result List UX — top 10~20 + similarity score + 차트 미리보기 + 1-click Watch | UI+L5 | 5일 |
| **F-3** | Telegram alert → 1-click Verdict deep link (signed token, 72h TTL) | infra+L7 | 3일 |
| **F-4** | 5-card Decision HUD (Pattern Status / Top Evidence / Risk / Next Transition / Actions) | UI | 4일 |
| **F-5** | IDE-style resizable split-pane (Observe/Analyze/Execute) | UI | 5일 |
| **F-7** | 메타 자동화 — CURRENT.md SHA post-merge hook + worktree ≤10 cron | meta | 1.5일 |

**P0 합계**: ~36일 (7주, 동시작업 시 4-5주)

### 🟧 P1 — M3 출시 전

| # | 항목 | 예상 |
|---|---|---|
| ~~F-10 Stats Engine~~ | **이미 BUILT** `engine/stats/engine.py` (5-min TTL + batch SQL). H-08 per-user verdict accuracy 추가만 (S, 1일) | ~~4일~~ → 1일 |
| F-11 | Dashboard WATCHING 섹션 + Pattern Candidate Review UI | 5일 |
| F-12 | DESIGN_V3.1 features (kimchi_premium / session_apac/us/eu / oi_normalized_cvd) | 3일 |
| F-13 | Telegram Bot 연결 UI — 6자리 코드 인증 + 알림 라우팅 | 3일 |
| F-14 | PatternObject lifecycle (Draft → Candidate review → Object) — F-0a/0b 후 Draft 라이브러리 승격 | 4일 |
| F-15 | PersonalVariant runtime — 유저별 threshold override 활성화 | 3일 |
| F-16 | Search recall@10 ≥ 0.7 검증 — 50 query eval set + LCS 가중 튜닝 (0.6/0.3/0.1) | 3일 |
| F-17 | Visualization Intent Router (6 intent × 6 template, 단일 흐름 검증 후) | 7일 |
| F-18 | Auth + tier enforcement + Stripe + rate limit | 5일 |
| F-19 | Sentry + observability 대시보드 (p95 / error / cost/WAA) | 3일 |
| F-20 | App vercel.json 브랜치 가드레일 + production 분리 | 1일 |
| F-21 | GCP cogotchi-worker Cloud Build trigger | 1일 |

### 🟨 P2 — M6 출시

| # | 항목 |
|---|---|
| F-30 | Ledger 4-table 분리 (entries / scores / outcomes / verdicts) + materialized view |
| F-31 | LightGBM Reranker 1차 학습 (verdict 50+) NDCG@5 +0.05 |
| F-32 | Capture duplicate detection + selection range 재호출 |
| F-33 | Negative set curation (hard_negative / near_miss / fake_hit) |
| F-34 | Isotonic calibration |
| F-35 | Regime-conditioned stats (bull/bear/range) |
| F-36 | Push/Telegram alerts 정밀화 |
| F-37 | Personal stats panel + Telegram/X 공유 |
| F-38 | Pattern decay monitor |
| F-39 | Screener Sprint 2 — Twitter API + 섹터 LLM + 이벤트 크롤러 |

### 🟦 P3 — Phase 2+

| # | 항목 | 선행조건 |
|---|---|---|
| F-50 | LLM Judge (Stage 4 advisory) | reranker 안정 |
| F-51 | Chart Interpreter (multimodal) — selection 정확도 향상 | F-50 |
| F-52 | Auto-Discovery agent (시스템이 새 패턴 후보 제안) | verdict 1000+ |
| F-53 | Multi-TF search + benchmark pack | F-16 |
| F-54 | Team workspace + shared library + role perms | M6 후 |
| F-55 | LambdaRank 학습 reranker | verdict 200+ + NDCG label |
| F-56 | Pattern Wiki (engine/wiki/) 본격화 | Phase 2 |
| F-57 | Semantic RAG (pgvector + news) | F-50 직전 |
| F-58 | Native mobile (PWA 우선) | 끝 |
| F-59 | ORPO/DPO Phase C + per-user LoRA Phase D | GPU + 500+ samples |
| **F-60** | **카피시그널 Phase 1** — 검증된 PatternObject (verdict accuracy ≥X% × 200+) 알림 구독, kol_style_engine.py 캡션 자동 사용 | verdict 200+ × 5 패턴 |
| **F-61** | **카피시그널 Phase 2** — revenue share, signal consumer marketplace | F-60 + KYC + KOL guardrail |

### 💰 수익화 4단계

| Stage | 시점 | 모델 | Gate |
|---|---|---|---|
| 1 | M1-M6 | SaaS Pro $29 | WVPL ≥ 3/user |
| 2 | M6-M12 | + Team ARPU $200-1000 | F-54 |
| 3 | M12+ | + 카피시그널 알림 구독 | F-60 |
| 4 | M18+ | + Marketplace revenue share | F-61 |

### 🚫 동결 / Non-Goal

- Multi-Agent OS / MemKraft / slash command 추가 개발 — 자기 운영체제 야크쉐이빙
- W-0132 Copy Trading 직접 매매 자동화 — 영구 (시그널 알림 OK, order 실행 X)
- Pine Script Generator 확장 — W-0211 머지됨, Phase 2+ LLM-only 보류
- Free-form floating canvas — 폐기, IDE split-pane으로 대체
- Cogochi/DOUNI 캐릭터 personality — Phase 2+
- /market /training /battle /passport — Phase 3+
- Broadcasting-only 시그널 채널 모방 — 영구 (4 telegram 채널처럼 안 함)
- "실전 매매 복기" 중심 UX — 폐기
- TradingView feature parity — 영구
- 자동매매 in-product — 영구
- 모바일 native 앱 — Phase 2+ (PWA 우선)
- API-only 유저 product — 영구
- Customer-facing LLM chat (parser 외) — 영구
- Portfolio P&L / social comments / news aggregator / paper trading / options / price prediction — 안 만듦
- 성과 수수료 / paid ads / KOL 유료방 / 블랙박스 SaaS / 초보자 교육 — 영구 배제 (F-60 marketplace는 검증 데이터 기반이라 별개)

---

## 9. Roadmap (12-week, P0+P1)

| Week | Slice | 산출 | Gate |
|---|---|---|---|
| W1 | F-7 + F-0b 컨트랙트 + F-1 스키마 | 메타 자동화 + Parser API 컨트랙트 + verdict 5-cat migration | CURRENT.md stale ≤1h |
| W2 | F-0b 구현 + F-1 마무리 | Claude 호출 + Validator + 5-cat E2E | Parser ≥95% schema compliance |
| W3 | F-0a + F-2 시작 | Chart drag → Draft + Result list | 1 종목 Draft 정상 + top 10 candidate |
| W4 | F-2 마무리 + F-3 | 1-click Watch + Telegram → Verdict deep link | 알림 클릭 → verdict 30s 내 |
| W5 | F-4 + F-12 | 5-card HUD + DESIGN_V3.1 features | Korea features 점수 반영 |
| W6 | F-5 + F-10 시작 | IDE split-pane + Stats Engine | mode 토글 + win_rate 표시 |
| W7 | F-10 마무리 + F-11 | Stats cache + WATCHING + Candidate Review | 패턴 클릭 → 성과 카드 |
| W8 | F-13 + F-14 | Telegram bot connect + Lifecycle | 6자리 코드 + Draft → Object 승격 |
| W9 | F-15 + F-16 | PersonalVariant + recall 검증 | 50 query recall@10 ≥0.7 |
| W10 | F-17 시작 + F-18 | Intent Router + Auth/Stripe | Pro 결제 가능 |
| W11 | F-17 마무리 + F-19~F-21 | router 마무리 + observability/infra | p95 < 2s, error < 0.5% |
| W12 | M3 launch prep | public beta open + WAA tracking | WVPL ≥ 3/user, 200 WAA |

---

## 10. Success Metrics

### NSM
**WVPL = Weekly Verified Pattern Loops** per user.
M1 2 / **M3 3 / M6 4 / M12 5**.
Kill: M3 <1.0 → 재설계 / M6 <1500 total → positioning kill.

### Funnel @ M3 Green
land→signup 4% / signup→capture 55% / →search 75% / →verdict 40% / W1→W4 50%.

### Search Quality
hit@5 M3 55% / M6 70%. Reranker NDCG@5 vs baseline +0.05 (verdict 50+).

### AI Quality
Parser schema compliance ≥95%. Confidence ≥0.75 @ M3.

### Revenue
Free→Pro 5% @ M6. MRR M3 $1K / M6 $15K / M12 $80K. Churn ≤10%/월. LTV/CAC ≥5×.

### Guardrails (gate 통과 전 GTM 동결)
- captures_per_day_7d > 0
- captures_to_outcome_rate > 0.9
- outcomes_to_verdict_rate > 0.5
- verdicts_to_refinement_count_7d > 0
- active_models_per_pattern ≥ 1
- promotion_gate_pass_rate_30d > 0
- infra cost/WAA < $8 / p95 < 2s / error < 0.5%
- false positive alert < 15% / AI hallucination < 0.1/WAA/주

---

## 11. 즉시 다음 액션

1. D1~D15 의사결정 사용자 confirm
2. spec/PRIORITIES.md 갱신 — F-0b (AI Parser) + F-1 (5-cat verdict) + F-3 (Telegram→Verdict link)이 새 P0
3. work/active/CURRENT.md main SHA 동기화 (3ce9cf5d 또는 latest) + 본 PRD 등록
4. F-7 (메타 자동화) — 1.5일, 즉시 시작 가능
5. F-0b (AI Parser) 컨트랙트 설계 — ContextAssembler가 이미 있어서 LLM 호출 + 엔드포인트만 신규

---

## 12. 부록

### 12.1 Pattern Catalog (53)
- Core OI Reversal 6 (tradoor, funding-flip, whale-accumulation, wyckoff-spring, volume-absorption …)
- Short Patterns 3 (funding-flip-short, gap-fade-short, institutional-distribution)
- Alpha Terminal 7 (short-squeeze, bottom-absorption, breakout-momentum, vwap-break …)
- Alpha Flow 6 (bull-bias, bear-bias, mtf-accumulation, wyckoff-accumulation …)
- Alpha Hunter 22 (pre-pump, pre-dump, whale-flow, hunt-score, momentum-bull/bear, dex-buy-pressure …)
- Radar 5 (cvd-breakout, whale-block-trade, orderbook-imbalance …)
- Breakout 2 (compression-breakout, volatility-squeeze-breakout)

### 12.2 Building Blocks (92)
- Confirmations 60+ (oi_spike_with_dump, higher_lows_sequence, funding_flip, cvd_price_divergence, smart_money_accumulation, bollinger_squeeze, volume_dryup …)
- Disqualifiers 5 (extended_from_ma, extreme_volatility, volume_below_average …)
- Entries 8 (rsi_bullish_divergence, bullish_engulfing, support_bounce …)
- Triggers 11+ (breakout_above_high, recent_decline, sweep_below_low, volume_spike …)

### 12.3 Telegram Vocabulary 추가 (3개 신규)
- kimchi_premium_extreme (Korea P1)
- liq_cascade (이미 일부 building block 존재, 정식 등록)
- micro_volatility_low (BB squeeze와 별개로 ATR%/price 기반)

### 12.4 동의어 통합

| 용어 | 통합 |
|---|---|
| Cogochi / WTD / Pattern OS | 외부 = "Cogochi", 내부 = "WTD" |
| Capture / Save Setup / ledger_entry | UI = "Save Setup", DB = capture_records, ledger type = entry |
| PatternObject / Pattern / Strategy | "PatternObject" 정본 |
| Verdict / outcome / refinement | outcome = 자동(엔진 ±15%/-10%), verdict = 사용자 5-cat, refinement = 누적 후 자동 제안 |
| HUD / Decision Card / KPI strip | "Decision HUD" 정본 (5 cards) |
| Intent / Mode / View | intent (6) / mode (3 Observe/Analyze/Execute) / template (6) |
| Building Block / Signal / Confirmation | DB = signal_id, UI = "Building Block", category = Confirmation/Disqualifier/Entry/Trigger |

### 12.5 코드 실측 정밀 데이터 (5 design docs × code)

#### A. PATTERN_ENGINE_DESIGN.md → 코드
| 설계 컴포넌트 | 코드 위치 | 상태 |
|---|---|---|
| 5단계 State Machine (per pattern) | `engine/patterns/state_machine.py` (23KB) — generic engine. phase는 PhaseDef.phase_id로 PatternObject마다 정의 | ✅ |
| Durable State Store | `engine/patterns/state_store.py` (18KB) SQLite WAL primary | ✅ |
| Supabase State Sync | `engine/patterns/supabase_state_sync.py` (10KB) background dual-write | ✅ |
| Scanner hydrate on boot | `engine/patterns/scanner.py:49` STATE_STORE.hydrate_states() | ✅ |
| Alert Policy 4-mode | `engine/patterns/alert_policy.py` shadow/visible/ranked/gated | ✅ |
| Pattern Registry | `engine/patterns/registry.py` JSON metadata + atomic upsert | ✅ |
| Active Variant Registry | `engine/patterns/active_variant_registry.py` (6KB) per-user threshold | ✅ |
| AI Parser endpoint | **없음** — `/parse` route 미구현 | ❌ F-0b |
| Pattern Candidate Review UI | API `/patterns/candidates` (line 149) ✅ / UI 없음 | 🟡 F-14 |

#### B. COIN_SCREENER_DESIGN.md → 코드 (위 §4 §Screener 표 참조)
- Sprint 1: 6 함수 80% ✅
- Sprint 2: 5 기준 20% 결손 → F-39

#### C. 06_autoresearch_ml.md → 코드
| Phase | 방법 | 코드 | 상태 |
|---|---|---|---|
| A | Hill Climbing weight ±0.05, GPU X | `engine/scoring/hill_climbing.py` (7KB) SHAP + 수렴 + step shrink | ✅ |
| B | LightGBM per-user P(win), AUC gate | `engine/scoring/lightgbm_engine.py` (11KB) walk-forward CV | ✅ |
| C | ORPO/DPO chosen/rejected | 없음 | ❌ GPU 필요 |
| D | per-user LoRA | 없음 | ❌ GPU + 500+ samples |
| 학습 trigger | refinement_trigger_job 10+ verdicts + 7d gate | `engine/scanner/jobs/refinement_trigger.py` | ✅ |
| Label maker | verdict → 학습 라벨 | `engine/scoring/label_maker.py` (6.8KB) | ✅ |
| Trainer | LightGBM 학습 실행기 | `engine/scoring/trainer.py` (11KB) | ✅ |
| Ensemble | ML + Rule | `engine/scoring/ensemble.py` | ✅ |

**Risk**: verdict 누적이 적으면 LightGBM 모델이 실제로 학습되지 않을 수 있다. F-1 (5-cat verdict) + F-3 (Telegram→Verdict) 가 학습 데이터 펌프.

#### D. 05_scanner_alerts.md → 코드
| 컴포넌트 | 코드 | 상태 |
|---|---|---|
| Alpha Score 15-layer | `engine/market_engine/l2/alpha.py` s1-s15 | ✅ |
| 패턴 스캔 15분 | `engine/scanner/jobs/pattern_scan.py` | ✅ |
| Alert 발송 | `engine/scanner/alerts.py` + `alerts_pattern.py` | ✅ |
| 4h 쿨다운 중복 방지 | alert 로직 내부 | ✅ |
| 1h ±1% 자동 판정 | `engine/scanner/jobs/auto_evaluate.py` | ✅ (알림 품질 라벨) |
| 72h +15%/-10% outcome | `engine/scanner/jobs/outcome_resolver.py` | ✅ (성과 라벨) |
| SignalSnapshot HMAC | SignalSnapshot 구조 | ✅ |
| Dashboard ↔ Alert 피드백 | dashboard 755줄 + verdict endpoint | 🟡 부분 → F-3 |

#### E. 03_dashboard.md → 코드 (위 §4 §Dashboard 표 참조)
8 섹션 중 4 완성, 2 placeholder, 2 미구현 → F-11 (WATCHING 풀 구현) + F-13 (Telegram connect) + AutoResearch 상태 카드

### 12.6 설계 문서 cross-ref (worktree root에 사본 있음)

| 문서 | v2 PRD 매핑 |
|---|---|
| 00_MASTER_ARCHITECTURE.md | §4 Architecture Reality |
| 01_PATTERN_OBJECT_MODEL.md | §4 L3, §12.1 카탈로그 |
| 02_ENGINE_RUNTIME.md | §4 L4 + Scheduler |
| 03_SEARCH_ENGINE.md | §4 L5 + F-16 |
| 04_AI_AGENT_LAYER.md | §3 input modes + F-0b |
| 05_VISUALIZATION_ENGINE.md | F-4, F-5, F-17 |
| 06_DATA_CONTRACTS.md | F-12 (DESIGN_V3.1 patch) |
| 07_IMPLEMENTATION_ROADMAP.md | §9 Roadmap |
| 09_RERANKER_TRAINING_SPEC.md | F-31, F-55 |
| PATTERN_ENGINE_DESIGN.md | §4 L3 5단계 state machine 확정 |
| COIN_SCREENER_DESIGN.md | Sprint 1 ✅ / Sprint 2 = F-39 |
| 06_autoresearch_ml.md | §4 L7 Phase A+B ✅, C+D = F-59 |
| 05_scanner_alerts.md | Scheduler 12 jobs ✅, 1h vs 72h dual standard 의도된 설계 |
| 03_dashboard.md | Dashboard ✅ partial, WATCHING = F-11 |
| 11_CTO_DATA_ARCHITECTURE_REALITY.md | §0 정정의 직접 근거 |
| docs/live/flywheel-closure-design.md | §4 4축 closure 확인 |

---

**A022 / 3ce9cf5d / 2026-04-26 v2 (CTO+AI Researcher Edition)**
