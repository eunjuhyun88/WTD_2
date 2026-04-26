# CURRENT — Core Queue Reset (2026-04-26)

> 신규 진입자는 `./tools/start.sh` 출력과 아래 파일만 먼저 본다.
> - `spec/CHARTER.md` — product core / frozen gate
> - `spec/PRIORITIES.md` — compact active P0/P1/P2
> - `spec/CONTRACTS.md` — file-domain locks
> - `work/active/W-0214-product-charter-gate.md` — main-status audit

---

## 활성 Work Items

| Work Item | Owner | 상태 |
|---|---|---|
| `W-0214-product-charter-gate` | contract | PR #347 landed; follow-up audit/sync in progress |

---

## main SHA

`66e5979f` — origin/main (2026-04-26) — PR #346 머지 (W-0145 search corpus 40+dim)

---

## Core Direction

- Core loop: pattern object -> durable state -> search -> ledger -> verdict/refinement.
- Current queue: L6 Ledger durability, L7 Verdict loop, L3 registry-backed patterns.
- W-0145 is now in `main`; any further search work needs a fresh eval/regression work item.

## Frozen

- Copy Trading Phase 2+, MemKraft/Multi-Agent expansion, new slash-command systems, chart polish, Pine Script expansion, agent-session history PRs.

## 다음 실행 가이드

```bash
git checkout main && git pull
./tools/start.sh
cat spec/CHARTER.md
cat spec/PRIORITIES.md
./tools/claim.sh "<file-domain>"
```
