# Cogochi — Master PRD + Priority Document

> **CTO + AI Researcher Edition** | 코드 실측 기반 (47c8b148) | 2026-04-28
> **단일 진실**: 이 파일이 Wave / 기능 / 결정 / 지표의 공식 기준. 다른 docs/live/ 파일과 충돌 시 이 파일 우선.
> Charter: `spec/CHARTER.md` In-Scope(L3–L7). Non-Goal 진입 = 즉시 중단.

---

## 0. CTO 현황 요약 (2026-04-28)

```
시스템 성숙도: 88.3% Built (166/188 features)
핵심 인프라: 52 PatternObjects × 85 Building Blocks
           L1~L7 전 레이어 구조 완성
           11 APScheduler jobs 자동 운영 중
           138,915 feature_window rows
주요 엔진:   POST /patterns/parse      ✅ 코드 존재 (Wave 1)
           POST /patterns/draft-from-range ✅ 코드 존재 (Wave 1)
           POST /captures/{id}/watch  ✅ 코드 존재 (Wave 1)
열린 갭:    17개 → **0개** (P0=0 / P1=0 / P2=6 / P3=10) — +F-12 ✅ (#671) kimchi badge + F-14 ✅ (#672) lifecycle promote UI
즉시 P0:   없음 (P0 클리어)
다음 P1:   없음 (P1 클리어) — W-0304 per-pane indicator (Codex 🟡) + W-0317 SplitPane wire-up (Codex 🟡)
퀀트 경화:  **W-0286 ✅ PR #560** + **W-0290~W-0293 ✅ PR #587** + **W-0290 Ph2 ✅ PR #591** + **W-0294 ✅ PR #592**
하네스:     **PR #574 ✅** (verify.py + inventory) + **PR #575 ✅** (Supabase timeout) + **PR #588 ✅** (PID stale lock) + **PR #609 ✅** (reliability repair + cycle-smoke)
```

