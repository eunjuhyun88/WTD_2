# 0003: Infrastructure + Chart Architecture — 2026-04-21

## Status

Accepted — canonical implementation plan

## Context

As of 2026-04-21 the production deployment has four Cloud Run services, two of which are
dead-weight duplicates in the wrong region. The `ENGINE_URL` in Vercel points at the wrong
service. Capture data lives in SQLite inside the container (lost on every redeploy).
The pattern scan job calls `multiprocessing.spawn` from inside the uvicorn event loop,
which caused an 88-minute API freeze today. There is no Redis cache, no Cloud Scheduler,
and the worker is in `us-east4` while the primary API is in `asia-southeast1`.

This document captures the full cleanup plan, data-persistence migration, and the
TradingView-style capture annotation chart system.

---

## Section 1: Infrastructure Architecture

### 1A. Service Map (target state after cleanup)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GitHub (push)                                                               │
│       │                                                                      │
│       ▼                                                                      │
│  Cloud Build  ──build──►  Artifact Registry                                 │
│               us-east4     us-east4-docker.pkg.dev/...                      │
│                                    │                                         │
│                    ┌───────────────┴───────────────┐                        │
│                    ▼                               ▼                         │
│          cogotchi (API)               cogotchi-worker                        │
│          asia-southeast1              asia-southeast1          (MOVED)       │
│          512Mi / 1vCPU                512Mi / 1vCPU                          │
│          ENGINE_ENABLE_SCHEDULER=false ENGINE_ENABLE_SCHEDULER=false         │
│          SUPABASE_URL ✅              SUPABASE_URL ✅                        │
│          REDIS_URL ✅                 REDIS_URL ✅                           │
│               ▲                               ▲                              │
│               │                               │                              │
│   Vercel (sin1) ──ENGINE_URL──►    Cloud Scheduler (asia-southeast1)         │
│   SvelteKit app                    3 jobs  (POST with OIDC token)            │
│                                               │                              │
│                    ┌──────────────────────────┤                              │
│                    │                          │                              │
│                    ▼                          ▼                              │
│             Supabase                    Binance REST                         │
│  hbcgipcqpuintokoooyg.supabase.co       (public)                            │
│                    ▲                                                          │
│                    │ (both API + worker write)                               │
│                                                                               │
│  Upstash Redis (global edge)  ◄── API kline cache + rate-limit              │
│                               ◄── worker scan state                         │
└─────────────────────────────────────────────────────────────────────────────┘

DELETED:
  cogotchi   (us-east4)   — duplicate, wrong region, no Supabase env
  wtd-2      (us-east4)   — legacy service, superseded by cogotchi
```

**Latency rationale:** Vercel sin1 (Singapore) → cogotchi asia-southeast1 (Singapore) is
~1-5ms same-region hop. The previous `ENGINE_URL` pointed at `us-east4` (+200ms round-trip
to Virginia from Singapore for every user request).

---

### 1B. Services to DELETE

**cogotchi (us-east4)**

Reason: Exact duplicate of the asia-southeast1 service. No Supabase env vars are set,
so any capture writes there silently fail into local SQLite which is container-ephemeral.
Running both wastes ~$5-8/month and splits traffic logs.

```bash
gcloud run services delete cogotchi \
  --region=us-east4 \
  --project=notional-impact-463709-e3 \
  --quiet
```

**wtd-2 (us-east4)**

Reason: Legacy service name from before the `cogotchi` rename. No longer referenced by any
production client (`app/src/lib/server/engineClient.ts` and Vercel `ENGINE_URL` both must
be updated away from it). Wastes ~$3-5/month.

```bash
gcloud run services delete wtd-2 \
  --region=us-east4 \
  --project=notional-impact-463709-e3 \
  --quiet
```

**Worker APScheduler → Cloud Scheduler migration**

The current `cogotchi-worker` runs APScheduler inside the Cloud Run container
(`ENGINE_ENABLE_SCHEDULER=true`). This means the Cloud Run instance must stay warm
permanently to fire scheduled jobs, costing money at min-instances=1. It also makes the
scheduler instance stateful: if it crashes or redeploys, the in-memory job state is lost.

Cloud Scheduler is a fully managed, regional cron service that costs ~$0.10/job/month
(free tier: 3 jobs = $0). It sends authenticated HTTP POST requests to the worker endpoint
at the scheduled time. The worker becomes a pure HTTP handler — stateless, min-instances=0,
cold-start only when triggered.

Migration: set `ENGINE_ENABLE_SCHEDULER=false` on the worker, add the 3 Cloud Scheduler
jobs below, then redeploy.

---

### 1C. Services to CREATE or MODIFY

**Move cogotchi-worker to asia-southeast1**

```bash
# Deploy the same image to asia-southeast1, disable APScheduler, set min=0
gcloud run deploy cogotchi-worker \
  --image=us-east4-docker.pkg.dev/notional-impact-463709-e3/cloud-run-source-deploy/wtd-worker-control:latest \
  --region=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --platform=managed \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=2 \
  --set-env-vars="ENGINE_ENABLE_SCHEDULER=false" \
  --no-allow-unauthenticated
```

Note: `--no-allow-unauthenticated` — Cloud Scheduler will supply an OIDC token; no public
access needed.

After verifying the new region is healthy, delete the old us-east4 worker:

```bash
gcloud run services delete cogotchi-worker \
  --region=us-east4 \
  --project=notional-impact-463709-e3 \
  --quiet
```

**Add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to cogotchi API**

```bash
gcloud run services update cogotchi \
  --region=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --set-env-vars="SUPABASE_URL=https://hbcgipcqpuintokoooyg.supabase.co,SUPABASE_SERVICE_ROLE_KEY=<secret>"
```

Replace `<secret>` with the value from Supabase Project Settings → API → service_role key.

**Add REDIS_URL to both services (Upstash free tier)**

After creating the Upstash Redis instance (Section 4 cost analysis: free tier 256MB):

```bash
# API service
gcloud run services update cogotchi \
  --region=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --update-env-vars="REDIS_URL=rediss://:TOKEN@global-hostname.upstash.io:6379"

# Worker service
gcloud run services update cogotchi-worker \
  --region=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --update-env-vars="REDIS_URL=rediss://:TOKEN@global-hostname.upstash.io:6379"
