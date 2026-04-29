# CURRENT — 2026-04-29

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`8cf11e4d` — origin/main (2026-04-29) — PR #614 W-0287/0288/0289 검증 테스트 머지

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0297-cursor-grade-code-accuracy` | P1 | ✅ 완료 — AC1(LSP IDE전용)/AC2(serena 다음세션) 구조 검증됨 |
| `W-0283-f11-watching-candidates-impl` | P1 | ✅ 완료 — 30s 자동갱신 PR #620 머지 |
| `W-0295-context-boot-trim` | P2 | ✅ 완료 — 7939→3718 tok (-53%), PR #620 머지 |

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
# Week1: F-3 Telegram deeplink (W-0282) — 다음 P1
# W-0297/W-0300 완료, W-0283/W-0295 완료
cat work/active/W-0282-f3-telegram-deeplink.md
```
