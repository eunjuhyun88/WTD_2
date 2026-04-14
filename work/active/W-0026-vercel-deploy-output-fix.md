# W-0026 Vercel Deploy Output Fix

## Goal

Make the Vercel `chatbattle` project deploy cleanly after the workspace root is set to `app`, without stale repo-root output-directory overrides.

## Owner

app

## Scope

- document the deployment failure cause and the final `Root Directory = app` resolution
- remove repo-root Vercel command overrides that conflict with an app-root SvelteKit deployment
- keep the fix limited to Vercel deployment wiring for the SvelteKit app workspace

## Non-Goals

- changing product or engine behavior
- restructuring the app workspace
- provisioning external engine services or runtime environment variables

## Canonical Files

- `work/active/W-0026-vercel-deploy-output-fix.md`
- `vercel.json`
- `app/svelte.config.js`

## Decisions

- the correct long-term Vercel configuration for `chatbattle` is `Root Directory = app`
- once the Vercel project root is `app`, repo-root install/build/output overrides become incorrect and must be removed
- SvelteKit should use its standard adapter-vercel behavior from the app workspace instead of a repo-root output shim

## Next Steps

- push this follow-up branch so `main` no longer runs repo-root-prefixed npm commands after `Root Directory = app`
- rerun one production deploy and confirm it uses the app workspace lockfile and standard SvelteKit build flow
- keep Vercel project settings and repository config aligned so future deploy fixes do not fight each other

## Exit Criteria

- repository `vercel.json` no longer overrides install/build/output paths for repo-root deployment shims
- the production deployment no longer fails on `npm --prefix app ci` after `Root Directory = app` is enabled
- the change remains isolated to deployment wiring