```

**Fix ENGINE_URL in Vercel env**

In the Vercel dashboard (or via `vercel env`), update:

```
ENGINE_URL=https://cogotchi-<hash>-as.a.run.app
```

The exact URL can be retrieved with:

```bash
gcloud run services describe cogotchi \
  --region=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --format="value(status.url)"
```

Current wrong value in `.env.local`:

```
ENGINE_URL=https://wtd-2-3u7pi6ndna-uk.a.run.app   ← DELETE this
```

---

### 1D. Cloud Scheduler Setup

All three jobs target the asia-southeast1 worker. Each uses an OIDC token bound to the
Cloud Run invoker role so the worker's `--no-allow-unauthenticated` flag is satisfied.

First, identify or create a service account for the scheduler:

```bash
# Create a dedicated SA if one does not exist
gcloud iam service-accounts create cogotchi-scheduler \
  --display-name="Cogotchi Cloud Scheduler SA" \
  --project=notional-impact-463709-e3

# Grant it permission to invoke the worker Cloud Run service
gcloud run services add-iam-policy-binding cogotchi-worker \
  --region=asia-southeast1 \
  --member="serviceAccount:cogotchi-scheduler@notional-impact-463709-e3.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --project=notional-impact-463709-e3
```

Store the worker URL in a shell variable:

```bash
WORKER_URL=$(gcloud run services describe cogotchi-worker \
  --region=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --format="value(status.url)")
```

**Job 1: pattern-scan — every 15 minutes**

```bash
gcloud scheduler jobs create http pattern-scan \
  --location=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --schedule="*/15 * * * *" \
  --uri="${WORKER_URL}/jobs/pattern_scan/run" \
  --http-method=POST \
  --message-body='{}' \
  --headers="Content-Type=application/json" \
  --oidc-service-account-email="cogotchi-scheduler@notional-impact-463709-e3.iam.gserviceaccount.com" \
  --oidc-token-audience="${WORKER_URL}" \
  --time-zone="UTC" \
  --attempt-deadline=540s \
  --max-retry-attempts=0 \
  --description="Perp universe pattern state-machine scan"
```

**Job 2: outcome-resolver — top of every hour**

```bash
gcloud scheduler jobs create http outcome-resolver \
  --location=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --schedule="0 * * * *" \
  --uri="${WORKER_URL}/jobs/outcome_resolver/run" \
  --http-method=POST \
  --message-body='{}' \
  --headers="Content-Type=application/json" \
  --oidc-service-account-email="cogotchi-scheduler@notional-impact-463709-e3.iam.gserviceaccount.com" \
  --oidc-token-audience="${WORKER_URL}" \
  --time-zone="UTC" \
  --attempt-deadline=300s \
  --max-retry-attempts=1 \
  --description="Resolve pending capture outcomes against price history"
```

**Job 3: auto-capture — every 15 minutes**

```bash
gcloud scheduler jobs create http auto-capture \
  --location=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --schedule="*/15 * * * *" \
  --uri="${WORKER_URL}/jobs/auto_capture/run" \
  --http-method=POST \
  --message-body='{}' \
  --headers="Content-Type=application/json" \
  --oidc-service-account-email="cogotchi-scheduler@notional-impact-463709-e3.iam.gserviceaccount.com" \
  --oidc-token-audience="${WORKER_URL}" \
  --time-zone="UTC" \
  --attempt-deadline=300s \
  --max-retry-attempts=0 \
  --description="Auto-capture pattern entry candidates to Supabase"
```

---

### 1E. Stability Fix: multiprocessing.spawn → asyncio

**Root cause**

`engine/scanner/jobs/pattern_scan.py` line 53:

```python
prewarm_perp_cache(universe, max_workers=5)
```

`prewarm_perp_cache` is implemented in `patterns/scanner.py` using
`ProcessPoolExecutor` (or `multiprocessing.Pool`) with `spawn` start method. When called
from inside an `async def` function on the uvicorn worker thread, the `spawn` call blocks
the entire asyncio event loop until all subprocess workers are created and the pool is
initialised. On a cold container this takes 60-120 seconds. During that window the API
serves no requests — every pending HTTP connection times out. This is the 88-minute freeze
observed today (multiple retries each blocked).

**Fix: asyncio + semaphore**

Replace the synchronous `prewarm_perp_cache` call with an async wrapper that uses
`asyncio.Semaphore(5)` and `asyncio.to_thread` to run individual symbol fetches
concurrently without blocking the event loop. No subprocess spawning.

Target file: `engine/scanner/jobs/pattern_scan.py`

```python
# BEFORE (blocks event loop)
prewarm_perp_cache(universe, max_workers=5)

# AFTER (non-blocking, asyncio-native)
sem = asyncio.Semaphore(5)

async def _fetch_one(symbol: str) -> None:
    async with sem:
        await asyncio.to_thread(_prewarm_single_symbol, symbol)

