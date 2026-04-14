# W-0026 Vercel Deploy Output Fix

## Goal

Make the Vercel `chatbattle` project deploy from the repository root without failing on a missing `public` output directory.

## Owner

app

## Scope

- document the deployment failure cause and intended Vercel build artifact path
- update repository-level Vercel configuration so root-based builds expose a deployable output directory
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

- the active failing Vercel project builds from repository root (`Root Directory = .`), so the repo must expose a root-visible deployment artifact
- `app/` remains the SvelteKit workspace, but deployment commands should use `npm --prefix app ...` from repo root
- Vercel should be pointed at `.vercel/output/static` to avoid fallback static-output detection against a stale `public` directory expectation

## Next Steps

- push this branch so Vercel can build a commit that includes the fixed root-level output configuration
- if the project is later reconfigured to `Root Directory = app`, simplify `vercel.json` back to the standard SvelteKit defaults
- rerun one production deploy and inspect the next failure, if any, after the output-directory issue is cleared

## Exit Criteria

- repository Vercel config produces a root-level `.vercel/output` during build
- the deployment no longer fails with `No Output Directory named "public" found after the Build completed`
- the change remains isolated to deployment wiring
