# CURRENT — 2026-04-29

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`631a28c3` — origin/main (2026-04-29) — PR #587 (W-0294/0295/0296/0293 설계 + agents/ + context trim Phase 1) 머지

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0293-1cycle-infra-on` | P0 | 🔴 **즉시** — gcloud env var 1줄 (GAP-B/D) |
| `W-0294-cursor-grade-code-accuracy` | P1 | 🟡 LSP + MCP + agents/ 도메인 분기 |
| `W-0295-context-boot-trim` | P2 | 🟡 Phase 2 — CLAUDE.md ≤90L, AGENTS.md ≤120L |
| `W-0296-automation-harness-runbook` | P2 | ✅ runbook 문서화 완료 |
| `W-0282-v-pv-01-engine-verification-scaffold` | P1 | 📐 설계 lock-in — W-0254 머지 대기 |

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
! gcloud run services update cogotchi-engine \
  --region asia-northeast3 \
  --update-env-vars "ENABLE_PATTERN_REFINEMENT_JOB=true,ENABLE_SEARCH_CORPUS_JOB=true"
```