await asyncio.gather(*[_fetch_one(s) for s in universe], return_exceptions=True)
```

Where `_prewarm_single_symbol(symbol)` is the sync per-symbol cache-warm logic extracted
from `prewarm_perp_cache`. The `asyncio.to_thread` call runs the sync I/O in a thread pool
(not a process pool) — no spawn, no event loop block.

**Priority: HIGH.** This is the only change that prevents the next 88-minute API outage.
It must land before any new Cloud Scheduler job fires `pattern_scan` at high frequency.

---

## Section 2: Data Persistence Migration

### 2A. Supabase Schema

Run the following SQL in the Supabase SQL editor (project `hbcgipcqpuintokoooyg`).

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- capture_records: one row per captured pattern instance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capture_records (
  capture_id                TEXT        PRIMARY KEY,
  capture_kind              TEXT        NOT NULL,          -- "auto" | "manual"
  user_id                   TEXT,                          -- nullable for auto-captures
  symbol                    TEXT        NOT NULL,
  pattern_slug              TEXT        NOT NULL,
  pattern_version           INTEGER     NOT NULL DEFAULT 1,
  phase                     TEXT        NOT NULL,          -- current FSM phase at capture
  timeframe                 TEXT        NOT NULL,          -- e.g. "1h"
  captured_at_ms            BIGINT      NOT NULL,          -- unix epoch ms
  candidate_transition_id   TEXT,
  candidate_id              TEXT,
  scan_id                   TEXT,
  user_note                 TEXT,
  chart_context_json        JSONB       NOT NULL DEFAULT '{}',
  feature_snapshot_json     JSONB,
  block_scores_json         JSONB       NOT NULL DEFAULT '{}',
  verdict_id                TEXT,
  outcome_id                TEXT,
  status                    TEXT        NOT NULL,          -- "open" | "resolved" | "invalid"
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capture_records_transition
  ON capture_records(candidate_transition_id);

CREATE INDEX IF NOT EXISTS idx_capture_records_user_time
  ON capture_records(user_id, captured_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_capture_records_pattern_symbol
  ON capture_records(pattern_slug, symbol, timeframe);

CREATE INDEX IF NOT EXISTS idx_capture_records_status
  ON capture_records(status) WHERE status = 'open';

-- ─────────────────────────────────────────────────────────────────────────────
-- capture_outcomes: one row per resolved capture (ledger entries)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capture_outcomes (
  outcome_id          TEXT        PRIMARY KEY,
  capture_id          TEXT        NOT NULL REFERENCES capture_records(capture_id),
  symbol              TEXT        NOT NULL,
  pattern_slug        TEXT        NOT NULL,
  outcome             TEXT        NOT NULL,  -- "success" | "failure" | "timeout" | "pending"
  fwd_peak_pct        REAL,                  -- max forward return % from entry
  realistic_pct       REAL,                  -- exit-price return % (close of eval window)
  entry_price         REAL,
  peak_price          REAL,
  exit_price          REAL,
  eval_window_bars    INTEGER,               -- how many bars the window covers
  pattern_version     INTEGER     NOT NULL DEFAULT 1,
  feature_snapshot    JSONB,                 -- 92-dim vector at entry
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capture_outcomes_pattern
  ON capture_outcomes(pattern_slug, outcome);

CREATE INDEX IF NOT EXISTS idx_capture_outcomes_capture
  ON capture_outcomes(capture_id);

-- updated_at trigger (shared utility function)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capture_records_updated_at
  BEFORE UPDATE ON capture_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER capture_outcomes_updated_at
  BEFORE UPDATE ON capture_outcomes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### 2B. Migration Path

Ordered steps to migrate in-flight captures from SQLite to Supabase without data loss.

**Step 1 — Create Supabase tables (while old code is still running)**

Run the SQL above. The new tables are additive; nothing reads them yet. Safe to do while
the current deployment is live.

**Step 2 — One-time migration script**

Create `engine/scripts/migrate_sqlite_to_supabase.py`:

```python
"""One-time migration: SQLite capture_records + ledger JSON → Supabase."""
import os
import json
import sqlite3
from pathlib import Path

from supabase import create_client, Client

SQLITE_PATH = Path("state/pattern_capture.sqlite")
LEDGER_DIR  = Path("ledger_data")

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
sb: Client = create_client(url, key)

# ── 1. Migrate capture_records ─────────────────────────────────────────────
conn = sqlite3.connect(SQLITE_PATH)
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT * FROM capture_records").fetchall()
records = [dict(r) for r in rows]

# Postgres expects JSONB columns as parsed objects, not strings
for r in records:
    for col in ("chart_context_json", "feature_snapshot_json", "block_scores_json"):
        if isinstance(r[col], str):
            r[col] = json.loads(r[col]) if r[col] else {}

BATCH = 500
for i in range(0, len(records), BATCH):
    sb.table("capture_records").upsert(records[i:i+BATCH]).execute()

print(f"Migrated {len(records)} capture_records")

# ── 2. Migrate ledger outcomes ─────────────────────────────────────────────
outcomes = []
for json_file in LEDGER_DIR.rglob("*.json"):
    try:
        data = json.loads(json_file.read_text())
        outcomes.append({
            "outcome_id":       data.get("id"),
            "capture_id":       data.get("capture_id"),
            "symbol":           data.get("symbol"),
            "pattern_slug":     data.get("pattern_slug"),
            "outcome":          data.get("outcome", "pending"),
            "fwd_peak_pct":     data.get("fwd_peak_pct"),
            "realistic_pct":    data.get("realistic_pct"),
            "entry_price":      data.get("entry_price"),
            "peak_price":       data.get("peak_price"),
            "exit_price":       data.get("exit_price"),
            "eval_window_bars": data.get("eval_window_bars"),
            "pattern_version":  data.get("pattern_version", 1),
            "feature_snapshot": data.get("feature_snapshot"),
        })
    except Exception as exc:
        print(f"Skip {json_file}: {exc}")

# Filter out rows with null outcome_id (malformed files)
outcomes = [o for o in outcomes if o["outcome_id"]]

for i in range(0, len(outcomes), BATCH):
    sb.table("capture_outcomes").upsert(outcomes[i:i+BATCH]).execute()

print(f"Migrated {len(outcomes)} capture_outcomes")
conn.close()
```

Run the script on a box that has network access to Supabase and has the SQLite file
accessible (e.g. copy the SQLite out of the container first via `gcloud run executions`
or by temporarily enabling min-instances=1 and shell access):

```bash
# Copy SQLite out of the running container
gcloud run services describe cogotchi-worker --region=asia-southeast1 --format="value(status.url)"
# Use Cloud Run exec (if enabled) or mount a GCS bucket to exfiltrate the file

# Run migration locally
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python engine/scripts/migrate_sqlite_to_supabase.py
```

**Step 3 — Deploy new env vars**

```bash
gcloud run services update cogotchi \
  --region=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --update-env-vars="SUPABASE_URL=https://hbcgipcqpuintokoooyg.supabase.co,SUPABASE_SERVICE_ROLE_KEY=<key>,CAPTURE_STORE_BACKEND=postgres"

gcloud run services update cogotchi-worker \
  --region=asia-southeast1 \
  --project=notional-impact-463709-e3 \
  --update-env-vars="CAPTURE_STORE_BACKEND=postgres"
```

**Step 4 — Verify**

```bash
# Trigger one auto-capture job manually
curl -X POST "${WORKER_URL}/jobs/auto_capture/run" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=${WORKER_URL})"

# Check Supabase table count
# In Supabase SQL editor:
SELECT count(*) FROM capture_records WHERE created_at > now() - interval '5 minutes';
```

**Step 5 — Remove SQLite dependency**

Once Step 4 confirms writes are landing in Supabase:
1. Delete `engine/state/pattern_capture.sqlite` from the repo's `.gitignore` exclusion list
   and add a hard error in `CaptureStore.__init__` if `CAPTURE_STORE_BACKEND=sqlite` and
   `SUPABASE_URL` is not set.
2. Remove `engine/state/` from Cloud Run container in the next image build.

---

### 2C. Feature Flag

Add `CAPTURE_STORE_BACKEND` env var (values: `postgres` | `sqlite`, default: `sqlite` for
local dev backward compatibility).

Implementation in `engine/capture/store.py`:

```python
import os

