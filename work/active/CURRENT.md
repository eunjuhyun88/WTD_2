# CURRENT — 2026-05-03

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## 신규 진입 에이전트 필독 (4-step)

```
1. spec/NAMING.md     — 탭 이름·SHELL_KEY·파일 경로 계약 (skip 금지)
2. 아래 에이전트 락 테이블 확인 — 내 worktree가 락 걸린 파일 건드리지 않기
3. CLAUDE.md Canonical Read Order 순서 준수
4. 건드리는 경로 → agents/app.md 도메인 게이트 확인
```

---

## 에이전트 락 테이블

| 에이전트 | Worktree | 락된 파일 | 상태 |
|---|---|---|---|
| — | — | — | 모두 free |

---

## main SHA

`1c7edf4f` — origin/main (2026-05-03) — feat(W-0395 Phase 2): dashboard 3-zone redesign (#974)

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0398-layer-c-autotrainer-wiring` | P0 | ✅ PR #968 merged |
| `W-0397-verdict-throughput-booster` | P0 | ✅ PR #965 merged |
| `W-0395-cogochi-pages-v2` | P0 | 🟡 이슈 #955, Wave 6 구현 대기 |
| `W-PF-100-propfirm-master-epic` | P0 | 🟢 P1 완료, P2 대기 (24h live AC 후) |

---

## Wave 5 실행 계획 (2026-05-03)

```
완료:  W-0365 P&L verdict ✅ | W-0366 indicator filters ✅ | W-0367 alpha loop ✅ | W-0368 hardening ✅
완료:  W-0372 Phase A ✅ — AppNavRail 7→5 + MobileBottomNav 5-hub (#826)
완료:  W-0372 Phase B ✅ — hub layouts + Home profile + 5 redirects (#829)
완료:  W-0372 Phase C ✅ — WatchlistRail fold+add/delete + route cleanup (#830)
완료:  W-0372 Phase D ✅ — DecisionHUD + MultiPaneChart + PatternLibraryPanel + VerdictInboxPanel (#835)
완료:  W-0373 ✅ — wallet auth Privy email-first + silent failure fixes (#834)
완료:  W-0358 ✅ — multi-exchange OHLCV ingestion framework (#836)
완료:  W-0374 Phase D-0~D-3 ✅ — Bloomberg UX TopBar + AIAgentPanel 5-tab (#839)
완료:  W-0374 Phase D-4~D-7 ✅ — IndicatorLibrary + DrawingToolbar + drag-to-save + AIAgentPanel 5탭 (#865)
완료:  W-0374 Phase D-8 ✅ — Mobile polish: DrawingToolbar horizontal + ChartBoard min-height + touch swipe (#869)
완료:  W-0374 Phase D-9 ✅ — AI overlay shapes + pattern skeleton + decision auto-refresh (#870)
완료:  W-0379 Phase 0-5 ✅ — 6-layer autoresearch orchestrator + ledger + ensemble strategies (#861)
완료:  W-0379 Phase 6 ✅ — /research/ledger + /research/battle + /research/ensemble + /research/diff + /lab/counterfactual (#862)
완료:  W-0387 ✅ — /agent/judge + /agent/save AI agent LLM verdict + idempotent capture (#904)
완료:  W-0370 ✅ — strategy live signals engine API + frontend (#915)
완료:  fix(cogochi) ✅ — TerminalHub 마운트 + MobileBottomNav 터미널 제외 (#922)
완료:  W-0380 ✅ — dead handlers 제거 + aiQueryRouter 34 tests (#927)
완료:  W-0386 ✅ — scheduler/pipeline/imports code shrink (#928)
완료:  W-0389 ✅ — UX visual typography restructure (#929, #931)
완료:  W-A108 ✅ — verification framework CI gates + 13 typography tests (#926)
완료:  W-0364 ✅ — Upstash distributed rate limiter + engine SWR cache (#933)
완료:  W-0304 ✅ — per-pane indicator store + ChartPane paneId prop (#934)
완료:  W-0390 ✅ — quant UX data layer (TopBar L2 + StatusBar + kbd shortcuts + WatchlistRail FR + Dashboard alerts) (#936)
완료:  W-0391-A ✅ — client RSI/MACD/BB calc + crosshair rAF throttle (#940)
완료:  W-0391-BF ✅ — analytics.ts + ⌘K CommandPalette 5액션 + Landing track (#941)
완료:  W-0391-D ✅ — Dashboard Alert Strip OI/FR/Kimchi 실시간 (#939)
완료:  W-0391-E ✅ — Verdict swipe + Passport 공개 URL (#944)
완료:  W-0355 ✅ — Extreme Events API + IntelPanel 24h section (#945)
완료:  W-0383 ✅ — Counterfactual Review + Filter Attribution Dashboard (#946)
완료:  W-0392 ✅ — ModelRegistry + scoring.trainer + NDCG/MAP/CI eval modules (#952)
완료:  W-0394 PR1 ✅ — scoring.trainer dataset builder + similarity_ranker Layer C blend (#952)
완료:  W-0393 ✅ — TradingView Idea Twin & Hypothesis Compiler (#951)
완료:  W-0394 PR2 ✅ — LightGBM Layer C auto-train pipeline + SearchLayerBadge (#954)
완료:  W-PF-100 P1 ✅ — PropFirm paper auto-execution (PatternRunPanel + router/entry/match/exit + HL feed #783 #787 #802)
완료:  W-0388 ✅ — ESLint hub boundary enforcement (#958)
완료:  docs ✅ — PRIORITIES.md Wave 5 complete + 갱신 규칙 (#964)
완료:  W-0397 ✅ — VerdictInboxPanel 키보드 단축키 + 5s undo + Layer C ETA (#965)
완료:  W-0398 ✅ — Layer C auto-train scheduler wiring + verdict hook (#968)
```

---

## 핵심 lesson (wizardly-lederberg 세션)

- **spec/NAMING.md 필독**: 병렬 브랜치 naming conflict 방지 — `analyze`/`scan` 금지, `verdict`/`research` 사용
- **Contract CI CURRENT.md sync**: active table에 나열된 work item 파일이 실제로 존재해야 함
- **Contract CI 필수 섹션**: Owner / Facts / Canonical Files / Assumptions / Next Steps / Handoff Checklist 전부 있어야 통과
- **W-0372 Phase A lock-in**: /cogochi = Terminal hub 핵심, /terminal → redirect. 5-Hub 확정
- **에이전트 락 테이블**: 파일 수준 충돌 방지 — 내 락 범위 외 파일 수정 금지
- **stash pop 후 CURRENT.md 재확인**: rebase 후 stash pop이 파일을 되돌릴 수 있음

---

## Frozen (Wave 5 기간 중 비접촉)

- Copy Trading Phase 1+
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)
- AI 차트 분석, 자동매매, 신규 메모리 stack

---

## 다음 실행 — Wave 6 P0 구현

```bash
./tools/start.sh
cat work/active/W-0395-cogochi-pages-v2.md
# W-0395 (XL): Cogochi 10페이지 전면 개편 — Phase 0 baseline 수집 → Phase 1 /cogochi
```
