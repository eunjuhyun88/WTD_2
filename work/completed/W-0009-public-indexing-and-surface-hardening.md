# W-0009 Public Indexing and Surface Hardening

## Goal

Make the public app surfaces safer to expose to real users by fixing search-indexing basics, reducing accidental indexing of private/API routes, and establishing a small but real verification baseline for discoverability-critical behavior.

## Owner

app

## Scope

- public indexing foundations for `app`
- canonical site URL handling for public pages
- dynamic `robots.txt` and `sitemap.xml`
- route-level noindex policy for private/app-internal surfaces
- lightweight automated verification for indexing artifacts

## Non-Goals

- full launch infrastructure rollout
- queue/worker separation
- full route-tier abuse-control audit
- complete UX rewrite of Terminal, Lab, Dashboard, or Passport
- engine algorithm changes

## Canonical Files

- `work/active/W-0009-public-indexing-and-surface-hardening.md`
- `app/src/lib/seo/site.ts`
- `app/src/lib/seo/policy.ts`
- `app/src/lib/seo/documents.ts`
- `app/src/lib/seo/seo.test.ts`
- `app/src/routes/robots.txt/+server.ts`
- `app/src/routes/sitemap.xml/+server.ts`
- `app/src/hooks.server.ts`
- `.github/workflows/app-ci.yml`
- `app/src/routes/+page.svelte`
- `app/src/routes/terminal/+page.svelte`
- `app/src/routes/lab/+page.svelte`
- `app/src/routes/patterns/+page.svelte`
- `app/src/routes/dashboard/+page.svelte`
- `app/src/routes/passport/+page.svelte`
- `app/src/routes/settings/+page.svelte`

## Decisions

- Public discoverability starts with correct crawl/index contracts, not with trying to index every route.
- Personalized or app-internal paths must explicitly opt out of indexing.
- API responses must carry `noindex` protection so search engines do not treat JSON endpoints as product pages.
- Sitemap generation must use runtime origin fallback so production stays correct even when the deployment hostname changes.
- Public-surface hardening is incomplete until app changes run through root-level CI instead of relying on local-only checks.
- This slice is launch groundwork, not the whole public-launch program.

## Next Steps

- add route-tier inventory for all public `/api/*` endpoints and pair each with cache/rate-limit policy
- formalize which surfaces are public-marketing indexable vs app-shell only
- add synthetic smoke checks for `robots.txt`, `sitemap.xml`, and selected HTML pages in CI
- continue into launch hardening: shared limiter, shared cache, queue/worker split

## Exit Criteria

- public pages expose canonical metadata consistently enough for search engines to understand site structure
- `robots.txt` and `sitemap.xml` are generated from one shared policy source
- private/API routes are explicitly noindexed
- automated tests cover the indexing-policy artifacts introduced in this slice
- app changes run through root-level CI with `check` + `test`
