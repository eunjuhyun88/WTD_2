# CURRENT — 2026-04-29

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`ca5e7269` — origin/main (2026-04-29) — PR #625 F-5 split-pane 머지

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0248-f18-stripe-tier` | P0 | 🟡 Design Draft — Stripe $29/mo + x402 USDC 이중 결제 (#445) |
| `W-0305-f3-telegram-deeplink-last-mile` | P1 | 🟡 Design Draft — alerts.py에 verdict URL 포함 XS (#633) |
| `W-0306-f5-terminal-mode-toggle` | P1 | 🟡 Design Draft — Observe/Analyze/Execute 3-mode 토글 S (#634) |
| `W-0307-f12-kimchi-premium-ui` | P2 | 🟡 Design Draft — kimchi_premium_pct Dashboard 노출 S (#635) |
| `W-0308-f14-pattern-lifecycle-promote-ui` | P1 | 🟡 Design Draft — Draft→Candidate→Object promote UI S (#636) |

---

## Wave 4 실행 계획 (갭 분석 반영, 2026-04-29)

```
즉시:  W-0305 F-3 last mile (XS, 1일 미만) → W-0306 F-5 mode toggle (S)
Week1: W-0248 Stripe+x402 결제 (L, 최우선 수익화) + W-0308 F-14 promote UI (S)
Week2: W-0307 F-12 kimchi UI (S) + F-16 recall 개선
Week3: F-19 Sentry + F-20 infra cleanup
Week4: F-30 Ledger 4-table (P2, D6 lock-in: M3 전 스키마 변경 금지 — 마지막)
```

---

## Frozen (Wave 4 기간 중 비접촉)

- Copy Trading Phase 1+ (N-05 marketplace → F-60 gate 후)
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)

---

## 다음 실행

```bash
./tools/start.sh
# 즉시: W-0305 (XS, alerts.py 2줄 수정) → 가장 빠른 win
# P0:   W-0248 Stripe+x402 설계 검토 후 구현 착수
cat work/active/W-0305-f3-telegram-deeplink-last-mile.md
cat work/active/W-0248-f18-stripe-tier.md
```
