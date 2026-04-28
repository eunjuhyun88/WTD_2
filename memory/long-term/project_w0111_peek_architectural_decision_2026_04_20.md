---
name: W-0111 PEEK Architectural Decision (2026-04-20)
description: Separate /terminal/peek route abandoned; PEEK will integrate into main /terminal as layout refactor (CTO decision)
type: project
originSessionId: 2da3cf7c-0b06-4a81-b3bb-82e292972d35
---
**Decision**: Removed separate `/terminal/peek` route after persistent SSR errors. PEEK integration will proceed as refactor of main `/terminal` route.

**Why**: 
- Separate PEEK route caused cascading 500 errors affecting all /terminal/* routes due to complex component imports during SSR
- Even simple test pages in the route failed, indicating deeper SvelteKit/build issue
- Original goal was to make PEEK primary Terminal layout anyway — separate route was intermediate step

**How to apply**: 
- PEEK components (PeekDrawer, ScanGrid, JudgePanel) remain in `app/src/components/terminal/peek/`
- Main `/terminal` route refactor will integrate PEEK layout progressively
- Use `{#if browser}` pattern + lazy-load heavy components to avoid SSR errors
- Next phase: Design integration points in existing `/terminal` +page.svelte

**Files affected**: 
- `app/src/routes/terminal/peek/` — DELETED (route removed, branch will be clean)
- `app/src/components/terminal/peek/*.svelte` — KEPT (available for integration)
