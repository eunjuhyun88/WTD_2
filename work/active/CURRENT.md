# CURRENT — 2026-04-29

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`ca5e7269` — origin/main (2026-04-29) — A077 8-PR sweep (P0 D5 + Wave 4 Week1 + cost tiering)

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0282-v-pv-01-engine-verification-scaffold` | P1 | 🟡 다음 — F-3 Telegram deeplink (1-click verdict) |
| `W-0245-f14-pattern-lifecycle` | P2 | 🟡 Wave 4 Week3 |
| `W-0247-f16-search-recall-verify` | P2 | 🟡 Wave 4 Week3 |
| `W-0248-f18-stripe-tier` | P1 | 🟡 Wave 4 Week3 — D1 Pricing $29 Pro |
| `W-0252-v00-pattern-search-audit` | P2 | 🟡 audit 진행 |

---

## Wave 4 실행 계획 (갱신)

```
✅ A077 (2026-04-29):
   #623 migration fix · #624 F-12 Korea · #626 F-13 Telegram · #628 perf fix
   #629 Haiku tiering · #625 P0 D5 IDE split-pane · #567 mini chart · #627 logs

즉시:   F-3 Telegram deeplink (W-0282) — 다음 P1
Week2: D4 Decision HUD 5-card (P0)
Week3: F-18 Stripe (D1 Pricing) / F-14 Pattern lifecycle / F-16 recall
Week4: F-2 Search UX / F-15 PersonalVariant / F-30 Ledger 4-table
```

상세: `work/active/W-0252-v00-pattern-search-audit.md`

---

## A077 세션 핵심 lesson

- **CI flaky 근본 fix**: 임계값에 4× 여유 (CI variance ≠ 회귀)
- **Stale PR rebase**: design docs 동봉된 PR은 close + minimal 새 PR이 빠름
- **블로커 우선**: 1개 fix가 도미노 4개 unblock (#628 → #623/#625)

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
cat work/active/W-0282-v-pv-01-engine-verification-scaffold.md
```
