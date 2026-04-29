# CURRENT — 2026-04-29

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`2baa77c6` — origin/main (2026-04-29) — PR #655 W-0311 WVPL 통합 검증 머지

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0248-f18-stripe-tier` | P0 | 🟢 Merged — PR #653 |
| `W-0306-f5-terminal-mode-toggle` | P1 | 🟢 Merged — PR #652 |
| `W-0309-f4-decision-hud-wiring` | P1 | 🟡 PR #656 — CI 대기 중 |
| `W-0311-quant-risk-engine-v2` | P1 | 🟢 Merged — PR #651 |
| `W-0312-personalization-engine` | P1 | 🟢 코드 머지 — 추가 기능 후속 필요 |
| `W-0313-algorithm-hardening` | P1 | 🟢 Merged — PR #651 |
| `W-0307-f12-kimchi-premium-ui` | P2 | 🟡 Design Draft (#635) |
| `W-0308-f14-pattern-lifecycle-promote-ui` | P1 | 🟡 Design Draft (#636) |

---

## Wave 4 실행 계획 (갭 분석 반영, 2026-04-29)

```
완료:  W-0248 Stripe ✅ | W-0306 F-5 ✅ | W-0311/312/313 퀀트 ✅
즉시:  W-0309 HUD wiring PR #656 머지 대기
Week1: W-0308 F-14 promote UI (S) + W-0307 F-12 kimchi UI (S)
Week2: F-16 recall 개선
Week3: F-19 Sentry + F-20 infra cleanup
Week4: F-30 Ledger 4-table (P2, D6 lock-in: M3 전 스키마 변경 금지)
```

상세: `work/active/W-0252-v00-pattern-search-audit.md`

---

## A081~A083 세션 핵심 lesson

- **CI flaky 근본 fix**: 임계값에 4× 여유 (CI variance ≠ 회귀) [A077]
- **W-number 충돌**: claim 전 origin/main의 work-issue-map 확인 필수 [A078]
- **tier_gate 테스트 격리**: search/captures route 테스트는 dependency_overrides 또는 autouse fixture 필수 [A083]
- **lock file 누락**: 신규 npm 패키지 추가 시 package-lock.json 반드시 같이 커밋 [A083]
- **local main 오염 방지**: 모든 feature 작업은 feat/ 브랜치에서만, main에 직접 커밋 금지 [A083]

---

## Frozen (Wave 4 기간 중 비접촉)

- Copy Trading Phase 1+ (N-05 marketplace → F-60 gate 후)
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)

---

## 다음 실행

```bash
./tools/start.sh
# 즉시: PR #656 W-0309 HUD wiring CI 확인 후 머지
# P1:   W-0308 F-14 promote UI 구현
# P2:   W-0307 F-12 kimchi UI 구현
gh pr checks 656
cat work/active/W-0308-f14-pattern-lifecycle-promote-ui.md
cat work/active/W-0307-f12-kimchi-premium-ui.md
```
