---
tier: core
decided_at: 2026-04-25T16:20:36
id: dec-2026-04-25-feature-materialization-job에-searchcorpusstore-upsert-window
linked_incidents: []
recorded_at: 2026-04-25T16:20:36
source: manual
status: accepted
tags: ["s", "e", "a", "r", "c", "h", ",", "c", "o", "r", "p", "u", "s", ",", "W", "-", "0", "1", "6", "2"]
title: feature_materialization job에 SearchCorpusStore.upsert_windows() 추가
type: decision
valid_from: 2026-04-25T16:20:36
valid_to: null
---
# feature_materialization job에 SearchCorpusStore.upsert_windows() 추가

## What
feature_materialization job에 SearchCorpusStore.upsert_windows() 추가

## Why
15분마다 job이 돌 때 corpus가 자동으로 채워지도록 — 수동 트리거 불필요

## How
materialize_symbol_window() 끝에 build_corpus_windows() + SearchCorpusStore().upsert_windows() 호출

## Outcome

## Linked Incidents
