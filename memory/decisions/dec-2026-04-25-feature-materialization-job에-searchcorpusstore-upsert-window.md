---
tier: core
decided_at: 2026-04-25T16:20:36
id: dec-2026-04-25-feature-materialization-job에-searchcorpusstore-upsert-window
linked_incidents: []
recorded_at: 2026-04-25T16:20:36
source: manual
status: closed
tags: ["s", "e", "a", "r", "c", "h", ",", "c", "o", "r", "p", "u", "s", ",", "W", "-", "0", "1", "6", "2"]
title: feature_materialization job에 SearchCorpusStore.upsert_windows() 추가
type: decision
valid_from: 2026-04-25T16:20:36
valid_to: 2026-04-26T00:00:00
---
# feature_materialization job에 SearchCorpusStore.upsert_windows() 추가

## What
feature_materialization job에 SearchCorpusStore.upsert_windows() 추가

## Why
15분마다 job이 돌 때 corpus가 자동으로 채워지도록 — 수동 트리거 없이 자동화

## How
materialize_symbol_window() 끝에 build_corpus_windows() + SearchCorpusStore().upsert_windows() 호출

## Outcome

구현 완료 (2026-04-26 A015 검증): `materialize_symbol_window()` 끝에 `build_corpus_windows()` + `SearchCorpusStore().upsert_windows()` 이미 호출 중. 스케줄러에서 15분마다 자동 실행. 자동화 조건 충족.

## Linked Incidents
