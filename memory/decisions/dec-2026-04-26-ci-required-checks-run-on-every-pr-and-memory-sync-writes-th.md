---
tier: core
decided_at: 2026-04-26T01:24:13
id: dec-2026-04-26-ci-required-checks-run-on-every-pr-and-memory-sync-writes-th
linked_incidents: []
recorded_at: 2026-04-26T01:24:13
source: manual
status: accepted
tags: ["ci", "memkraft", "w-0163"]
title: CI required checks run on every PR and memory sync writes through PRs, not protected-main direct pushes
type: decision
valid_from: 2026-04-26T01:24:13
valid_to: null
---
# CI required checks run on every PR and memory sync writes through PRs, not protected-main direct pushes

## What
CI required checks run on every PR and memory sync writes through PRs, not protected-main direct pushes

## Why
PR #291 showed admin bypass plus check-name/path-filter drift; Memory Sync failed with GH006 on protected main

## How
Align job names with App CI/Engine Tests/Contract CI, remove PR path filters, enforce admins, add memory.mk protocol validation, create automation/memory-sync-pr-* PRs with MEMORY_SYNC_TOKEN

## Outcome

## Linked Incidents
