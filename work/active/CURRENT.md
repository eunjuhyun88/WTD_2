# CURRENT — 2026-04-29

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`28110150` — origin/main (2026-04-29) — PR #656 W-0309 DecisionHUD live wiring 머지

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0248-f18-stripe-tier` | P0 | 🟢 Foundation merged — PR #653; remaining billing polish/open Qs |
| `W-0307-f12-kimchi-premium-ui` | P2 | 🟡 Design Draft — kimchi_premium_pct Dashboard 노출 (#635) |
| `W-0308-f14-pattern-lifecycle-promote-ui` | P1 | 🟡 Design Draft — Draft→Candidate→Object promote UI (#636) |

---

## Wave 4 실행 계획 (갭 분석 반영, 2026-04-29)

```
완료:  W-0305 F-3 last mile (#639) → W-0306 F-5 mode toggle (#652) → W-0311 WVPL verification (#655) → W-0309 DecisionHUD live (#656)
Week1: W-0308 F-14 promote UI (S) + W-0307 F-12 kimchi UI (S)
Week2: W-0307 F-12 kimchi UI (S) + F-16 recall 개선
Week3: F-19 Sentry + F-20 infra cleanup
Week4: F-30 Ledger 4-table (P2, D6 lock-in: M3 전 스키마 변경 금지)
```

상세: `work/active/W-0252-v00-pattern-search-audit.md`

---

## A077 + A078 세션 핵심 lesson

- **CI flaky 근본 fix**: 임계값에 4× 여유 (CI variance ≠ 회귀) [A077]
- **Stale PR rebase**: design docs 동봉된 PR은 close + minimal 새 PR이 빠름 [A077]
- **블로커 우선**: 1개 fix가 도미노 4개 unblock (#628 → #623/#625) [A077]
- **W-number 충돌**: claim 전 origin/main의 work-issue-map 확인 필수 (W-0306 충돌로 W-0311 재번호) [A078]
- **draft + dirty PR은 자동 머지 불가**: 사용자가 직접 ready + 컨플릭트 해결 [A078]

---

## Frozen (Wave 4 기간 중 비접촉)

- Copy Trading Phase 1+ (N-05 marketplace → F-60 gate 후)
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)

---

## 다음 실행

```bash
./tools/start.sh
# 다음: W-0308 F-14 promote UI 또는 W-0307 F-12 kimchi UI
cat work/active/W-0308-f14-pattern-lifecycle-promote-ui.md
cat work/active/W-0307-f12-kimchi-premium-ui.md
```
