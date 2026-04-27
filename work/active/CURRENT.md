# CURRENT — Wave 4 실행 설계 확정 (2026-04-27)

> 신규 진입자는 `./tools/start.sh` 출력 + 아래 파일만 본다.
> - `spec/CHARTER.md` — product core / frozen gate
> - `spec/PRIORITIES.md` — 전체 우선순위
> - `work/active/W-0252-wave4-final-verified-design.md` — **Wave 4 단일 진실 (3-perspective 검증, 오류 7건 수정)**
> - `docs/live/W-0220-status-checklist.md` — 체크리스트

---

## main SHA

`4367bc94` — origin/main (2026-04-27) — PR #436(V-01) #438(V-06) #440(V-02) #448(cleanup) 머지

---

## 활성 Work Items

### Wave (UX Track) — W-0252 §5 실행 계획 기준

| Work Item | Owner | 상태 |
|---|---|---|
| **F-02-fix** (migration 022 + label 정합) | engine + app | 🔴 **BLOCKER — Week 0 즉시** |
| `W-0237-f4-decision-hud` | app | ⏳ Week 2 (A-2) |
| `W-0243-f5-ide-split-pane` | app | ⏳ Week 2 (A-3, F-4 후) |
| H-07 + H-08 (stats endpoints) | engine | ⏳ Week 1 (C-1, F-02-fix 후) |

### MM Hunter (Research Track) — V layer (다른 에이전트)

> 머지 완료된 design/audit work item 5종은 `work/completed/`로 이동: W-0214 mm-hunter-core-theory, W-0215 pattern-search-py-audit, W-0223 wave1-execution-design, W-0230 tradingview-grade-viz-design, W-0232 h07-f60-gate-design. (PR #415 / #369 / #375 / #392)

| Work Item | Owner | 상태 |
|---|---|---|
| `W-0219-v03-ablation-m2` | research | ⏳ Issue #426 |
| `W-0223-v05-regime-test-m4` | research | ⏳ Issue #428 |
| `W-0221-v08-validation-pipeline` | research | ⏳ Issue #423 — **다음 P0** (V-01+02+04+06 통합) |

---

## ✅ Wave 1 / Wave 2 완료 (코드 실측 확인)

| 항목 | 코드 위치 | 비고 |
|---|---|---|
| A-03-eng `POST /patterns/parse` | `routes/patterns.py:190` | Claude Sonnet 4.6 function calling |
| A-04-eng `POST /patterns/draft-from-range` | `routes/patterns.py:427` | 10 effective features |
| D-03-eng `POST /captures/{id}/watch` | `routes/captures.py:698` | idempotent |
| F-02-eng 5-cat verdict (engine) | `ledger/types.py:54` | ⚠️ 레이블 불일치 → F-02-fix 필요 |
| A-03-app AIParserModal | Wave 2 PR #390 | |
| A-04-app DraftFromRangePanel | Wave 2 PR #386 | |
| D-03-app WatchToggle | Wave 2 PR #383 | |
| F-02-app 5-cat 버튼 UI | Wave 2 PR #381 | |

---

## 🔴 BLOCKER — F-02-fix (즉시)

**레이블 불일치**: 현재 코드 `missed/unclear` ↔ PRD 확정 `near_miss/too_early`

```
migration 022:  missed → near_miss, unclear → too_early
engine/ledger/types.py:54    — VerdictLabel Literal 변경
engine/stats/engine.py:40-41 — F60_WIN_LABELS/DENOM_LABELS 동시 업데이트
app VerdictInboxPanel        — 버튼 텍스트/value 업데이트
```

→ 이 작업 없이 LightGBM 학습 데이터 오염. 모든 Stream 시작 전 완료 필수.

상세: `work/active/W-0252-wave4-final-verified-design.md §1`

---

## Wave 4 실행 계획 (W-0252 §5 기준)

```
Week 0: F-02-fix (BLOCKER) + F-7 Meta automation (1.5일)
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
git checkout main && git pull           # → 4367bc94
./tools/start.sh                        # Agent ID + P0 미완료 항목
gh issue list --search "no:assignee" --state open
```

상세: `work/active/W-0252-wave4-final-verified-design.md`