BACKEND = os.environ.get("CAPTURE_STORE_BACKEND", "sqlite").lower()

def get_capture_store() -> "AbstractCaptureStore":
    if BACKEND == "postgres":
        from capture.postgres_store import PostgresCaptureStore
        return PostgresCaptureStore(
            supabase_url=os.environ["SUPABASE_URL"],
            service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return CaptureStore()   # existing SQLite implementation
```

`PostgresCaptureStore` implements the same `save()`, `get()`, `list_open()` interface as
`CaptureStore` so callers require no changes. During the transition window both backends
can coexist: local dev keeps SQLite (no Supabase creds needed), staging/prod uses
`CAPTURE_STORE_BACKEND=postgres`.

---

## Section 3: TradingView-Style Chart System

### 3A. Two-View Architecture

**View A — Live Monitor** (existing `ChartBoard.svelte`, extended)

```
ChartBoard.svelte (2694 lines, LWC v5)
├── CanvasHost.svelte                  ← existing LWC canvas mount
├── ChartHeader.svelte                 ← existing symbol/TF header
├── overlay/PhaseBadge.svelte          ← existing
├── overlay/RangeModeToast.svelte      ← existing
├── primitives/PhaseZonePrimitive.ts   ← existing phase zone bands
├── primitives/RangePrimitive.ts       ← existing drag-range rectangle
├── primitives/EvalWindowPrimitive.ts  ← NEW: evaluation window shaded band
├── primitives/EntryVerticalPrimitive.ts  ← NEW: vertical line at entry bar
├── primitives/OutcomeZonePrimitive.ts    ← NEW: success/failure price zone
└── [captureAnnotations prop]          ← NEW: CaptureAnnotation[] fed from 60s poll
```

**View B — Capture Review Drawer** (new component tree)

```
VerdictInboxSection.svelte             ← existing, adds "Chart" button per row
└── CaptureReviewDrawer.svelte         ← NEW: slide-in drawer (right side, 420px)
    └── CaptureReviewChart.svelte      ← NEW: standalone LWC chart for one capture
        ├── CanvasHost.svelte          ← reused
        ├── primitives/EvalWindowPrimitive.ts    ← same primitive as View A
        ├── primitives/EntryVerticalPrimitive.ts ← same primitive as View A
        └── primitives/OutcomeZonePrimitive.ts   ← same primitive as View A
```

---

### 3B. New Engine Endpoints

Both endpoints live in `engine/api/routes/captures.py` (create this file if it does not
already exist as a full route module, or add to the existing captures router).

**Endpoint 1: Bulk chart annotations for a symbol**

```
GET /captures/chart-annotations?symbol=BTCUSDT&tf=1h
```

Response shape:

```python
class ChartAnnotationsResponse(BaseModel):
    symbol: str
    tf: str
    annotations: list[CaptureAnnotationItem]

class CaptureAnnotationItem(BaseModel):
    capture_id: str
    pattern_slug: str
    phase: str
    captured_at_ms: int          # unix epoch ms — maps to LWC Time (seconds)
    status: str                  # "open" | "resolved" | "invalid"
    outcome: str | None          # "success" | "failure" | "timeout" | None
    entry_price: float | None
    tp1_price: float | None      # from chart_context_json.target_1
    stop_price: float | None     # from chart_context_json.stop
    eval_window_bars: int | None
    fwd_peak_pct: float | None
    capture_kind: str            # "auto" | "manual"
    user_note: str | None
```

Implementation note: `tp1_price` and `stop_price` are stored in `chart_context_json`
(a JSONB column in Supabase). Extract with:

```python
chart_ctx = record.chart_context_json or {}
tp1_price  = chart_ctx.get("target_1") or chart_ctx.get("tp1")
stop_price = chart_ctx.get("stop")     or chart_ctx.get("stop_price")
```

**Endpoint 2: Per-capture historical bars for the review chart**

```
GET /captures/{capture_id}/chart-context?bars_before=100&bars_after=80
```

Response shape:

```python
class CaptureChartContextResponse(BaseModel):
    capture_id: str
    symbol: str
    tf: str
    annotation: CaptureAnnotationItem   # same type as above
    bars: list[OHLCVBar]                # fetched from kline cache / Binance

class OHLCVBar(BaseModel):
    time: int        # unix seconds (LWC Time format)
    open: float
    high: float
    low: float
    close: float
    volume: float
```

The endpoint fetches `bars_before + bars_after + 1` bars centred on `captured_at_ms`
from the existing `cache/kline_cache.py` layer (Redis-first, CSV fallback).

Add to `engine/api/main.py`:

```python
from api.routes import captures as captures_router
app.include_router(captures_router.router, prefix="/captures")
```

---

### 3C. New Frontend Files

| File | Action | Purpose |
|------|--------|---------|
| `engine/api/routes/captures.py` | CREATE or extend | `/captures/chart-annotations` + `/captures/{id}/chart-context` |
| `app/src/components/terminal/chart/primitives/EvalWindowPrimitive.ts` | CREATE | Shaded horizontal band spanning evaluation window |
| `app/src/components/terminal/chart/primitives/EntryVerticalPrimitive.ts` | CREATE | Vertical line at entry bar time |
| `app/src/components/terminal/chart/primitives/OutcomeZonePrimitive.ts` | CREATE | Coloured price zone (green=success, red=failure) |
| `app/src/components/terminal/workspace/CaptureReviewChart.svelte` | CREATE | Standalone LWC chart for single capture, mounts the three new primitives |
| `app/src/components/terminal/workspace/CaptureReviewDrawer.svelte` | CREATE | Slide-in drawer that wraps `CaptureReviewChart` |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | MODIFY | Add `captureAnnotations: CaptureAnnotation[]` prop + mount primitives on the live chart |
| `app/src/lib/components/patterns/VerdictInboxSection.svelte` | MODIFY | Add "Chart" icon button per row; on click opens `CaptureReviewDrawer` |
| `app/src/routes/api/engine/captures/chart-annotations/+server.ts` | CREATE | SvelteKit proxy to `GET /captures/chart-annotations` |
| `app/src/routes/api/engine/captures/[id]/chart-context/+server.ts` | CREATE | SvelteKit proxy to `GET /captures/{id}/chart-context` |

---

### 3D. LightweightCharts Primitive Specs

**EvalWindowPrimitive** — evaluation window shaded band

- Copy base from: `PhaseZonePrimitive.ts` (it already draws a time-range vertical band)
- Draw method:
  ```
  ctx.fillStyle = "rgba(250, 200, 50, 0.08)"   // amber tint
  ctx.fillRect(x_start, y_top, x_end - x_start, chart_height)
  // top/bottom dashed border lines:
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = "rgba(250, 200, 50, 0.35)"
  ctx.strokeRect(x_start, y_top, x_end - x_start, chart_height)
  ```
- Inputs: `{ startTime: Time, endTime: Time }`
- Z-order: `paneViews()` returns a single view with `zOrder: "bottom"` — renders below candles

**EntryVerticalPrimitive** — vertical line at entry bar

- Copy base from: `RangePrimitive.ts` (it has canvas coordinate helpers)
- Draw method:
  ```
  ctx.setLineDash([6, 3])
  ctx.strokeStyle = "#22d3ee"   // cyan-400 (matches VerdictBanner entry color)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x_entry, 0)
  ctx.lineTo(x_entry, chart_height)
  ctx.stroke()
  // Label above the line:
  ctx.fillStyle = "#22d3ee"
  ctx.font = "10px monospace"
  ctx.fillText("ENTRY", x_entry + 4, 12)
  ```
- Input: `{ time: Time, label?: string }`
- Z-order: `paneViews()` returns `zOrder: "normal"` — same plane as series

**OutcomeZonePrimitive** — price zone between entry and target/stop

- Copy base from: `PhaseZonePrimitive.ts`
- Draw method: horizontal band between `y_price_low` and `y_price_high`
  ```
  // success zone (entry → tp1):
  ctx.fillStyle = "rgba(34, 197, 94, 0.12)"   // green-500 at 12%
  // failure zone (entry → stop):
  ctx.fillStyle = "rgba(239, 68, 68, 0.12)"   // red-500 at 12%

  ctx.fillRect(x_start, y_price_high, chart_width - x_start, y_price_low - y_price_high)
  // Dashed border on the target line:
  ctx.setLineDash([5, 3])
  ctx.strokeStyle = success ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)"
  ctx.beginPath()
  ctx.moveTo(x_start, y_target)
  ctx.lineTo(chart_width, y_target)
  ctx.stroke()
  ```
- Inputs: `{ startTime: Time, entryPrice: number, targetPrice: number, isSuccess: boolean }`
- Z-order: `paneViews()` returns `zOrder: "bottom"` — below candles, above EvalWindowPrimitive

---

### 3E. Marker Data Contract

```typescript
// app/src/lib/contracts/captureAnnotation.ts

