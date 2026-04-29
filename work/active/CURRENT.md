# CURRENT — 2026-04-30

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`e8f25075` — origin/main (2026-04-30) — PR #697 W-0249 F-19 Sentry observability merged

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0249-f19-sentry-observability` | P2 | ✅ 완료 (PR #697) |
| `W-0304-multichart-per-pane-indicator-scope` | P2 | 🟡 Design Draft (Codex 진행 중) |

---

## Wave 4 실행 계획 (갭 분석 반영, 2026-04-30)

```
완료:  W-0248 Stripe ✅ | W-0306 F-5 ✅ | W-0307 Kimchi HUD ✅ | W-0308 Lifecycle UI ✅ | W-0247 F-16 recall ✅
즉시:  W-0317 SplitPane wire-up (Codex) + W-0304 per-pane indicator (Codex)
Week3: F-19 Sentry + F-20 infra cleanup
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

## A086 세션 핵심 lesson

- **PR close 전 내용 비교 필수**: `gh pr diff` 읽고 아키텍처/성능/UX 3축 비교 후 close. 내용 확인 없이 "이미 됐다"로 close 금지 [A086]
- **병렬 작업 도메인 분리**: `+page.svelte` 공유 파일은 같은 에이전트에서 순차 처리. Claude(engine+새 UI) / Codex(terminal layout+chart) 분리 [A086]

---

## 다음 실행

```bash
./tools/start.sh
# Codex: W-0317 SplitPane wire-up + W-0304 per-pane indicator
# 중복 이슈 정리: gh issue close 631 617 441
```