**가장 위험한 갭 (AI Researcher 진단)**: ~~F-02 레이블 불일치~~ → **✅ 해소 (PR #472, 2026-04-28)**.
audit 결과 `engine/ledger/types.py:54` + `engine/stats/engine.py:40-41` + `app/supabase/migrations/023` + `VerdictInboxPanel.svelte` 모두 5-cat (`valid/invalid/near_miss/too_early/too_late`) 정합 확인. 회귀 테스트 17/17 통과.
**잔여 ⚠️ WARN**: 운영 Supabase에 023 적용 여부 미검증 (issue #481).

**다음 위험 갭**: V-08 validation pipeline 미통합 (#423) — V-01/02/04/06 머지됐으나 통합 검증 pipeline 부재.

---

## 1. Vision + Core Loop

**Cogochi = "Pattern Research OS"**
트레이더가 자연어/드래그로 패턴을 가리키면 → PatternObject로 외화 → 52패턴 × 85블록 카탈로그 합류 → 12개 백그라운드 잡이 매칭·검증·학습 자동 운영.

**차별점**: on-demand search + verdict-validated archive. Broadcasting 시그널 채널 아님.
**단일 페르소나 "Jin"**: 28-38세, 크립토 perp 전업/반전업, WTP $29-79/mo.

```
[Input — 3 modes]
  A. 차트 드래그 → POST /patterns/draft-from-range (12 features 자동 추출)
  B. 자유 텍스트 → POST /patterns/parse → ContextAssembler → claude-sonnet-4-5/4-6
  C. 53 카탈로그 선택 + threshold 수정

[Resolve]   PatternDraft → Validator → SearchQuerySpec
[Search]    3-layer blend: A(40+dim L1, 0.45) + B(LCS phase path, 0.30) + C(LightGBM*, 0.25)
            *Layer C: 코드 BUILT, 미훈련 시 None → 실질 가중 A:0.60 / B:0.40

[Watch]     1-click Watch → pattern_scan 15min → ACCUMULATION alert → capture pending_outcome
[Verdict]   72h → outcome_resolver → HIT/MISS/EXPIRED
            유저 5-cat: valid/invalid/near_miss/too_early/too_late + comment
[Refine]    10+ verdicts → refinement_trigger → Hill Climbing + LightGBM 재학습
[Monetize]  F-60 gate: verdict 200+ × accuracy ≥ 0.55 → 카피시그널 publish
```

---

## 2. Architecture Reality (L1~L7, 코드 검증)

| Layer | 구성 | 상태 | 갭 |
|---|---|---|---|
| **L1** Market Data | 27 modules (Binance/Bybit/Coinbase/OKX) | ✅ | — |
| **L2** Feature Window | migration 021, 40+col, 138,915 rows | ✅ | DESIGN_V3.1 미반영 (F-12) |
| **L3** Pattern Object | **52 PatternObjects × 85 Building Blocks** | ✅ | lifecycle UI (F-14) ✅ PR #672 |
| **L4** State Machine | SQLite WAL + Supabase dual-write, 15m scan | ✅ | — |
| **L5** Search | `engine/search/similar.py:582줄` 3-layer | ✅ | Layer C 미훈련 (F-16) ✅ recall@10=100% PR #687 |
| **L6** Ledger | 8-type Python, Supabase 1-table | ✅ | F-02 ✅ 해소 (W-0253, PR #437+#472) — 운영 DB 검증 #481 |
| **L7** AutoResearch | Hill Climbing + LightGBM Phase A+B | ✅/❌ | Phase C/D GPU 필요 (P3) |

**PARTIAL 3개 (AI Researcher 주의)**:
- `C-11` Layer C LightGBM: predict_one() 존재, 미훈련 시 None 반환. verdicts 50+ 누적 후 자동 활성화됨 — 별도 작업 불필요, **verdicts 속도가 핵심**
- `S-17` 동시 100명+: read-heavy Supabase 라우팅 미검증 — M3 launch 전 부하테스트 필요
- `S-08` ContextAssembler: `engine/agents/context.py` — Wave 1에서 `/parse` 연결 완료. 토큰 예산 Parser ~10K

**Scheduler 11 jobs (APScheduler)**:
```
universe_scan      15m   Alpha Score + block signals
pattern_scan       15m   52패턴 phase 추적
auto_evaluate      15m   알림 품질 피드백 (1h ±1%)
outcome_resolver   1h    capture outcome (72h +15%/-10%)
pattern_refinement daily threshold 개선 제안
refinement_trigger daily 10+ verdicts → Hill Climbing 재학습
alpha_observer     —     Alpha Score 모니터
alpha_warm         —     cache warming
search_corpus      —     feature_windows 업데이트
feature_materialization — 주기적 프리패치
__init__           —     APScheduler 등록
```

---

## 3. Wave Completion (코드 실측 검증)

### ✅ Wave 1 — 완료 (PR #370~#373, 코드 검증됨)

| Feature | 코드 위치 | 검증 |
|---|---|---|
| F-02 engine (5-cat 확장) | `engine/ledger/types.py:54` | ✅ 5-cat 정합 완료 (PR #437+#472, 2026-04-28) — 운영 DB 검증 #481 |
| A-03-eng `POST /patterns/parse` | `engine/api/routes/patterns.py:190` | ✅ Claude Sonnet 4.6 function calling |
| A-04-eng `POST /patterns/draft-from-range` | `engine/api/routes/patterns.py:427` | ✅ 12 features 추출 |
| D-03-eng `POST /captures/{id}/watch` | `engine/api/routes/captures.py:698` | ✅ idempotent |

### ✅ Wave 2 — 완료 (PR #377~#392)

H-07(F-60 gate) / A-03-app(AI Parser UI) / A-04-app(Chart Drag UI) / D-03-app(Watch UI) / H-08(per-user stats) / F-17(Intent Router) / F-30(Ledger 4-table) / L-3(recall verify)

### ✅ Wave 3 — 완료 (Wave 2 병렬 처리)

H-08 / F-30 / F-17

---

## 4. P0 — 현재 집중 (MM Hunter, 즉시)

| Work Item | Feature | 상태 | 비고 |
|---|---|---|---|
| **W-0214** | MM Hunter design D1~D8 | ✅ main (#396) | 설계 완료 |
| **W-0252** | `engine/research/pattern_search.py` V-00 audit | ✅ main (#467) | 100% coverage, F1 미발동, 🔴 갭 2개(D3/D8) → augment-only 진행 |
| **W-0256** | D3 cost + D8 phase taxonomy augment | ✅ main (#478) | 461줄 추가/0줄 삭제, 178/178 PASS |
| **W-0253** | F-60 gate min-samples 경화 | ✅ PR #512 | `F60_MIN_SAMPLES_PER_WINDOW=10`, 13 tests |
| **W-0223** | V-05 regime-conditional return M4 | ✅ PR #507 | RegimeLabel+G7 gate, 19 tests |
| **W-0224** | V-11 gate v2 G1~G7 integration | ✅ PR #508 | GateV2+PromotionPolicy, 16 tests |
| **W-0244** | F-7 meta automation workflows | ✅ PR #505 | CURRENT.md SHA auto-update + worktree cron |
| **W-0254** | F60GateBar UI component | ✅ PR #509 | Svelte 5 dual progress bars + badge |
| **W-0259** | `engine/research/validation/` pipeline 통합 (V-05+V-11 연결) | 🔴 **즉시** (W-0273) | regime_results 플레이스홀더 충전 + GateV2 export |
| **W-0257** | D2 horizon parametrization (4h primary) | ✅ PR #489 MERGED | 구현 완료 2026-04-27 |
| **W-0258** | D5 F-60 Layer B subjective gate | ⬜ Priority B2 (P1) | 설계 #477 머지 |

---

## 5. P0 — 다음 (Wave 4, MM Hunter 이후)

### ~~F-02-fix: Verdict 레이블 정합성~~ ✅ COMPLETE (PR #472, 2026-04-28)

코드 audit 결과 모든 핵심 변경이 머지된 상태로 확인됨:
- `engine/ledger/types.py:54` — Literal 5-cat ✅
- `engine/stats/engine.py:40-41` — `F60_DENOM_LABELS` 5-cat ✅
- `app/supabase/migrations/023_verdict_label_rename.sql` — `UPDATE capture_records` ✅
- `app/src/components/terminal/peek/VerdictInboxPanel.svelte` — 5-cat 버튼 ✅
- 회귀 테스트: `engine/tests/test_user_accuracy.py` 17/17 PASS ✅

**Down script**: 반가역 분석으로 forward-only 결정 (단순 reverse UPDATE 시 데이터 손실).
**⚠️ 잔여 검증**: 운영 Supabase에 023 적용 여부 — issue #481.
**상세**: `work/completed/W-0253-f02-fix-verdict-label.md`

### ~~F-3: Telegram alert → 1-click Verdict deep link (M, 3일)~~ ✅ **완료 (2026-04-29 PR #639 / W-0305)**

```
POST /alerts/{alert_id}/verdict-link → signed JWT (72h TTL, HMAC-SHA256)
포함: { alert_id, capture_id, symbol, pattern_slug, expires_at }
앱: /verdict?token=xxx → 자동 로그인 + VerdictModal 즉시 팝업
목표: 알림 클릭 → verdict 제출 ≤ 30초
```

**AI Researcher 근거**: verdict 제출률이 LightGBM 훈련 속도를 결정함. 알림 → 앱 열기 → 탐색 → verdict = 마찰 최대. Deep link = 마찰 제거.

### F-4: 5-card Decision HUD (M, 4일)

```
카드 1: Pattern Status (phase, alert_count, 최근 capture)
카드 2: Top Evidence (building blocks 상위 3개 + 신호 강도)
카드 3: Risk (invalidation 조건 2-3개)
카드 4: Next Transition (다음 예상 phase + 조건)
카드 5: Actions (Watch / Capture / Verdict / Benchmark)
```

### F-5: IDE-style resizable split-pane (M-L, 5일) ✅ **완료 (2026-04-29 PR #625 / W-0243)**

```
Observe mode:  Chart 70% | HUD 30%
Analyze mode:  Chart 50% | Search results 30% | HUD 20%   (default)
Execute mode:  Chart 40% | Workspace 30% | Quick-trade 30%
CSS Grid, resizable, min-width per pane
```

### F-7: 메타 자동화 (S, 1.5일)

```
① post-merge hook: main push → CURRENT.md SHA 자동 업데이트
② worktree cron: 매일 00:00 → worktree 10개 초과 시 Slack/log 경고
③ spec/PRIORITIES.md validation: D/Q 미확정 항목 출력
④ [✅ W-0269 완료 2026-04-28] Issue lifecycle enforcement
   — /설계 atomic issue 강제 + pre-push gate + CI gate + zombie sweep
```

---

## 6. P1 — M3 출시 전 (Wave 4 실행 순서)

| Feature | Work Item | Effort | 선행 | 코드 현황 |
|---|---|---|---|---|
| F-11 Dashboard WATCHING 풀 구현 | W-0240 | M | — | placeholder BTC/ETH 2-item 정적 코드 |
| F-11 Pattern Candidate Review UI | W-0240 | M | — | `/patterns/candidates` API BUILT |
| ~~F-12 DESIGN_V3.1 features~~ | W-0238 | — | — | ✅ **완료 (2026-04-29 PR #624)** kimchi/session/oi-cvd 9 columns + Upbit fetcher |
| ↳ kimchi_premium / session_apac/us/eu / oi_normalized_cvd | | | | Korea persona 직결 |
| ~~F-13 Telegram Bot 연결 UI~~ | W-0239 | — | — | ✅ **완료 (2026-04-29 PR #626)** 6-char code auth + webhook |
| ↳ 6자리 코드 인증 + 알림 라우팅 설정 | | | | |
| ~~F-14 PatternObject lifecycle~~ | W-0308 | — | — | ✅ **완료 (2026-04-30 PR #672)** lifecycle promote UI + PATCH /status endpoint |
| F-15 PersonalVariant runtime UI | W-0246 | S-M | — | `active_variant_registry.py` BUILT |
| ~~F-16 Search recall@10 ≥ 0.7~~ | W-0247 | — | — | ✅ **완료 (2026-04-30 PR #687)** eval_set 50쿼리 + weights (0.60/0.30/0.10) recall=100% |
| ↳ 50 query eval set + LCS 가중 튜닝 (0.6/0.3/0.1) | | | | |
| ~~H-07 F-60 Gate~~ | W-0238 | — | — | ✅ **완료 (PR #437)** `GET /users/{id}/f60-status` |
| ~~H-08 per-user verdict accuracy~~ | W-0239 | — | — | ✅ **완료 (PR #437)** IN clause 배치 포함 |
| ~~F-18 Stripe $29/mo + tier enforcement~~ | W-0248 | — | — | ✅ **완료 (2026-04-29 PR #653)** Stripe SDK + webhook + quota gate |
| ↳ tier enforcement (Free/Pro) + rate limit + migration 030 | | | | |
| F-19 Sentry + observability | W-0249 | M | — | H-04/H-05 flywheel 체크 BUILT |
| ↳ p95 latency / error rate / cost-per-WAA 대시보드 | | | | |
| F-20~22 Infra cleanup | W-0250 | S | — | Vercel guardrail + GCP Cloud Build |

---

## 7. P2 — M6 출시

| Feature | 비고 |
|---|---|
| **F-30** Ledger 4-table 분리 (entries/scores/outcomes/verdicts) | Python 타입은 4종 분리됨, DB는 1 table (운영 안정성 tradeoff) |
| **F-31** LightGBM Reranker 1차 학습 (verdict 50+, NDCG@5 +0.05) | C-11 PARTIAL → 훈련 후 자동 활성화 |
| **F-32** Capture duplicate detection + selection range 재호출 | |
| **F-33** Negative set curation (hard_negative / near_miss / fake_hit) | AI Researcher: 양질의 negative set이 recall 개선 핵심 |
| **F-34** Isotonic calibration | LightGBM confidence score 신뢰도 보정 |
| **F-35** Regime-conditioned stats (bull/bear/range) | |
| **F-36** Push/Telegram alerts 정밀화 | false positive < 15% gate |
| **F-37** Personal stats panel + Telegram/X 공유 | |
| **F-38** Pattern decay monitor | win_rate 급락 감지 → 자동 비활성화 |
| **F-39** Screener Sprint 2 (Twitter 7% + 섹터 LLM 5% + 이벤트 4% + 봇 2% + 아스터 2%) | Sprint 1 80% BUILT |

---

## 8. P3 — Phase 2+

| Feature | 선행조건 | CTO 메모 |
|---|---|---|
| F-50 LLM Judge (Stage 4 advisory) | reranker 안정 | |
| F-51 Chart Interpreter (multimodal) | F-50 | |
| F-52 Auto-Discovery (새 패턴 후보 제안) | verdict 1000+ | |
| F-53 Multi-TF search + benchmark pack | F-16 | |
| F-54 Team workspace + shared library | M6 후 | |
| **F-55** LambdaRank reranker | verdict 200+ + NDCG label | Layer C LightGBM 이후 단계 |
| F-56 Pattern Wiki 본격화 | Phase 2 | engine/wiki/ BUILT, ingest 일부 |
| F-57 Semantic RAG (pgvector + news) | F-50 직전 | |
| F-59 ORPO/DPO Phase C + per-user LoRA | GPU + 500+ samples | |
| **F-60** 카피시그널 Phase 1 | verdict 200+ × 5패턴 × accuracy ≥ 0.55 | kol_style_engine.py ✅ 준비됨 |
| **F-61** 카피시그널 Phase 2 marketplace | F-60 + KYC + KOL guardrail | N-05/N-06 신규 구현 필요 |

---

## 9. 9-이슈 Canonical 등록 단위 (원소 분류)

> feature-implementation-map.md v3.0 기준. 독립 4개 → 의존 5개 순으로 병렬 시작 가능.

| 이슈 | 기능 | Effort | 선행 | 현재 상태 |
|---|---|---|---|---|
| ~~F-02-fix~~ | ~~Verdict 레이블 정합~~ | ~~S~~ | — | ✅ COMPLETE (PR #472, 2026-04-28) — 운영 DB 검증 #481 |
| **A-03-eng** | `POST /patterns/parse` | — | — | ✅ Wave 1 완료 |
| **A-04-eng** | `POST /patterns/draft-from-range` | — | — | ✅ Wave 1 완료 |
| **D-03-eng** | `POST /captures/{id}/watch` | — | — | ✅ Wave 1 완료 |
| **H-07** | F-60 Gate `GET /users/{id}/f60-status` | — | — | ✅ 완료 (PR #437) |
| **H-08** | per-user verdict accuracy in stats engine | — | — | ✅ 완료 (PR #437) |
| **N-05** | Marketplace listing + subscribe | L | H-07 | P3 |

---

## 10. 의사결정 상태 (D/Q)

### ✅ Lock-in 완료

| # | 결정 | 근거 |
|---|---|---|
| **D8** | 5-cat verdict P0 즉시 | reranker 라벨 = moat. 지연 시 학습 데이터 노이즈 누적 |
| **Q1** | missed vs too_late: **분리** | 학습 노이즈 다름. missed = 패턴 무효, too_late = 타이밍 실패 |
| **Q3** | Chart Drag: **실제 드래그 UI** | D11 forward search mental model 일치. form은 fallback |
| **Q4** | Parser 입력: **자유 텍스트** | Telegram refs 4채널 형식 그대로 붙여넣기 지원 |
| **Q5** | Parser 모델: **claude-sonnet-4-5 또는 4-6** | 둘 다 function calling 안정. 코드 현재 `engine/api/routes/patterns.py:159`는 4-5. Haiku는 KOL caption(M-02)에 사용 |

### ✅ Lock-in 완료 (CTO 확정 2026-04-27)

| # | 결정 | CTO 근거 |
|---|---|---|
| **D1** | Pricing **$29/mo Pro** | 83% gross margin. 7-Doc cost model 적정. 단일 tier = 의사결정 속도 최우선 |
| **D2** | NSM = **WVPL** | 플라이휠 전 구간(input→search→verdict→refine) 포함. 단일 지표로 목표 분산 방지 |
| **D3** | Persona = **Jin 단일** | Anti-persona 확정: casual investor/algo bot/institutional 제외. 단일 페르소나 = 날카로운 제품 결정 |
| **D4** | Decision HUD **5-card** | Pattern/Evidence/Risk/Next/Actions — 정보 아키텍처 완결. F-4 설계 그대로 실행 |
| **D5** | ~~**IDE split-pane**~~ ✅ **완료 (2026-04-29 PR #625)** | 리사이저블 고정 레이아웃 > 자유 캔버스. 집중력 > 자유도. F-5 설계 그대로 |
| **D6** | L6 **1-table 유지** (4-table P2) | M3 전 스키마 변경 금지. F-30은 Week 4 최후순위로 유지 |
| **D7** | L3 **file-first** 유지 | 52패턴 버전 관리 trivial. DB sync = read path. lifecycle UI(F-14)만 추가 |
| **D9** | Wiki = **L7 ledger-driven job** | engine/wiki/ BUILT. 별도 AI agent 시스템 불필요. 야크쉐이빙 방지 |
| **D10** | DESIGN_V3.1 features **즉시 P1** | kimchi_premium = Korea OI 급등 선행지표. Jin 페르소나 핵심. Week 2 F-12 확정 |
| **D11** | **Forward search tool** (복기 저널 아님) | "다음에 무슨 일이?" vs "무슨 일이 있었나?" — 제품 전체 thesis. 영구 lock-in |
| **D12** | 카피시그널 = **F-60 gate 후** | verdict 200+ 없이 publish = 신뢰도 0. Gate = 신뢰 메커니즘, 기술 제약 아님 |
| **D13** | AI Parser = **P0 입구 #1** | /parse Wave 1 완료. 이미 실현됨 |
| **D14** | Chart drag + AI Parser **둘 다 P0** | 둘 다 Wave 1 완료. 이미 실현됨 |
| **D15** | Telegram → **1-click verdict deep link** | verdict 속도 = LightGBM 훈련 속도. 마찰 제거가 플라이휠 속도 결정. F-3 설계 확정 |
| **Q2** | F-60 threshold = **0.55** | random(0.50) 초과 + M1-M3 신호 통과 가능 수준. 90일 후 데이터 기반 재조정 |

---

## 11. Success Metrics + Kill Switch

### NSM: WVPL (Weekly Verified Pattern Loops) per user

| 시점 | 목표 | Kill |
|---|---|---|
| M1 | ≥ 2 | — |
| **M3** | **≥ 3** | < 1.0 → **재설계** |
| M6 | ≥ 4 | total WAA < 1,500 → positioning kill |
| M12 | ≥ 5 | MRR < $40K → GTM 재검토 |

### Funnel @ M3

```
land→signup 4% / signup→capture 55% / capture→search 75%
search→verdict 40% / W1→W4 retention 50%
```

### Search Quality

```
hit@5:      M3 55% / M6 70%
recall@10:  ≥ 0.7 (F-16, 50 query eval set)
reranker:   NDCG@5 vs baseline +0.05 (verdict 50+ 후, F-31)
```

### AI Quality

```
Parser schema compliance ≥ 95% (10 test cases)
Parser confidence ≥ 0.75 @ M3
False positive alert < 15%
LLM hallucination < 0.1/WAA/주
```

### Revenue

```
Free→Pro 5% @ M6
MRR: M3 $1K / M6 $15K / M12 $80K
Churn ≤ 10%/월 / LTV/CAC ≥ 5×
Infra cost/WAA < $8 / p95 < 2s / error < 0.5%
```

### Flywheel Guardrails (GTM 동결 조건)

```
captures_per_day_7d > 0
captures_to_outcome_rate > 0.9
outcomes_to_verdict_rate > 0.5
verdicts_to_refinement_7d > 0
active_models_per_pattern ≥ 1
promotion_gate_pass_rate_30d > 0
```

---

## 12. 수익화 4단계

| Stage | 시점 | 모델 | Gate |
|---|---|---|---|
| 1 | M1-M6 | SaaS Pro $29/mo | WVPL ≥ 3/user |
| 2 | M6-M12 | + Team desk ARPU $200-1000 | F-54 (team workspace) |
| 3 | M12+ | + 카피시그널 알림 구독 | F-60 (verdict 200+ × 5패턴) |
| 4 | M18+ | + Marketplace revenue share | F-61 + KYC + KOL guardrail |

---

## 13. Frozen / Non-Goals

```
❌ Copy Trading 직접 주문 실행 — 영구. 시그널 알림은 OK (F-60), order 실행은 X
❌ TradingView feature parity — 영구
❌ 자동매매 in-product — 영구
❌ Broadcasting-only 시그널 (Alpha Hunter 방식 모방) — 영구
❌ Multi-Agent OS / MemKraft 추가 개발 — 야크쉐이빙
❌ 자유 텍스트 LLM chat (AI Parser 외) — 영구
❌ 모바일 native 앱 — Phase 2+ (PWA 우선)
❌ Free-form floating canvas — 폐기 (IDE split-pane으로 대체)
❌ Portfolio P&L / social comments / options / price prediction
🟢 Paper trading: 검증 도구로 허용 (PRD v3 § 0.3, W-0281 design lock-in PR #543) — 실자금 자동매매는 ❌ 그대로
❌ 성과 수수료 / KOL 유료방 / 초보자 교육 / 블랙박스 SaaS
❌ Customer-facing LLM chat (parser 외)
❌ Pine Script Generator 확장 — W-0211 완료, Phase 2+ LLM-only 보류
```

---

## 14. 즉시 다음 액션 (CTO 지시)

```
1. [즉시]   W-0252 시작 — pattern_search.py:3283줄 audit (V-00) — Issue #462
2. [완료]   F-02-fix — verdict 레이블 이관 PR #437 머지됨 (missed→near_miss + unclear→too_early)
3. [이번 주] F-02-fix migration 022 배포 검증 + stats/engine.py 일관성 확인
4. [이번 주] W-0216 — validation/ 모듈 구현 (W-0252 완료 후, ID 재발번 검토)
5. [다음 주] F-3 Telegram→Verdict deep link / F-4 Decision HUD / F-7 메타 자동화
6. [M1]     F-5 IDE split-pane + F-11 Dashboard WATCHING + H-07 F-60 Gate
```

---

*코드 실측 SHA: 6d7de4fe | CTO+AI Researcher A024 | 2026-04-27 | D/Q 전체 lock-in 완료*

---

## 🛤 2-트랙 병렬 실행 (2026-04-27 분리)

> Wave UX 트랙과 MM Hunter 검증 트랙은 **파일 영역 disjoint** → 동시 실행 가능.
> 다른 에이전트는 시작 전 본인이 어느 트랙인지 확인하고 해당 트랙 work item만 픽업.
> 상세: `docs/live/track-separation-2026-04-27.md`

### Track 1 — Wave (Surface UI / Gate / 입구)

| W-# | Feature | Owner | 상태 |
|---|---|---|---|
| W-0241 | H-07-eng F-60 Gate Status API | engine | ✅ Wave 1 완료 (patterns.py:427) |
| W-0242 | H-07-app F60GateBar UI (W-0254) | app | ✅ PR #509 — F60GateBar.svelte |
| W-0243 | Wave 3 Phase 1.1 W-0102 Slice 1+2 | app | 독립, 즉시 시작 |
| W-0244 | F-7 CURRENT.md auto-SHA + worktree cron | app | ✅ PR #505 |
| W-0234 | F-3 Telegram → Verdict deep link | app+engine | 별도 |

→ 영역: `app/`, `engine/api/routes/users.py`, `engine/stats/engine.py`

### Track 2 — MM Hunter (Engine Core 검증)

| W-# | Feature | Owner | 상태 |
|---|---|---|---|
| W-0214 | MM Hunter Core Theory v1.3 | contract | ✅ LOCKED-IN (#396) |
| W-0252 | V-00 `pattern_search.py` audit (3283줄) | engine | ✅ main (#467) |
| W-0223 | V-05 regime-conditional return M4 | engine | ✅ PR #507 |
| W-0224 | V-11 gate v2 G1~G7 + PromotionPolicy | engine | ✅ PR #508 |
| W-0253 | F-60 gate min-samples hardening | engine | ✅ PR #512 |
| W-0279/W-0280 | V-track core loop closure (V-05 wiring + production runner) | engine | ✅ PR #541 — 170 passed, pipeline wired |
| W-0281 | gate_v2 Phase2 — promote actuator (#548) | engine | 🟡 Design |
| W-0282 | F-3 Telegram verdict deep link impl (#546) | engine+app | 🟡 Design |
| W-0283 | F-11 Dashboard WATCHING + Candidates (#547) | app | 🟡 Design |

→ 영역: `engine/research/`, `engine/research/validation/`

### 트랙 충돌 방지 룰

- Track 1 작업 → `app/src/components/`, `app/src/routes/api/users/`, `app/src/routes/api/captures/`, `engine/api/routes/users.py`, `engine/stats/engine.py`만
- Track 2 작업 → `engine/research/pattern_search.py`, `engine/research/validation/`, MM Hunter 도메인만
- 두 트랙 모두 `docs/live/W-0220-status-checklist.md` 토글 가능 (line-level merge OK)