export interface CaptureAnnotation {
  captureId: string;
  patternSlug: string;
  phase: string;
  /** Unix seconds — LightweightCharts Time format */
  time: number;
  status: "open" | "resolved" | "invalid";
  outcome: "success" | "failure" | "timeout" | null;
  entryPrice: number | null;
  tp1Price: number | null;
  stopPrice: number | null;
  evalWindowBars: number | null;
  fwdPeakPct: number | null;
  captureKind: "auto" | "manual";
  userNote: string | null;
}

/** Convert engine API response item to frontend contract */
export function annotationFromEngine(raw: {
  capture_id: string;
  pattern_slug: string;
  phase: string;
  captured_at_ms: number;
  status: string;
  outcome: string | null;
  entry_price: number | null;
  tp1_price: number | null;
  stop_price: number | null;
  eval_window_bars: number | null;
  fwd_peak_pct: number | null;
  capture_kind: string;
  user_note: string | null;
}): CaptureAnnotation {
  return {
    captureId:      raw.capture_id,
    patternSlug:    raw.pattern_slug,
    phase:          raw.phase,
    time:           Math.floor(raw.captured_at_ms / 1000),  // ms → seconds
    status:         raw.status as CaptureAnnotation["status"],
    outcome:        raw.outcome as CaptureAnnotation["outcome"],
    entryPrice:     raw.entry_price,
    tp1Price:       raw.tp1_price,
    stopPrice:      raw.stop_price,
    evalWindowBars: raw.eval_window_bars,
    fwdPeakPct:     raw.fwd_peak_pct,
    captureKind:    raw.capture_kind as CaptureAnnotation["captureKind"],
    userNote:       raw.user_note,
  };
}
```

`ChartBoard.svelte` prop signature addition:

```typescript
// In ChartBoard.svelte <script lang="ts">
let { captureAnnotations = [] }: { captureAnnotations?: CaptureAnnotation[] } = $props();
```

---

### 3F. Real-time Update Strategy

Capture markers on the live chart (View A) must stay current as new captures are written
by the Cloud Scheduler jobs every 15 minutes.

Strategy: 60-second interval poll against the SvelteKit proxy route.

```typescript
// In ChartBoard.svelte, after the symbol/tf change reactive block:

let captureAnnotations = $state<CaptureAnnotation[]>([]);
let annotationPollTimer: ReturnType<typeof setInterval> | null = null;

async function refreshAnnotations() {
  try {
    const res = await fetch(
      `/api/engine/captures/chart-annotations?symbol=${activeSymbol}&tf=${activeTf}`
    );
    if (!res.ok) return;
    const data = await res.json();
    captureAnnotations = (data.annotations ?? []).map(annotationFromEngine);
  } catch {
    // silent — stale annotations are better than a broken chart
  }
}

