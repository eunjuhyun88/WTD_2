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

> **규칙**: 아래 파일을 건드리기 전 이 테이블에 행 추가 → 커밋 → 푸시로 선점.
> 이미 다른 에이전트가 락 건 파일이면 머지 대기 또는 소유자와 조율.
> 완료 후 행 제거.

| PR / 에이전트 | 브랜치 | 락된 파일 | 상태 |
|---|---|---|---|
| #1023 CSS cleanup | `chore/w0395-css-cleanup` | `BottomSheet.svelte` `DrawerSlide.svelte` `WatchlistItem.svelte` + 기타 CSS | 🟡 OPEN |
| — | — | — | 나머지 free |

> **파일 충돌 예방 체크:**
> ```bash
> grep -i "내가건드릴파일명" work/active/CURRENT.md  # 락 여부 먼저 확인
> ```

---

## main SHA

`2a598187` — origin/main (2026-05-04) — fix(dev): bypass auth gate in dev mode (#1074)

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-PF-100-propfirm-master-epic` | P0 | 🟢 P1 완료, P2 대기 (24h live AC 검증 후) |
| `W-PF-100-P2-eval-challenge` | P0 | 🟡 24h live AC 검증 완료 후 착수 |
| `W-0212-chart-ux-polish` | P2 | 🟡 대기 |

---

## Wave 6 완료 (2026-05-04)

```
완료:  W-0397 ✅ — VerdictInboxPanel 키보드 단축키 + 5s undo + Layer C ETA (#965)
완료:  W-0398 ✅ — Layer C auto-train scheduler wiring + verdict hook (#968, #981)
완료:  W-0400 F60 ✅ — Layer C training observability + F-60 progress dashboard (#987)
완료:  W-0395 Phase 1 ✅ — /cogochi cogochiDataStore v2 + analytics 18 events (#988)
완료:  W-0395 Phase 2 ✅ — /dashboard 3-zone redesign (#974)
완료:  W-0395 Phase 3 ✅ — /verdict SSR + swipe + edge cache (#979)
완료:  W-0395 Phase 4 ✅ — /patterns SSR + OG meta + ISR cache headers (#982)
완료:  W-0395 Phase 5 ✅ — /passport/[username] SSR + 5 badges + share (#983)
완료:  W-0395 Phase 6 ✅ — Landing live ticker strip BTC/ETH/SOL (#984)
완료:  W-0395 Phase 7 ✅ — /settings /lab /agent thin + placeholder (#985)
완료:  fix(chart) ✅ — TV-style pane indicator labels + dynamic priceFrac (#989)
완료:  W-0399-p2 ✅ — multi-instance indicator × remove + count badge + clientIndicators.ts (#1009)
완료:  W-0399-P2 ✅ — all Tier-A multi-instance + param edit + × remove + VWAP/ATR tests (#1042)
완료:  W-0401-P1 ✅ — verdict streak distinct-day 카운터 + 5 배지 + StreakCard UI (#1028)
완료:  W-0401-P2+P3 ✅ — inbox dot badge + daily digest email (#1032 #1046 #1049)
완료:  W-0400 Ph1A ✅ — extend IndicatorDef + register 10 TV TA indicators (#1010)
완료:  W-0400 Ph1B ✅ — IndicatorCatalogModal + Fuse.js search + / shortcut (#1020)
완료:  W-0400 Ph1C ✅ — catalogFavorites localStorage + Recents/Favorites sections (#1024)
완료:  W-0395 Ph7 PR2 ✅ — EquityCurve SVG + shared HoldTimeStrip (#1015)
완료:  W-0395 Ph8 Settings PR1+2 ✅ — 5탭 shell + Subscription tier card (#1007 #1014)
완료:  W-0395 Ph1 PR2 ✅ — TRAIN mode QuizStage + train_answers migration (#1012)
완료:  W-0395 Ph8 Landing PR2 ✅ — MiniLiveChart + CTA 4위치 tracking (#1011)
완료:  W-0395 Ph7 PR1 ✅ — /agent/[id] SSR shell + KPI grid (#1006)
완료:  W-0395 Ph6 PR3 ✅ — HoldTimeStrip Lab 패널 wiring (#1051)
완료:  W-0402 ✅ — DB audit migrations 057-063 (verdicted_at + 14 indexes) (#1054)
완료:  W-0402 ✅ — foldable panels + ChartBoardHeader CSS + observe-mode fix (#1072)
```

---

## Wave 5 완료 (2026-05-03)

```
완료:  W-0365~0368 ✅ | W-0372 A~D ✅ | W-0373 ✅ | W-0358 ✅ | W-0374 D-0~D-9 ✅
완료:  W-0379 0-6 ✅ | W-0387 ✅ | W-0370 ✅ | W-0380 ✅ | W-0386 ✅ | W-0389 ✅
완료:  W-A108 ✅ | W-0364 ✅ | W-0304 ✅ | W-0390 ✅ | W-0391-A/BF/D/E ✅
완료:  W-0355 ✅ | W-0383 ✅ | W-0392 ✅ | W-0394 PR1+2 ✅ | W-0393 ✅
완료:  W-PF-100 P1 ✅ | W-0388 ✅ | docs ✅
```

---

## 핵심 lesson (누적)

- **파일 락 테이블 선점 필수**: 작업 시작 전 위 테이블에 파일 등록. 병렬 충돌 방지 핵심.
- **같은 파일 두 PR 동시 소유 = 충돌 예약**: 직렬 머지 (먼저 머지 → rebase) 필수.
- **Work Item slug 소문자**: `W-\d{4}-[a-z0-9][a-z0-9-]*` — P2 → p2, Contract CI 통과 조건.
- **Contract CI active 테이블**: 나열된 work item 파일이 실제 존재해야 통과. 없으면 즉시 제거.
- **font gate CI**: hubs/ 내 font-size < 11px 직접 사용 즉시 CI 실패 → var(--ui-text-xs).
- **rebase 충돌 전략**: HEAD의 typed API (SecondaryIndicatorPayload) 우선 유지 + 내 tracking 추가.

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
# P0: W-PF-100 P2 (24h live AC 검증 완료 후 착수)
cat work/active/W-PF-100-P2-eval-challenge.md
```
