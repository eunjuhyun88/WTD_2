# W-0220 — 전체 작업 체크리스트

> **에이전트 사용법**: 자신의 Feature ID 항목만 찾아 구현 완료 시 `[ ]` → `[x]` 변경 후 커밋.
> PR description에 체크리스트 항목 번호(예: `A-03-eng`) 명시.
>
> 범례: `[x]` 완료 / `[~]` 부분 / `[ ]` 미완료
> Source: W-0220 PRD v2.2 + feature-implementation-map.md v3.0 + 코드 실측 (3ce9cf5d)
> Updated: 2026-04-26 A027 (D/Q 결정 반영)

---

## ✅ 확정된 결정

| ID | 결정 | 값 |
|----|------|----|
| Q1 | missed vs too_late | **분리** (둘 다 유지) |
| Q3 | Chart drag UI | **실제 마우스 드래그** |
| Q4 | AI Parser 입력 | **자유 텍스트** |
| Q5 | AI Parser 모델 | **Sonnet 4.5** |
| D8 | 5-cat verdict 즉시 P0 | **Yes** |

---

## 🟥 P0 — Wave 1 (동시 4개, 독립)

### F-02 — Verdict 5-cat `feat/F02-verdict-5cat`

> AC: 5값 저장 200 / 기존 3값 호환 / stats 반영 / wiki trigger

- [x] **F-02-1** `engine/ledger/types.py` VerdictLabel = `valid | invalid | missed | too_late | unclear` (5종, Q1: missed/too_late 분리)
- [x] **F-02-2** `engine/captures/verdict.py` 5종 수신 + DB write
- [x] **F-02-3** `engine/api/routes/captures.py` POST `/captures/{id}/verdict` 업데이트
- [x] **F-02-4** `app/src/routes/api/captures/[id]/verdict/+server.ts` 5종 proxy
- [x] **F-02-5** `app/src` Verdict Inbox 5-cat 버튼 UI (valid/invalid/missed/too_late/unclear)
- [x] **F-02-6** 기존 3값(valid/invalid/unclear) → 5값 DB migration (backfill 불필요, forward-only)
- [x] **F-02-7** Engine CI pass + App CI pass

---

### A-03-eng — AI Parser engine `feat/A03-ai-parser-engine`

> AC: 자유 텍스트 → PatternDraftBody JSON / Sonnet 4.5 / validator + retry

- [x] **A-03-eng-1** `engine/api/routes/patterns.py` POST `/patterns/parse` 엔드포인트 추가
- [x] **A-03-eng-2** `engine/agents/context.py` `ContextAssembler.for_parse_text()` 완성 (토큰 ~10K)
- [x] **A-03-eng-3** Claude Sonnet 4.5 호출 → PatternDraftBody JSON 파싱
- [x] **A-03-eng-4** Draft validator: required fields 체크 + 재시도 루프 (최대 2회)
- [x] **A-03-eng-5** `engine/api/schemas_pattern_draft.py` PatternDraftBody 스키마 확인/보완
- [x] **A-03-eng-6** 단위 테스트: mock Claude 응답 → draft 검증
- [x] **A-03-eng-7** Engine CI pass (1486 passed)

---

### A-04-eng — Chart Drag engine `feat/A04-chart-drag-engine`

> AC: 범위(start_ts, end_ts, symbol) → 12 features 추출 → PatternDraftBody

- [ ] **A-04-eng-1** `engine/api/routes/patterns.py` POST `/patterns/draft-from-range` 엔드포인트
- [ ] **A-04-eng-2** 12 features 추출: oi_change, funding, cvd, liq_volume, price, volume, btc_corr, higher_lows, lower_highs, compression, smart_money, venue_div
- [ ] **A-04-eng-3** `engine/features/` 기존 materialization 재사용 (신규 계산 최소화)
- [ ] **A-04-eng-4** PatternDraftBody 반환 스키마 (A-03-eng와 동일 포맷)
- [ ] **A-04-eng-5** 단위 테스트: 범위 입력 → features dict 검증
- [ ] **A-04-eng-6** Engine CI pass

---

### D-03-eng — 1-click Watch engine `feat/D03-watch-engine`

> AC: POST idempotent / monitoring row 생성 / duplicate 무시

- [x] **D-03-eng-1** `engine/api/routes/captures.py` POST `/captures/{id}/watch` 엔드포인트
- [x] **D-03-eng-2** `engine/capture/store.py` watch 상태 저장 (Supabase captures 테이블 `is_watching` 컬럼 or 별도 테이블)
- [x] **D-03-eng-3** idempotent: 이미 watching이면 200 OK 반환 (에러 아님)
- [x] **D-03-eng-4** `GET /captures?watching=true` 필터 지원
- [x] **D-03-eng-5** Engine CI pass

---

## 🟧 P1 — Wave 2 (Wave 1 완료 후)