$effect(() => {
  // Re-subscribe when symbol or timeframe changes
  const sym = activeSymbol;
  const tf  = activeTf;

  if (annotationPollTimer) clearInterval(annotationPollTimer);
  refreshAnnotations();                                  // immediate first load
  annotationPollTimer = setInterval(refreshAnnotations, 60_000);

  return () => {
    if (annotationPollTimer) clearInterval(annotationPollTimer);
  };
});
```

The 60s interval is intentional: Cloud Scheduler fires every 15 minutes so there is no
benefit to polling faster. The interval also avoids hammering the engine proxy with a
symbol that has no new captures.

For the Capture Review Drawer (View B), annotations are loaded once on open (no polling
needed — historical data does not change).

---

## Section 4: Cost Analysis

| Service | Current State | After Optimization | Est. Monthly Cost |
|---------|---------------|-------------------|------------------|
| cogotchi API (asia-southeast1) | Live, no Supabase env | Keep, add SUPABASE + REDIS env | $0-3 |
| cogotchi API (us-east4) | Live, duplicate | **DELETE** | saves $5-8 |
| cogotchi-worker (us-east4) | Live, APScheduler always-on | Move to asia-southeast1, min=0, HTTP-triggered | $2-4 (down from ~$8 always-on) |
| wtd-2 (us-east4) | Live, legacy | **DELETE** | saves $3-5 |
| Cloud Scheduler | None | Create 3 jobs (asia-southeast1, free tier ≤3 jobs) | $0.30 |
| Upstash Redis | None | Free tier 256MB, 10K req/day | $0 |
| Artifact Registry | Exists | Keep as-is | ~$0 (storage <1GB) |
| Supabase | Exists, worker only | Add capture tables, connect API | $0 incremental (free tier) |

**Current estimated total:** ~$18-24/month (4 services running, all min-instances > 0)

**After optimization:** ~$5-10/month (2 services, worker min=0, 2 services deleted)

**Net saving: ~$10-15/month** (41-62% reduction)

---

## Section 5: Implementation Order

### P0 — Infrastructure (this week, ~2 hours total)

| # | Task | Est. Time | Notes |
|---|------|-----------|-------|
| 1 | Delete cogotchi (us-east4) + wtd-2 | 10 min | See 1B commands above |
| 2 | Fix ENGINE_URL in Vercel env → cogotchi asia-southeast1 | 5 min | Must do before deleting wtd-2 |
| 3 | Add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to cogotchi API service | 5 min | `gcloud run services update` |
| 4 | Create Supabase capture_records + capture_outcomes tables | 30 min | Run SQL in Section 2A |
| 5 | Deploy cogotchi-worker to asia-southeast1, min=0, SCHEDULER=false | 30 min | New deploy + delete old us-east4 worker |
| 6 | Create 3 Cloud Scheduler jobs | 20 min | See Section 1D commands |
| 7 | Upstash Redis free tier + add REDIS_URL to both services | 15 min | Upstash console + `gcloud run services update` |

**Note:** Steps 1 and 2 must be done in order: update ENGINE_URL first, verify the app
still works against asia-southeast1, then delete wtd-2.

---

### P1 — Data & Stability (next week)

| # | Task | Est. Time | Notes |
|---|------|-----------|-------|
| 8 | SQLite → Supabase migration script + run migration | 2h | Section 2B; includes exfiltrating SQLite from container |
| 9 | Fix multiprocessing.spawn → asyncio in pattern_scan.py | 3h | Section 1E; HIGH priority to prevent next API freeze |

**Note:** Step 9 (the asyncio fix) is the most important stability change. Do it before
increasing Cloud Scheduler frequency or adding new patterns to the scan universe.

---

### P2 — TradingView Chart System (following sprint)

| # | Task | Est. Time | Notes |
|---|------|-----------|-------|
| 10 | Engine: `/captures/chart-annotations` + `/captures/{id}/chart-context` endpoints | 4h | Section 3B; requires Supabase connected (P0 step 3) |
| 11 | Frontend: EvalWindowPrimitive + EntryVerticalPrimitive + OutcomeZonePrimitive | 3h | Section 3D; copy from existing primitives |
| 12 | Frontend: CaptureReviewChart + CaptureReviewDrawer | 4h | Section 3A View B |
| 13 | Frontend: ChartBoard captureAnnotations prop + 60s poll | 3h | Section 3E/3F; Svelte 5 `$props` + `$effect` |
| 14 | Frontend: VerdictInboxSection "Chart" button → opens CaptureReviewDrawer | 2h | Section 3A connection point |

Steps 10-14 are sequentially dependent: 10 must ship before 11-14 can be tested end-to-end.
Steps 11-14 can be developed in parallel against mock data and connected to the real engine
in the final integration pass.

---

## Rejected Alternatives

**Keep APScheduler in the worker** — rejected because it requires min-instances=1 ($8/month
always-on) and loses job state on redeploy. Cloud Scheduler is free for ≤3 jobs, regionally
co-located with the worker, and retries failed jobs automatically.

**Use Vercel KV instead of Upstash** — Vercel KV is Upstash under the hood but billed
through Vercel at higher rate. Direct Upstash account gives free-tier access and is
accessible from both Cloud Run and Vercel.

**Keep SQLite** — rejected because Cloud Run containers are stateless. Any redeploy
(triggered by a new image push or auto-scaling) wipes the container filesystem and loses
all capture history that has not been read out. Supabase is already in use by the worker
and costs nothing incremental on the free tier.

**WebSockets for live annotation sync** — rejected in favour of 60s polling. The
annotation data changes every 15 minutes (Cloud Scheduler cadence), so a WebSocket
connection would be open 99.8% of the time with no data flowing. HTTP polling has lower
infrastructure complexity and sufficient freshness.

---

## Section 6: Vercel Environment Audit

### 6A. Current State

**Project:** `cogochi-2` (eunjuhyun88s-projects/cogochi-2)
**Region:** `sin1` (Singapore) — correctly paired with GCP `asia-southeast1`

**Production env (10 vars):**

| Variable | Status | Notes |
|----------|--------|-------|
| ENGINE_URL | ✅ Set (1h ago) | Must point to cogotchi asia-southeast1 URL |
| UPSTASH_REDIS_REST_URL | ✅ Set (3d ago) | Rate limiting + sharedCache live |
| UPSTASH_REDIS_REST_TOKEN | ✅ Set (3d ago) | Rate limiting + sharedCache live |
| NVIDIA_API_KEY | ✅ Set (7d ago) | LLM fallback |
| CEREBRAS_API_KEY | ✅ Set (1h ago) | Primary LLM inference |
| GROQ_API_KEY / GROQ_API_KEYS | ✅ Set (1h ago) | Fast inference |
| DEEPSEEK_API_KEY | ✅ Set (1h ago) | LLM reasoning |
| MISTRAL_API_KEY | ✅ Set (1h ago) | LLM fallback |
| KIMI_API_KEY | ✅ Set (1h ago) | LLM fallback |
| DATABASE_URL | ❌ Missing | **All Supabase DB writes will fail in production** |

**Preview has 46 vars; Production has 10.** Everything below exists in Preview but not Production.

---

### 6B. Missing from Production — Priority Order

#### P0 — Breaks core features immediately

| Variable | Impact if missing |
|----------|-----------------|
| `DATABASE_URL` | Verdict writes, capture history, trajectory data all fail silently |
| `DATABASE_URL__COGOCHI_2` | Same — app likely tries both |

#### P1 — Breaks data panels and intel (market data)

| Variable | Feature impact |
|----------|--------------|
| `COINGECKO_API_KEY` | Coin metadata, price charts, trending |
| `COINALYZE_API_KEY` | Funding rate, OI, liquidation data (core intel panel) |
| `CRYPTOQUANT_API_KEY` | On-chain flow data |
| `ETHERSCAN_API_KEY` | Wallet intel, on-chain data |
| `DUNE_API_KEY` | Advanced on-chain analytics |
| `ALCHEMY_API_KEY` / `ALCHEMY_RPC_URL` | RPC for wallet analysis |
| `LUNARCRUSH_API_KEY` | Social sentiment signals |
| `FRED_API_KEY` | Macro indicators (DXY, rates) |

#### P2 — Additional capabilities

| Variable | Feature impact |
|----------|--------------|
| `TELEGRAM_BOT_TOKEN` | Alert notifications |
| `GEMINI_API_KEY` | Multi-model comparison features |
| `QWEN_API_KEY` | LLM fallback pool |
| `OPENROUTER_API_KEY` | Model routing |
| `SERPER_API_KEY` / `TAVILY_API_KEY` | Web search for research agent |
| `CRYPTORANK_API_KEY` | Token rankings + narrative data |

---

### 6C. Supabase Connection — Critical Path

The app uses `DATABASE_URL` (Postgres connection string from Supabase) for all data writes.
Currently **zero** of these env vars are in Production:

```
DATABASE_URL
DATABASE_URL__COGOCHI_2
SUPABASE_URL            (if used directly via supabase-js client)
SUPABASE_ANON_KEY       (if used directly via supabase-js client)
SUPABASE_SERVICE_ROLE_KEY
```

Check which style the app uses:

```bash
# From app/ dir — determine which client is used
grep -r "DATABASE_URL\|SUPABASE_URL\|createClient" app/src/lib/server/ --include="*.ts" -l
```

Then copy the values from Preview to Production.

---

### 6D. ENGINE_URL Verification

The `ENGINE_URL` was just set 1h ago in Production. Verify it is pointing at the correct service:

```bash
# Check what URL was set (redacted but you can see the domain)
vercel env ls production | grep ENGINE_URL

