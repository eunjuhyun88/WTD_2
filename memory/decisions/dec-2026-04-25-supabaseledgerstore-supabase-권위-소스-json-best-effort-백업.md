---
tier: core
decided_at: 2026-04-25T16:20:36
id: dec-2026-04-25-supabaseledgerstore-supabase-권위-소스-json-best-effort-백업
linked_incidents: []
recorded_at: 2026-04-25T16:20:36
source: manual
status: accepted
tags: ["l", "e", "d", "g", "e", "r", ",", "d", "u", "r", "a", "b", "i", "l", "i", "t", "y", ",", "W", "-", "0", "1", "6", "0"]
title: SupabaseLedgerStore: Supabase 권위 소스 + JSON best-effort 백업
type: decision
valid_from: 2026-04-25T16:20:36
valid_to: null
---
# SupabaseLedgerStore: Supabase 권위 소스 + JSON best-effort 백업

## What
SupabaseLedgerStore: Supabase 권위 소스 + JSON best-effort 백업

## Why
Supabase 장애 시 데이터 손실 방지, JSON은 복구용

## How
append()/save() 에서 Supabase 먼저 write, 성공 후 로컬 JSON 백업

## Outcome

## Linked Incidents
