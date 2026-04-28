# CURRENT — 2026-04-29

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`e0b2b2e1` — origin/main (2026-04-29) — PR #613 CURRENT.md W-0299 완료 반영

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0283-f11-watching-candidates-impl` | P1 | 🟡 Design Ready — dashboard P&L 색상 + 30s 갱신 + /patterns/candidates UI |
| `W-0297-cursor-grade-code-accuracy` | P1 | 🟢 Phase A+B 완료 (.mcp.json + LSP allow + agents/) — AC1~AC3 검증 대기 |
| `W-0300-cursor-context-manager` | P1 | 🟡 구현 완료 (/컨텍스트 skill + context-pack.sh) — PR 미생성, AC 검증 대기 |
| `W-0302-git-stash-purge` | P1 | 🟡 git stash 92개 정리 (즉시 실행 가능) |
| `W-0295-context-boot-trim` | P2 | 🟡 Phase 2 — CLAUDE.md ≤90L, AGENTS.md ≤120L |

---

## Wave 4 실행 계획 요약

```
즉시:  W-0302 git stash 92개 정리 (15분) → W-0297 LSP+MCP+agents/ (1.5일)
Week1: F-11 WATCHING (W-0283) / F-3 Telegram deeplink
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
# F-11 WATCHING (W-0283): design ready, backend 존재 → 즉시 구현 가능
# 또는 W-0302 git stash 92개 정리 (15분, 즉시)
cat work/active/W-0283-f11-watching-candidates-impl.md
```