# Correct URL format:
# https://cogotchi-<hash>-as.a.run.app  (asia-southeast1)
# NOT:
# https://cogotchi-<hash>-ue.a.run.app  (us-east4)  ← old/wrong
# NOT:
# https://wtd-2-<hash>-uk.a.run.app     (us-east4)  ← legacy, to be deleted
```

The domain suffix tells you the region:
- `-as.a.run.app` = asia-southeast1 ✅
- `-ue.a.run.app` = us-east4 ❌
- `-uk.a.run.app` = us-east4 ❌

---

### 6E. Vercel → GCP Data Flow

```
Browser
  │
  ▼
Vercel Edge (sin1, Singapore)
  │  SvelteKit SSR / API routes
  │  reads: UPSTASH_REDIS (edge cache)
  │  reads: DATABASE_URL → Supabase (verdict display)
  │  reads: COINGECKO/COINALYZE/etc (market data panels)
  │
  ├──POST /api/analyze → ENGINE_URL (cogotchi asia-southeast1)
  ├──GET  /api/patterns/candidates → ENGINE_URL
  ├──POST /api/captures/bulk_import → ENGINE_URL
  │
  ▼
cogotchi (asia-southeast1, ~1-5ms)
  │  FastAPI engine
  │  reads: Binance REST (market data)
  │  reads/writes: Supabase (captures, verdicts, trajectories)
  │  reads/writes: Upstash Redis (kline cache, rate state)
  │
  ▼
cogotchi-worker (asia-southeast1)  ← triggered by Cloud Scheduler
  │  pattern scans, outcome resolution, ML training
  │  writes: Supabase (scan results, outcome records)
```

---

### 6F. Immediate Actions (to do alongside P0 infra cleanup)

```bash
# Step 1: Verify ENGINE_URL domain suffix (run from app/)
cd app && vercel env pull .env.production.local --environment=production
grep ENGINE_URL .env.production.local
rm .env.production.local  # don't commit this

# Step 2: Copy DATABASE_URL from Preview to Production
vercel env add DATABASE_URL production
# Paste the value from .env.local or from Supabase dashboard

# Step 3: Add P1 data API keys to Production
# (run vercel env add <KEY> production for each missing key)
# Use .env.local as the source — it has all Preview values
```

The app is currently **read-only in production** — market data panels may work (if the
API routes call the engine which has its own data keys), but any write path
(verdicts, captures, user preferences, trajectory data) silently fails because
`DATABASE_URL` is absent.

---

## Section 7: TradingView-급 Capture Chart — 최종 완성 설계 (2026-04-21)

### 7A. 완료된 것 (PR #149 + #150, commit 614e96ad)

```
엔진
  jobs.py          — Cloud Scheduler 4개 엔드포인트 + ResourceGuard
                     (Redis lock + adaptive throttle + circuit breaker)
  captures.py      — GET /captures/chart-annotations?symbol=&timeframe=&limit=
                     (60s poll feed, outcome verdict join 포함)
                     + _auto_capture_job() (priority dedup, max 20/run)
  main.py          — jobs router 등록

GCP
  db-cleanup       — Cloud Scheduler job (daily 02:00 UTC)
                     7d retention: engine_alerts, opportunity_scans
                     90d retention: terminal_pattern_captures

Supabase
  0013_capture_records.sql
                   — capture_records 테이블 + indexes + RLS
                     (service_role bypass / auth uid / auto rows)
                     + updated_at trigger

Frontend (LWC v5 primitives)
  CaptureMarkerPrimitive.ts   — vertical entry line + stop/tp1/tp2 horiz lines
                                + phase badge (status별 색상)
  EvalWindowPrimitive.ts      — shaded eval window zone
                                (blue=pending / amber=needs review /
                                 green=valid / red=invalid)
  captureAnnotationsStore.ts  — 60s polling Svelte store
  CaptureAnnotationLayer.svelte — headless; primitive lifecycle on LWC series
  CaptureReviewDrawer.svelte  — verdict form right-rail drawer
  ChartBoard.svelte           — Layer 3 wire-up (22줄 추가)
