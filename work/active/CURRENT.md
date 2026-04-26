# CURRENT — Wave 2 Design Open (2026-04-26)

> 신규 진입자는 `./tools/start.sh` 출력 + 아래 파일만 본다.
> - `spec/CHARTER.md` — product core / frozen gate
> - `spec/PRIORITIES.md` — Wave 1/2/3 P0/P1/P2
> - `docs/live/W-0220-status-checklist.md` — 188항목 체크리스트 (단일 진실)
> - `docs/live/wave-execution-plan.md` — Wave 1→2→3 운영 가이드
> - `work/active/W-0223-wave1-execution-design.md` — Wave 1 정밀 spec (머지 완료)
> - `work/active/W-0230-tradingview-grade-viz-design.md` — Wave 2 UI 설계 (본 PR)

---

## 활성 Work Items

| Work Item | Owner | 상태 |
|---|---|---|
| `W-0223-wave1-execution-design` | contract | PR #369 머지 완료 (Wave 1 spec landed) |
| `W-0230-tradingview-grade-viz-design` | contract | 본 PR 진행 중 (Wave 2 UI 3개 설계만) |

> W-0220 PRD v2.2는 `docs/live/W-0220-product-prd-master.md`로 canonical (PR #362 머지).

## 활성 Wave 1 Engine PRs (다른 에이전트 작업 중)

| PR | Issue | Branch | 상태 |
|---|---|---|---|
| #370 | #364 F-02 Verdict 5-cat | `feat/F02-verdict-5cat` | ✅ **MERGED** (main: 1cfac2e3) |
| #371 | #365 A-03-eng AI Parser | `feat/A03-ai-parser-engine` | OPEN, Contract CI fail |
| #372 | #366 A-04-eng Chart Drag | `feat/A04-chart-drag-engine` | OPEN, Contract CI fail |
| #373 | #367 D-03-eng Watch | `feat/D03-watch-engine` | OPEN, Contract CI fail |

## Wave 2 UI (예정 — Wave 1 머지 후)

| ID | Feature | 선행 |
|---|---|---|
| A-03-app | AI Parser UI | #371 |
| A-04-app | Chart Drag UI (실제 마우스 드래그) | #372 |
| D-03-app | 1-click Watch 버튼 | #373 |

→ 본 PR (W-0230) 머지 + Wave 1 4 PR 머지 후 Issue 등록 + 3 PR 분리.

---

## main SHA

`1cfac2e3` — origin/main (2026-04-26) — PR #370 F-02 Verdict 5-cat 머지 (Wave 1 1/4 완료)

---

## Core Direction

- Core loop: pattern object → durable state → search → ledger → verdict/refinement.
- Real P0 = AI Parser 입구 + 5-cat Verdict 라벨 + Chart Drag (PRD v2.2 §8).
- 이전 P0 (Ledger durability) = ✅ 완료 (W-0215 + W-0145 머지).

## Frozen

- Copy Trading Phase 1+ (N-05 marketplace는 F-60 gate 후 별도 ADR)
- 신규 dispatcher / OS / handoff framework 빌드
- Chart UX polish (W-0212류)

→ Issue/assignee/Project 사용은 Allowed (CHARTER §Coordination)

## 다음 실행 가이드

```bash
git checkout main && git pull
./tools/start.sh
gh issue list --search "no:assignee" --state open    # 비어있는 일감
gh issue edit N --add-assignee @me                    # mutex 획득
git checkout -b feat/{Issue-ID}-{slug}
# 작업 후 PR body에 "Closes #N" + 체크리스트 항목 [x] 토글
```

상세: `docs/live/wave-execution-plan.md`
