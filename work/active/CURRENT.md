# CURRENT — 2026-05-04

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## 신규 진입 에이전트 필독 (5-step)

```
1. spec/NAMING.md     — 탭 이름·SHELL_KEY·파일 경로 계약 (skip 금지)
2. 아래 파일 락 테이블 확인 — 내가 건드릴 파일이 이미 락 걸려 있으면 그 Work Item 스킵
3. 작업 시작 전 락 테이블에 내 항목 추가 후 커밋 (선점 선언)
4. CLAUDE.md Canonical Read Order 순서 준수
5. 건드리는 경로 → agents/app.md 도메인 게이트 확인
```

---

## 파일 락 테이블

> **규칙**: 아래 파일은 이미 다른 에이전트/PR이 소유 중. 해당 파일 수정 전 PR 머지 대기 또는 소유자와 조율.
> 새 작업 시작 시 이 테이블에 행 추가 → 커밋 → 푸시. 완료 시 행 제거.

| PR / 에이전트 | 브랜치 | 락된 파일 (수정 금지) | 상태 |
|---|---|---|---|
| #1024 W-0400-1C | `feat/W-0400-1C-favorites` | `ChartBoard.svelte` `IndicatorLibrary.svelte` `IndicatorCatalogModal.svelte` `catalogFavorites.ts` | 🟡 OPEN — 머지 전 이 파일들 수정 금지 |
| #1023 CSS cleanup | `chore/w0395-css-cleanup` | `ChartBoard.svelte` `BottomSheet.svelte` `DrawerSlide.svelte` `WatchlistItem.svelte` | 🟡 OPEN — 머지 전 이 파일들 수정 금지 |

> ⚠️ **#1024 + #1023 둘 다 ChartBoard.svelte 소유 중 → 충돌 예약 상태**
> 해결 방법: #1023 먼저 머지 → #1024 rebase → 순서대로 머지

---

## 파일 락 등록 절차

```bash
# 작업 시작 전 — 이 테이블에 행 추가
# 예시:
# | W-XXXX 내 작업 | feat/W-XXXX-slug | mountIndicatorPanes.ts ChartBoard.svelte | 🟡 WIP |

# 완료 후 — 행 제거
# 그리고 main SHA 업데이트
```

**파일 충돌 발생 전 체크리스트:**
```bash
# 내가 건드릴 파일을 위 테이블에서 grep
grep -i "ChartBoard" work/active/CURRENT.md   # 이미 락 걸린지 확인
```

---

## main SHA

`ceecad82` — origin/main (2026-05-04) — feat(W-0400 Ph1B): IndicatorCatalogModal + Fuse.js search + / shortcut (#1020)

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0400-ph1c-indicator-catalog-favorites` | P1 | 🟡 PR #1024 OPEN |
| `W-PF-100-propfirm-master-epic` | P0 | 🟢 P1 완료, P2 대기 (24h live AC 검증 후) |

---

## Wave 6 완료 (2026-05-04)

```
완료:  W-0397 ✅ — VerdictInboxPanel 키보드 단축키 + 5s undo + Layer C ETA (#965)
완료:  W-0398 ✅ — Layer C auto-train scheduler wiring + verdict hook (#968, #981)
완료:  W-0400 ✅ — Layer C training observability + F-60 progress dashboard (#987)
완료:  W-0395 Phase 1 ✅ — /cogochi cogochiDataStore v2 + localStorage migration + 18 analytics events (#988)
완료:  W-0395 Phase 2 ✅ — /dashboard 3-zone redesign (#974)
완료:  W-0395 Phase 3 ✅ — /verdict SSR + swipe + edge cache (#979)
완료:  W-0395 Phase 4 ✅ — /patterns SSR + OG meta + ISR cache headers (#982)
완료:  W-0395 Phase 5 ✅ — /passport/[username] SSR + 5 badges + share (#983)
완료:  W-0395 Phase 6 ✅ — Landing live ticker strip BTC/ETH/SOL (#984)
완료:  W-0395 Phase 7 ✅ — /settings /lab /agent thin + placeholder (#985)
완료:  fix(chart) ✅ — TV-style pane indicator labels + dynamic priceFrac (#989)
완료:  W-0399-p2 ✅ — multi-instance indicator × remove + count badge + clientIndicators.ts (#1009)
완료:  W-0400 Ph1A ✅ — extend IndicatorDef + register 10 TV TA indicators (#1010)
완료:  W-0400 Ph1B ✅ — IndicatorCatalogModal + Fuse.js search + / shortcut (#1020)
완료:  W-0395 Ph7 PR2 ✅ — EquityCurve SVG + shared HoldTimeStrip (#1015)
완료:  W-0395 Ph8 Settings PR1 ✅ — 5탭 shell (#1007)
완료:  W-0395 Ph8 Settings PR2 ✅ — Subscription tier card + verdict usage bar (#1014)
완료:  W-0395 Ph1 PR2 ✅ — TRAIN mode QuizStage + train_answers migration (#1012)
완료:  W-0395 Ph8 Landing PR2 ✅ — MiniLiveChart + CTA 4위치 tracking (#1011)
완료:  W-0395 Ph7 PR1 ✅ — /agent/[id] SSR shell + KPI grid (#1006)
```

---

## Wave 5 완료 (2026-05-03)

```
완료:  W-0365 P&L verdict ✅ | W-0366 indicator filters ✅ | W-0367 alpha loop ✅ | W-0368 hardening ✅
완료:  W-0372 Phase A~D ✅ — 5-Hub IA + WatchlistRail + DecisionHUD (#826 #829 #830 #835)
완료:  W-0373 ✅ | W-0358 ✅ | W-0374 Phase D-0~D-9 ✅ | W-0379 Phase 0-6 ✅
완료:  W-0387 ✅ | W-0370 ✅ | W-0380 ✅ | W-0386 ✅ | W-0389 ✅ | W-A108 ✅
완료:  W-0364 ✅ | W-0304 ✅ | W-0390 ✅ | W-0391-A/BF/D/E ✅ | W-0355 ✅ | W-0383 ✅
완료:  W-0392 ✅ | W-0394 PR1+2 ✅ | W-0393 ✅ | W-PF-100 P1 ✅ | W-0388 ✅
```

---

## 핵심 lesson (누적)

- **파일 락 테이블 선점 필수**: 작업 시작 전 위 테이블에 파일 등록. 안 하면 병렬 충돌.
- **같은 파일 두 PR이 동시 소유 = 충돌 예약**: 직렬화 (먼저 머지 → rebase) 필수.
- **spec/NAMING.md 필독**: 병렬 브랜치 naming conflict 방지
- **Contract CI CURRENT.md sync**: active table 파일이 실제 존재해야 통과
- **Contract CI 필수 섹션**: Owner / Facts / Canonical Files / Assumptions / Next Steps / Handoff Checklist
- **font gate CI**: hubs/ 내 font-size < 11px 직접 사용 즉시 CI 실패 → var(--ui-text-xs)
- **Work Item slug**: `W-\d{4}-[a-z0-9][a-z0-9-]*` 소문자 필수 (P2 → p2)

---

## Frozen

- Copy Trading Phase 1+
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)
- AI 차트 분석, 자동매매, 신규 메모리 stack

---

## 다음 실행

```bash
./tools/start.sh
# P0: #1023 CSS cleanup 먼저 머지 → #1024 rebase → W-0400 Ph1C 완료
# 그 다음: W-PF-100 P2 (24h live AC 검증 완료 후)
```
