# Pattern Ledger Record Cutover

Operator runbook for W-0126 production cutover.

Use this when enabling the shared Supabase-backed `pattern_ledger_records` store for
`engine-api` and `worker-control`.

## Why This Exists

W-0126 moved the code path onto a real record-store boundary, but production still
needs an operator cutover:

- apply migration `018_pattern_ledger_records.sql`
- give trusted engine runtimes the Supabase credentials
- redeploy engine services
- verify `/patterns/stats` reads the shared store without regression

The migration is additive. The rollback is operational, not schema-destructive.

## Canonical Inputs

- [`app/supabase/migrations/018_pattern_ledger_records.sql`](/Users/ej/Projects/wtd-v2/app/supabase/migrations/018_pattern_ledger_records.sql)
- [`docs/runbooks/cloud-run-engine-deploy.md`](/Users/ej/Projects/wtd-v2/docs/runbooks/cloud-run-engine-deploy.md)
- [`docs/runbooks/env-vars.md`](/Users/ej/Projects/wtd-v2/docs/runbooks/env-vars.md)
- [`work/active/W-0126-ledger-supabase-record-store.md`](/Users/ej/Projects/wtd-v2/work/active/W-0126-ledger-supabase-record-store.md)

## Preconditions

- target code includes commit `422c9a1b` or a later mainline equivalent
- Supabase project access with SQL editor or pooler DSN
- `gcloud` access to the target Cloud Run project
- service names and regions for:
  - `engine-api`
  - `worker-control`
- the exact values for:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Runtime Boundary

- `app-web` must not receive `SUPABASE_SERVICE_ROLE_KEY`
- `engine-api` and `worker-control` must receive the same `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- this is required because the shared ledger record store is read on engine request paths such as `/patterns/stats/all`, not only in background jobs

## Step 1: Apply Migration 018

Preferred: run the checked-in SQL file against the Supabase pooler or SQL editor.

Example with `psql`:

```bash
psql "$SUPABASE_POOLER_DSN" -v ON_ERROR_STOP=1 \
  -f app/supabase/migrations/018_pattern_ledger_records.sql
```

Verify the table and indexes:

```sql
select to_regclass('public.pattern_ledger_records');

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'pattern_ledger_records'
order by indexname;
```

Expected indexes:

- `pattern_ledger_records_pkey`
- `plr_slug_created_idx`
- `plr_slug_type_created_idx`

## Step 2: Set Trusted Runtime Env Vars

Update both trusted engine services:

- `SUPABASE_URL=https://<project>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`

Do not set these on `app-web`.

Example:

```bash
gcloud run services update engine-api \
  --region <region> \
  --update-env-vars SUPABASE_URL=https://<project>.supabase.co,SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

gcloud run services update worker-control \
  --region <region> \
  --update-env-vars SUPABASE_URL=https://<project>.supabase.co,SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

If your deploy flow already injects env vars from Cloud Build or secrets, update that source of truth instead of hand-editing the service.

## Step 3: Redeploy Engine Services

Redeploy `engine-api` and `worker-control` using the canonical Cloud Run path.

Examples:

```bash
gcloud builds submit \
  --config cloudbuild.engine.yaml \
  --substitutions _IMAGE=us-east4-docker.pkg.dev/$PROJECT_ID/wtd/engine-api:latest \
  .

gcloud run deploy engine-api \
  --image us-east4-docker.pkg.dev/$PROJECT_ID/wtd/engine-api:latest \
  --region us-east4 \
  --platform managed
```

```bash
gcloud builds submit \
  --config cloudbuild.worker.yaml \
  .
```

Keep the exact service names, regions, and image coordinates aligned with the target environment.

## Step 4: Smoke Check

Verify engine health first:

```bash
curl -fsS https://<engine-host>/healthz
curl -fsS https://<engine-host>/readyz
```

Verify the app-facing stats route:

```bash
curl -fsS https://<app-host>/api/patterns/stats
```

Expected result:

- HTTP `200`
- JSON payload with `ok: true`
- no engine-side `500` for `/patterns/stats/all`

Optional direct engine check:

```bash
curl -fsS https://<engine-host>/patterns/stats/all
```

Use the direct engine check only if that service is intentionally reachable in the target environment.

## Step 5: Post-Cutover Checks

- confirm new capture / outcome / verdict activity increases rows in `pattern_ledger_records`
- compare `/api/patterns/stats` latency before and after cutover
- confirm no app runtime contains `SUPABASE_SERVICE_ROLE_KEY`

Example SQL:

```sql
select record_type, count(*)
from pattern_ledger_records
group by record_type
order by record_type;
```

## Rollback

Rollback is configuration-first:

1. remove `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `engine-api` and `worker-control`
2. redeploy the previous revision or redeploy without those env vars
3. leave `pattern_ledger_records` in place; the migration is additive and does not require destructive rollback

Use rollback if:

- `/patterns/stats` starts returning `500`
- engine startup fails on missing or invalid Supabase credentials
- observed latency regresses materially after cutover

## Out of Scope

- backfilling historical JSON ledger records into Supabase
- changing `compute_family_stats()` from Python aggregation to SQL/RPC aggregation
- widening service-role usage beyond trusted engine runtimes
