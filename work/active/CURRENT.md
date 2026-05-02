# CURRENT — 2026-05-02

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

`97493957` — HEAD (2026-05-03) — W-0389 Phase 1 font fix (#929)

---

## 활성 Work Items

| Work Item | Priority | 상태 | PR |
|---|---|---|---|
| `W-A108-verification-framework` | P0 | 🔵 CI running (lock fix pushed) | [#926](https://github.com/eunjuhyun88/WTD_2/pull/926) |
| `W-0389-ux-visual-typography-restructure` | P1 | 🔵 Ph2-6 on #926 branch | — |
| `W-0304-multichart-per-pane-indicator-scope` | P2 | 🟡 Design Draft | — |

완료 (이번 세션):
- W-0380 ✅ #927 merged — dead handlers 제거 + aiQueryRouter 34 tests
- W-0386 ✅ #928 merged — scheduler 347 / pipeline 118 / imports 12
- W-0389 Ph1 ✅ #929 merged — font-size 357→0 violations
- W-0389 Ph2 ✅ TopBar already complete (H/L/Vol + mode segmented + TF 11px)
- W-0389 Ph3 ✅ AIAgentPanel badges + ChartToolbar emoji→text (0 emoji, 0 select)
- W-0389 Ph4 ✅ StatusBar verdict pill 12px bold amber
- W-0389 Ph5 ✅ Dashboard 4 sections + /lab/health 신설
- W-0389 Ph6 ✅ stylelint 0 violations (AC1 ✅)

---

## Wave 5 실행 계획 (2026-05-02)

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
즉시:  W-0389 — UX visual typography restructure (PRODUCT-DESIGN-PAGES-V2.md P-02 기반)
추후:  W-0304 per-pane indicator
```

---

## 핵심 lesson (A099/A100/A101 세션)

- **spec/NAMING.md 필독**: 병렬 브랜치 naming conflict 방지 — `analyze`/`scan` 금지, `verdict`/`research` 사용
- **Contract CI CURRENT.md sync**: active table에 나열된 work item 파일이 실제로 존재해야 함
- **Contract CI 필수 섹션**: Owner / Facts / Canonical Files / Assumptions / Next Steps / Handoff Checklist 전부 있어야 통과
- **W-0372 Phase A lock-in**: /cogochi = Terminal hub 핵심, /terminal → redirect. 5-Hub 확정
- **에이전트 락 테이블**: 파일 수준 충돌 방지 — 내 락 범위 외 파일 수정 금지

---

## Frozen (Wave 5 기간 중 비접촉)

- Copy Trading Phase 1+
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)
- AI 차트 분석, 자동매매, 신규 메모리 stack

---

## 다음 실행 — W-0389 UX Visual Typography

```bash
./tools/start.sh
cat work/active/W-0389-ux-visual-typography-restructure.md
cat work/active/PRODUCT-DESIGN-PAGES-V2.md
# P-02 /cogochi 스펙 기준 미구현 항목 파악 후 구현
```
