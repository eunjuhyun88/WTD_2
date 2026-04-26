# CURRENT — Wave 2 Complete + H-07 Design (2026-04-27)

> 신규 진입자는 `./tools/start.sh` 출력 + 아래 파일만 본다.
> - `spec/CHARTER.md` — product core / frozen gate
> - `spec/PRIORITIES.md` — Wave 1/2/3 P0/P1/P2
> - `docs/live/W-0220-status-checklist.md` — 체크리스트 (단일 진실)
> - `docs/live/wave-execution-plan.md` — 운영 가이드
> - `work/active/W-0230-tradingview-grade-viz-design.md` — TradingView-grade Viz design
> - `work/active/W-0232-h07-f60-gate-design.md` — H-07 F-60 Gate design (본 PR)

---

## 활성 Work Items

| Work Item | Owner | 상태 |
|---|---|---|
| `W-0223-wave1-execution-design` | contract | PR #369 머지 완료 |
| `W-0230-tradingview-grade-viz-design` | contract | PR #375 머지 완료 |
| `W-0232-h07-f60-gate-design` | contract | 본 PR 진행 중 |

> W-0220 PRD v2.2는 `docs/live/W-0220-product-prd-master.md`로 canonical.

## Wave 2 PRs (전부 머지 완료 ✅)

| PR | Issue | Branch | 상태 |
|---|---|---|---|
| #381 | #379 F-02-app | `feat/F02-app-verdict-5cat-ui-2` | ✅ MERGED |
| #383 | #382 D-03-app | `feat/D03-app-watch-toggle` | ✅ MERGED |
| #386 | #385 A-04-app | `feat/A04-app-chart-drag-draft` | ✅ MERGED |
| #390 | #388 A-03-app | `feat/A03-app-ai-parser-ui` | ✅ MERGED |

→ 모든 핵심 입구 (parser/drag/watch) + 라벨 (5-cat) UI 작동.

## 다음 (Wave 2.5 / Wave 3)

| 항목 | 상태 |
|---|---|
| H-07 F-60 Gate | 본 PR 설계 → 머지 후 H-07-eng + H-07-app 구현 PR 분리 |
| F-3 Telegram → Verdict deep link | 미설계, Wave 2.5 |
| W-0102 Slice 1+2 mop-up | 진행 중 (다른 에이전트) |
| Phase 1.2 Intent 6분류 | Wave 3 (W-0230 §Phase 1.2) |
| Phase 1.3 viz/ 디렉토리 | Wave 3 (W-0230 §Phase 1.3) |
| Phase 2 6 Template Svelte | Wave 4 |
| W-0231 Whale identity | Wave 5 (별도) |

---

## main SHA

`d7587a39` — origin/main (2026-04-27) — PR #390 A-03-app AIParserModal 머지 (Wave 2 4/4 완료)

---

## Core Direction

- ✅ Wave 1 engine (F-02 / A-03-eng / A-04-eng / D-03-eng) — 머지 완료
- ✅ Wave 2 UI (F-02-app / A-03-app / A-04-app / D-03-app) — 머지 완료
- ⏳ Wave 2.5 — H-07 F-60 Gate (본 PR), F-3 Telegram deep link
- ⏳ Wave 3 — Visualization Engine (W-0230 Phase 1)

## Frozen

- Copy Trading Phase 1+ (N-05 marketplace는 F-60 gate 후 별도 ADR 필요)
- 신규 dispatcher / OS / handoff framework 빌드
- Chart UX polish (W-0212류)

## 다음 실행 가이드

```bash
git checkout main && git pull           # → d7587a39
./tools/start.sh                         # Agent ID + 활성 issue
gh issue list --search "no:assignee" --state open
```

상세: `docs/live/wave-execution-plan.md`
