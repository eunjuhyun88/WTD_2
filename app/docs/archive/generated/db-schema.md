# DB Schema Overview

Status:
- provisional derived summary
- source of truth remains migrations under `db/migrations/` and `supabase/migrations/`

## Source Paths

- `db/migrations/`
- `supabase/migrations/`

## Main Data Domains

- auth and sessions
- market snapshots and scan persistence
- arena and arena-war records
- copy trades and unified positions
- tournaments and progression
- passport learning / ML pipeline artifacts
- request rate limits and security support tables

## Usage Rule

Use this file as a first-pass map only. When changing persistence behavior, read the actual migration files.
