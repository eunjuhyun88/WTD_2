# App Deploy — Vercel

The app is hosted on Vercel. Production branch is `release`.

## Normal deploy (auto)

1. Merge your feature branch into `release`
2. Commit message must contain `[deploy]` — the `vercel.json` guard skips deploys without it
3. Vercel picks up the push and deploys automatically

```bash
git checkout release
git merge feat/your-branch
git commit --amend -m "feat: describe change [deploy]"
git push origin release
```

## Manual deploy (fallback)

```bash
cd app
vercel deploy --prod
```

Requires Vercel CLI and being authenticated (`vercel login`).

## Environment variables

Set in Vercel dashboard → Project → Settings → Environment Variables:

| Key | Description |
|---|---|
| `ENGINE_URL` | `https://cogotchi-103912432221.asia-southeast1.run.app` |
| `ENGINE_INTERNAL_SECRET` | Shared secret for engine auth header |
| `SUPABASE_URL` | `https://hbcgipcqpuintokoooyg.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `DATABASE_URL` | Direct Postgres URL (for server-side queries) |
| `BETA_OPEN` | Set `true` to bypass allowlist gate entirely |

## Vercel config

`app/vercel.json` controls:
- `deploymentBranchFilter` — only `release` branch triggers production deploy
- Commit message guard — `[deploy]` keyword required

## Cloud Run app (DEPRECATED)

`cloudbuild.app.yaml` builds and deploys the app to Cloud Run (`app-web` service).
This is no longer the production path — use Vercel. The file is kept for reference only.
