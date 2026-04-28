# CURRENT — 2026-04-29

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`52fb9591` — origin/main (2026-04-29) — PR #616 A080 session close merged

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0283-f11-watching-candidates-impl` | P1 | 🟡 Design Ready — Q-001/Q-002 해소, engine endpoint 설계 완료 |
| `W-0297-cursor-grade-code-accuracy` | P1 | 🟢 Phase A+B 완료 — AC1~AC3 수동 검증 대기 (Claude Code 재시작 필요) |
| `W-0300-cursor-context-manager` | P1 | ✅ PR #609 merged (context-pack.sh + /컨텍스트 skill) |
| `W-0295-context-boot-trim` | P2 | 🟡 Phase 2 — CLAUDE.md ≤90L, AGENTS.md ≤120L (W-0297 의존) |
| `W-0298-haiku-model-tiering` | P1 | 🟡 PR #610 OPEN — 검증/빠른검증/검색 Haiku tiering |

---

## Wave 4 실행 계획 요약

```
즉시:  W-0283 Ph1 engine endpoint (1일) → Ph2 app UI (1일)
Week1: W-0297 AC1~AC3 수동 검증 / W-0295 Ph2 trim
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
# W-0283 Ph1 engine 구현 시작
# engine/patterns/candidate_review_store.py 신규
# engine/api/routes/patterns.py PATCH /{slug}/status 추가
cat work/active/W-0283-f11-watching-candidates-impl.md
```
