# CURRENT — 2026-04-29

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`04e9ad6d` — origin/main (2026-04-29) — PR #609 W-0299 harness reliability repair 머지

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0293-1cycle-infra-on` | P0 | ✅ gcloud cogotchi(asia-southeast1) ENABLE_*_JOB=true 배포 완료 |
| `W-0298-v-pv-01-impl` | P1 | ✅ PR #604 merged — outcome ledger 기반 verify-paper API |
| `W-0299-harness-reliability-design` | P1 | ✅ PR #609 merged — verify.py + check_drift + hook 신뢰성 수리 |
| `W-0297-cursor-grade-code-accuracy` | P1 | 🟡 LSP + MCP + agents/ 도메인 분기 |
| `W-0295-context-boot-trim` | P2 | 🟡 Phase 2 — CLAUDE.md ≤90L, AGENTS.md ≤120L |
| `W-0296-automation-harness-runbook` | P2 | ✅ runbook 문서화 완료 |

---

## Wave 4 실행 계획 요약

```
즉시:  W-0293 (P0, 5분) → GAP-B/D 인프라 ON
Week1: H-07+H-08 / F-3 Telegram deeplink / F-11 WATCHING
Week2: F-4 Decision HUD / F-5 IDE split-pane / F-12 Korea features
Week3: F-18 Stripe / F-14 Pattern lifecycle / F-16 recall
Week4: F-2 Search UX / F-15 PersonalVariant / F-30 Ledger 4-table
```

상세: `work/active/W-0252-wave4-final-verified-design.md §5`

---

## Frozen (Wave 4 기간 중 비접촉)

- Copy Trading Phase 1+ (N-05 marketplace → F-60 gate 후)
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)

---

## 다음 실행

```bash
./tools/start.sh
# 별도 기능으로 분리된 context/LLM runtime 변경 정리
# W-0297 Cursor-grade context management or W-0295 context trim 중 하나 선택
```
