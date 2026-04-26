# CURRENT — Wave 1 Open (2026-04-26)

> 신규 진입자는 `./tools/start.sh` 출력 + 아래 파일만 본다.
> - `spec/CHARTER.md` — product core / frozen gate
> - `spec/PRIORITIES.md` — Wave 1/2/3 P0/P1/P2
> - `docs/live/W-0220-status-checklist.md` — 188항목 체크리스트 (단일 진실)
> - `docs/live/wave-execution-plan.md` — Wave 1→2→3 운영 가이드
> - `work/active/W-0223-wave1-execution-design.md` — Wave 1 정밀 spec

---

## 활성 Work Items

| Work Item | Owner | 상태 |
|---|---|---|
| `W-0223-wave1-execution-design` | contract | 본 PR 진행 중 |

> W-0220 PRD v2.2는 `docs/live/W-0220-product-prd-master.md`로 canonical (PR #362 머지). work item 파일은 별도 안 둠.

## 활성 Wave 1 Issues (4 독립)

| Issue | Feature | Branch | Assignee |
|---|---|---|---|
| #364 | F-02 Verdict 5-cat | `feat/F02-verdict-5cat` | unassigned |
| #365 | A-03-eng AI Parser engine | `feat/A03-ai-parser-engine` | unassigned |
| #366 | A-04-eng Chart Drag engine | `feat/A04-chart-drag-engine` | unassigned |
| #367 | D-03-eng 1-click Watch engine | `feat/D03-watch-engine` | unassigned |

→ 부팅 시 `gh issue list --search "no:assignee"` → 본인 mutex 획득.

---

## main SHA

`ee2060f9` — origin/main (2026-04-26) — PR #361 W-0222 multi-agent coordination 머지

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
