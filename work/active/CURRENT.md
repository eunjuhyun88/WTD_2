# CURRENT — Agent OS W-0264 Domain 설계 완료 + W-0271 Event Store 머지 (2026-04-27)

> 신규 진입자는 `./tools/start.sh` 출력 + 아래 파일만 본다.
> - `spec/CHARTER.md` — product core / frozen gate
> - `spec/PRIORITIES.md` — 전체 우선순위
> - `work/active/W-0252-wave4-final-verified-design.md` — **Wave 4 단일 진실 (3-perspective 검증, 오류 7건 수정)**
> - `docs/live/W-0220-status-checklist.md` — 체크리스트

---

## main SHA

`f502bd3c` — origin/main (2026-04-27) — PR #504 (W-0271 Event Store Phase 1) 머지

---

## 활성 Work Items

### Wave (UX Track) — W-0252 §5 실행 계획 기준

| Work Item | Owner | 상태 |
|---|---|---|
| ~~F-02-fix~~ (migration 023 + label 정합) | engine + app | ✅ **COMPLETE (PR #472, 2026-04-28)** — 운영 DB 검증 #481 |
| `W-0243-f5-ide-split-pane` | app | ⏳ Week 2 (A-3, F-4 후) |
| H-07 + H-08 (stats endpoints) | engine | 🟢 **즉시 가능** (#460, F-02-fix 차단 해제) |

### MM Hunter (Research Track) — V layer (다른 에이전트)

> 머지 완료된 design/audit work item 5종은 `work/completed/`로 이동: W-0214 mm-hunter-core-theory, W-0215 pattern-search-py-audit, W-0223 wave1-execution-design, W-0230 tradingview-grade-viz-design, W-0232 h07-f60-gate-design. (PR #415 / #369 / #375 / #392)

| Work Item | Owner | 상태 |
|---|---|---|

---

## ✅ Wave 1 / Wave 2 완료 (코드 실측 확인)

| 항목 | 코드 위치 | 비고 |
|---|---|---|
| A-03-eng `POST /patterns/parse` | `routes/patterns.py:190` | Claude Sonnet 4.6 function calling |
| A-04-eng `POST /patterns/draft-from-range` | `routes/patterns.py:427` | 10 effective features |
| D-03-eng `POST /captures/{id}/watch` | `routes/captures.py:698` | idempotent |
| F-02-eng 5-cat verdict (engine) | `ledger/types.py:54` | ✅ 5-cat 정합 완료 (PR #437+#472, 2026-04-28) |
| A-03-app AIParserModal | Wave 2 PR #390 | |
| A-04-app DraftFromRangePanel | Wave 2 PR #386 | |
| D-03-app WatchToggle | Wave 2 PR #383 | |
| F-02-app 5-cat 버튼 UI | Wave 2 PR #381 | |

---

## ✅ ~~BLOCKER — F-02-fix~~ 해소 (PR #472, 2026-04-28)

audit 결과 모든 핵심 변경 머지 완료 확인:
- `engine/ledger/types.py:54` Literal 5-cat ✅
- `engine/stats/engine.py:40-41` F60_DENOM_LABELS 5-cat ✅
- `app/supabase/migrations/023_verdict_label_rename.sql` ✅
- `app/src/components/terminal/peek/VerdictInboxPanel.svelte` ✅
- 회귀 테스트 17/17 PASS

**잔여 ⚠️**: 운영 Supabase에 023 적용 여부 미검증 — issue #481.
**Down script**: 반가역 분석으로 forward-only 결정.
**상세**: `work/completed/W-0253-f02-fix-verdict-label.md`

---

## Wave 4 실행 계획 (W-0252 §5 기준)

```
Week 0: ✅ F-02-fix 해소 (PR #472) + F-7 Meta automation (1.5일, post-merge hook 이미 ½ 됨)
Week 1: H-07+H-08 / F-3 Telegram deeplink / F-11 WATCHING
Week 2: F-4 Decision HUD / F-5 IDE split-pane / F-12 Korea features
Week 3: F-18 Stripe / F-14 Pattern lifecycle / F-16 recall
Week 4: F-2 Search UX / F-15 PersonalVariant / F-30 Ledger 4-table
```

병렬 스트림 상세: `work/active/W-0252-wave4-final-verified-design.md §5`

---

## Frozen (Wave 4 기간 중 비접촉)

- Copy Trading Phase 1+ (N-05 marketplace → F-60 gate 후)
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)
- Screener Sprint 2 (20% 결손)

---

## 다음 실행 가이드

```bash
git checkout main && git pull           # → fd54b314
./tools/start.sh                        # Agent ID + P0 미완료 항목
gh issue list --search "no:assignee" --state open
```

상세: `work/active/W-0252-wave4-final-verified-design.md`
