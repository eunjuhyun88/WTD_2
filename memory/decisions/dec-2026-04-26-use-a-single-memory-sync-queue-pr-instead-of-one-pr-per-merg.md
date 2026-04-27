---
tier: core
decided_at: 2026-04-26T03:46:17
id: dec-2026-04-26-use-a-single-memory-sync-queue-pr-instead-of-one-pr-per-merg
linked_incidents: []
recorded_at: 2026-04-26T03:46:17
source: manual
status: accepted
tags: ["ci", "memory", "W-0163"]
title: Use a single memory sync queue PR instead of one PR per merged PR
type: decision
valid_from: 2026-04-26T03:46:17
valid_to: null
---
# Use a single memory sync queue PR instead of one PR per merged PR

## What
Use a single memory sync queue PR instead of one PR per merged PR

## Why
Concurrent automation/memory-sync-pr-* branches all edited memory/sessions and CURRENT.md from stale bases, causing repeated conflicts and stale status.

## How
Memory Sync now serializes runs, reuses automation/memory-sync-queue, records PR events idempotently, and keeps CURRENT.md dates in Asia/Seoul.

## Outcome

## Linked Incidents