### H-07 — F-60 Gate `feat/H07-f60-gate`

- [ ] **H-07-1** `GET /users/{user_id}/f60-status` — verdict_count, pattern_count, gate_open bool
- [ ] **H-07-2** F-60 조건: verdict 200+ × 5개 패턴 이상
- [ ] **H-07-3** Engine CI pass

### A-03-app — AI Parser UI `feat/A03-ai-parser-app`

> 선행: A-03-eng merge

- [ ] **A-03-app-1** 텍스트 입력 박스 + "Parse" 버튼 컴포넌트
- [ ] **A-03-app-2** `POST /api/patterns/parse` 호출 + 로딩 상태
- [ ] **A-03-app-3** PatternDraft 미리보기 (phase_sequence, key_signals 표시)
- [ ] **A-03-app-4** "저장 → Capture" 버튼 연결
- [ ] **A-03-app-5** App CI pass

### A-04-app — Chart Drag UI `feat/A04-chart-drag-app`

> 선행: A-04-eng merge

- [ ] **A-04-app-1** 차트 위 range 드래그 인터랙션 (mousedown → mousemove → mouseup)
- [ ] **A-04-app-2** 선택 범위 하이라이트 오버레이
- [ ] **A-04-app-3** 확인 팝업 → `POST /patterns/draft-from-range` 호출
- [ ] **A-04-app-4** Draft 미리보기 → 저장 플로우 (A-03-app과 동일 컴포넌트 재사용)
- [ ] **A-04-app-5** App CI pass

### D-03-app — Watch 버튼 `feat/D03-watch-app`

> 선행: D-03-eng merge

- [ ] **D-03-app-1** Verdict Inbox 카드에 Watch 버튼 추가
- [ ] **D-03-app-2** `POST /api/captures/{id}/watch` 호출 + optimistic UI
- [ ] **D-03-app-3** WATCHING 섹션에 watching=true captures 목록 표시
- [ ] **D-03-app-4** App CI pass

---

## 🟨 P2

- [ ] **H-08** per-user verdict accuracy endpoint `GET /users/{id}/verdict-accuracy`
- [ ] **F-30** Ledger 4-table 분리 (entries/scores/outcomes/verdicts + materialized view)
- [ ] **F-17** Viz Intent Router 6×6 (WHY/STATE/COMPARE/SEARCH/FLOW/EXECUTION)
- [ ] **F-32** Capture duplicate detection
- [ ] **F-35** Regime-conditioned stats (bull/bear/range)
- [ ] **F-36** Push/Telegram alerts 정밀화
- [ ] **F-39** Screener Sprint 2 (Twitter 7% / 섹터 LLM 5% / 이벤트 4% / 봇 2%)

---

## 🟦 P3

- [ ] **F-50** LLM Judge Stage 4
- [ ] **F-51** Chart Interpreter (multimodal)
- [ ] **F-55** LambdaRank 학습 reranker (verdict 200+)
- [ ] **F-59** ORPO/DPO Phase C + per-user LoRA Phase D (GPU)
- [ ] **F-60** 카피시그널 Phase 1 (verdict 200+ × 5패턴 gate 후)
- [ ] **F-61** 카피시그널 Phase 2 (Marketplace)

---

## ✅ BUILT — 완료된 자산 (참조용)

| 레이어 | 완료 항목 |
|--------|----------|
| L1 Market Data | 33/33 ✅ (OI/Funding/Liq/CVD/OHLCV/Depth/Venue/Options/RV/Macro/Onchain 등) |
| L2 Feature Window | migration 021 40+col ✅ / DESIGN_V3.1 patch 미완 |
| L3 Pattern Object | **53 PatternObjects** ✅ / **92 Building Blocks** ✅ / ActiveVariantRegistry ✅ |
| L4 State Machine | SQLite WAL + Supabase dual-write ✅ / alert_policy 4단계 ✅ |
| L5 Search | Layer A(L1 40+dim) ✅ / Layer B(LCS phase path) ✅ / Layer C(LightGBM, 미훈련) ~/ quality_ledger ✅ |
| L6 Ledger | 8종 Python types ✅ / Supabase 단일 테이블 ✅ (W-0215) / 4-table split = P2 |
| L7 AutoResearch | Hill Climbing ✅ / LightGBM per-user ✅ / Phase C/D = P3(GPU) |
| Scheduler | pattern_scan/auto_evaluate/outcome_resolver/refinement_trigger 4jobs ✅ |
| Auth | Wallet+JWT+JWKS+블랙리스트 8/8 ✅ |
| Screener Sprint 1 | MC/drawdown/supply/pattern/onchain/history 6기준 ✅ |
| Branding | PnL renderer / KOL caption / Twitter auto-post ✅ |
| Stats Engine | PatternStats 5-min TTL ✅ / H-01~H-06 ✅ |

---

**Last updated**: 2026-04-26 A027
**main SHA**: b66a7896
