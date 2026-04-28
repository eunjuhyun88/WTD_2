---
name: W-0112-C TradeMode border sweep 완료 (2026-04-20)
description: TradeMode.svelte 전체 --g3 → --g4 border/divider 업그레이드 완료. 2개 progress-bar track만 --g3 유지.
type: project
---

W-0112-C TradeMode.svelte `--g3` → `--g4` 전수 업그레이드 완료 (2026-04-20 저녁).

**Why:** `--g3:#181c24`가 `--g0:#050608` 배경 대비 거의 안 보임. `--g4:#242932`로 모든 구조적 경계선 교체.

**How to apply:** 이 작업은 완료됨. 앞으로 신규 border 추가 시 `--g3` 사용 금지, `--g4` 이상 사용.

## 변경된 CSS 클래스 목록

- `.ec-divider` background
- `.ec-opt`, `.ec-quick` border
- `.pattern` pill border
- `.ind-tog` border
- `.evidence-badge` border
- `.resizer-pill` background
- `.dh-tab` border-right
- `.analyze-left` border-right
- `.scan-header` border-bottom
- `.act-header` border-bottom
- `.act-div`, `.act-divider` background
- `.judge-tag` border
- `.outcome-btn` border
- `.result-row` border
- `.after-empty` dashed border
- `.past-strip` border-top

## 유지된 --g3 (의도적)

- `.conf-bar` background — progress bar track
- `.sc-sim-bar` background — similarity bar track

## 브랜치

`claude/w-0112-c-indicators` — 커밋 미완료, 작업 진행 중