```

### 7B. TradingView-급 렌더링 스펙

```
시간축 (X)
  ● 캡처 시점 = captured_at_s (unix seconds)
  ● 평가 윈도우 끝 = captured_at_s + eval_window_ms/1000
  ● 위 두 점 사이 = shaded zone (EvalWindowPrimitive)

가격축 (Y)
  ── entry_price    파란 실선 ──────────── (진입)
  ── stop_price     빨간 점선 ──────────── (손절)
  ── tp1_price      초록 실선 ──────────── (TP1)
  ── tp2_price      연초록 실선 ─────────── (TP2)

배지 (badge)
  [PHASE 72%]  ← phase명 + p_win%
  색상: 회색=pending / 노랑=needs review / 초록=valid / 빨강=invalid

클릭 → CaptureReviewDrawer
  ├─ 패턴명, phase, status
  ├─ entry/stop/tp1/tp2 가격표
  ├─ eval window 시간
  ├─ verdict 버튼 (valid / missed / invalid)
  └─ POST /api/engine/captures/{id}/verdict
```

### 7C. 미완료 — 다음 스프린트 필수 (W-0121~W-0124)

#### W-0121: Supabase capture_records sync (P0 — 데이터 영속성)
**문제:** Cloud Run restart 시 SQLite 소실 → 패턴 이력 전부 날아감

```python
# captures.py _capture_store.save() 직후에 추가 (fire-and-forget)
async def _mirror_to_supabase(record: CaptureRecord) -> None:
    try:
        sb = _get_supabase_client()
        await asyncio.to_thread(
            sb.table("capture_records").upsert(
                _record_to_supabase_dict(record)
            ).execute
        )
    except Exception as e:
        log.warning("supabase mirror failed: %s", e)
        # Non-fatal — SQLite is still source of truth
```

**구현 체크리스트:**
- [ ] `_get_supabase_client()` 싱글턴 (env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- [ ] `_record_to_supabase_dict()` — SQLite Row → Supabase insert dict
- [ ] `captures.py: save()` 후 `asyncio.create_task(_mirror_to_supabase(record))`
- [ ] `outcome_resolver.py: update_status()` 후 동일 mirror
- [ ] Supabase migration 실행 (0013_capture_records.sql — SQL 준비 완료)

#### W-0122: Supabase migration 실행
```sql
-- Supabase Dashboard > SQL Editor에서 직접 실행
-- 파일: app/db/migrations/0013_capture_records.sql (이미 작성 완료)
```
MCP 연결 불가 → Dashboard에서 수동 실행 필요

#### W-0123: cogotchi-worker 삭제 + Cloud Run 최적화
**현재:** worker가 아무것도 안 함 (Cloud Scheduler가 cogotchi API 직접 호출)

```bash
# Worker 삭제
gcloud run services delete cogotchi-worker \
  --project=notional-impact-463709-e3 \
  --region=us-east4 --quiet

# cogotchi CPU 최적화 (always-on 대신 CPU throttling)
gcloud run services update cogotchi \
  --project=notional-impact-463709-e3 \
  --region=us-east4 \
  --cpu-throttling \        # idle시 CPU 0 → cold start ~1s 증가 but 비용 -60%
  --min-instances=1         # keep warm for UX
```

비용 절감 예상:
| 항목 | 현재 | 최적화 후 |
|------|------|---------|
| cogotchi-worker | ~$6/mo (min=0이지만 가끔 spin-up) | $0 (삭제) |
| cogotchi CPU throttling | N/A | -$3~5/mo |
| **합계** | ~$18-24/mo | **~$9-15/mo** |

#### W-0124: 클릭 이벤트 연결 (chart click → capture selection)

현재 `CaptureAnnotationLayer`는 `onSelect` prop을 받지만 **LWC click 이벤트가 아직 연결 안 됨**.
ChartBoard에서 `mainChart.subscribeClick()` 추가 필요:

```typescript
// ChartBoard.svelte — chart 초기화 직후 추가
mainChart.subscribeClick((param) => {
  if (!param.time) return;
  const clickedTimeS = param.time as number;
  // captureAnnotationsStore에서 가장 가까운 annotation 찾기
  // TODO: store.find(ann => Math.abs(ann.captured_at_s - clickedTimeS) < 2 * barWidth)
});
```

### 7D. 최종 데이터 흐름 (완성 후)

```
Cloud Scheduler (*/15min)
  └─► POST /jobs/auto_capture/run
        └─► ResourceGuard (Redis lock + throttle + circuit)
              └─► _auto_capture_job()
                    ├─► SQLite: CaptureRecord.save()
                    └─► Supabase: capture_records.upsert() [W-0121]

브라우저 (60s poll)
  └─► GET /api/engine/captures/chart-annotations?symbol=BTCUSDT&timeframe=1h
        └─► SvelteKit proxy → cogotchi /captures/chart-annotations
              └─► SQLite: list() + ledger outcome join
                    └─► CaptureAnnotation[]

LWC Chart (CaptureAnnotationLayer)
  ├─► CaptureMarkerPrimitive × N  (entry/stop/tp lines)
  └─► EvalWindowPrimitive × N     (shaded zones)

클릭 → CaptureReviewDrawer
  └─► POST /api/engine/captures/{id}/verdict
        └─► ledger.save(outcome) + SQLite.update_status()
              └─► Supabase mirror [W-0121]
```

### 7E. 구현 완료 기준 (Definition of Done)

- [ ] `GET /api/engine/captures/chart-annotations` → 200, 캡처 목록 반환
- [ ] ChartBoard에 phase badge + price lines visible (캡처 있을 때)
- [ ] EvalWindow shaded zone 보임
- [ ] click → CaptureReviewDrawer 열림 (W-0124 완료 후)
- [ ] Verdict submit → POST 200 + drawer 닫힘 + 색상 업데이트
- [ ] Cloud Run restart 후에도 capture 이력 유지 (W-0121 완료 후)
- [ ] cogotchi-worker 삭제 확인 (W-0123 완료 후)
- [ ] `/api/engine/jobs/status` → `redis_connected: true`, 4개 jobs last_ok 있음
