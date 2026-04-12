# BE Extraction Design — v0

- Status: DESIGN (execution pending)
- Author: keen-jackson session, 2026-04-12
- Decision source: CTO cleanup session 2026-04-12 (heuristic-knuth + keen-jackson)
- Root CLAUDE.md reference: section 3 (Frontend/Backend Separation)

---

## 1. Context

2026-04-12 CTO decision:
- **Frontend stays in place** — no file moves for routes, components, stores, api, services
- **Backend extracts into `packages/*` workspaces** — same monorepo, same process, same deploy
- No HTTP/RPC boundary split. Build separation only.
- One package per PR. Import path shims maintained during transition.

This replaces the previous "internal boundaries first, physical separation last" policy.

## 2. Scope Inventory (as of 2026-04-12)

| Directory | Files | LOC | Extraction target |
|---|---|---|---|
| `src/lib/contracts/` | 9 | 2,111 | `packages/contracts/` (step 1) |
| `src/lib/server/providers/` | ~30 | ~8,000 | `packages/providers/` (step 2) |
| `src/lib/engine/` (server-only) | 63 | 24,113 | `packages/engine-core/` (step 3) |
| `src/lib/server/` (domain services) | 85 | 22,387 | `packages/server-core/` (step 4) |
| `cogochi/` (Python) | 5 | 1,555 | `packages/cogochi-legacy/` (maintain only) |
| `src/routes/api/` | 134 | 12,406 | Stay as thin BFF (no move) |

**Total extraction scope**: ~58,000 LOC across ~190 files

## 3. Target Structure

```
CHATBATTLE/
├── apps/
│   └── web/                    # current src/ (rename — last step)
├── packages/
│   ├── contracts/              # shared types, IDs, enums
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── providers/              # data source adapters (Binance, CoinGecko, etc.)
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── engine-core/            # scoring engine, layer engine, scan engine
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── server-core/            # domain services (research, intel, LLM, RAG)
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── cogochi-legacy/         # Python scripts (maintain only)
│       └── ...
├── package.json                # workspace root
├── tsconfig.json               # workspace root
└── turbo.json                  # (optional, if turborepo needed)
```

## 4. Extraction Order (confirmed)

### Step 1: `packages/contracts/` (2-3h, low risk)

**Source**: `src/lib/contracts/`
**What moves**: Type definitions, shared IDs, enums, validation schemas
**Why first**: Zero runtime dependencies on other modules. Everything else imports from contracts.

**Actions**:
1. Create `packages/contracts/` with `package.json` + `tsconfig.json`
2. Move files from `src/lib/contracts/` to `packages/contracts/src/`
3. Add `$lib/contracts` → `@stockclaw/contracts` import shim (tsconfig path alias)
4. Verify: `npm run check` + `npm run build`
5. Remove shim once all imports migrated

**Exit criteria**:
- `packages/contracts/` builds independently
- All existing `$lib/contracts` imports work (via shim or migrated)
- `npm run gate` passes

### Step 2: `packages/providers/` (1 day, medium risk)

**Source**: `src/lib/server/providers/`
**What moves**: Data source adapters, API clients, catalog, compound memo helpers
**Dependencies**: `@stockclaw/contracts`

**Actions**:
1. Create `packages/providers/`
2. Move provider files
3. Wire `@stockclaw/contracts` dependency in package.json
4. Shim `$lib/server/providers` import path
5. Verify gate

**Risk**: Provider files have deep imports into `$lib/server/` utilities. May need to extract utility helpers first or copy temporarily.

### Step 3: `packages/engine-core/` (2 days, high risk)

**Source**: `src/lib/engine/` (server-only parts)
**What moves**: Scoring engine, layer engine, scan engine, factor analysis
**Dependencies**: `@stockclaw/contracts`, `@stockclaw/providers`

**Risk**: Engine has tight coupling with stores (browser-side) and server services. Need to carefully separate server-only vs browser-shared code. Some engine modules may need to stay in `src/` if they're used by both browser and server.

**Mitigation**: Audit every file's import graph before moving. Create `shared/` sub-package if needed.

### Step 4: `packages/server-core/` (3-5 days, high risk)

**Source**: `src/lib/server/` (excluding providers, already moved)
**What moves**: Domain services — research view, wallet intel, LLM service, RAG, douni
**Dependencies**: All prior packages

**Risk**: Largest extraction. LLM/RAG services have external API dependencies. Service initialization patterns may need refactoring.

### Step 5: `apps/web/` rename (1 day, medium risk)

**Source**: current `src/`
**What**: Rename root to `apps/web/`, update all relative paths
**Dependencies**: All packages extracted

**Risk**: Build config, import paths, SvelteKit config all need updating.

## 5. Attach Mechanism

- **Same monorepo**: npm/pnpm workspaces
- **Same process**: direct TypeScript imports, no HTTP
- **Same deploy**: single SvelteKit build includes all packages
- **No microservices**: explicitly rejected for this phase

## 6. Prohibitions (this document)

- **No code moves in this session** — design only
- **No premature optimization** — extract when ready, not before
- **No parallel extraction** — one step at a time, each must pass gate
- **No HTTP boundary** — same process, same deploy
- **Passport-first is NOT recommended** — walletIntelServer has largest fan-out, do contracts→providers first

## 7. Execution Start Conditions

Before starting Step 1:
1. Dedicated worktree created: `git worktree add .claude/worktrees/<name> -b feat/be-extraction-step1`
2. No other sessions actively modifying `src/lib/contracts/`
3. This design document read and understood
4. `npm run gate` passes on clean main
5. User approval for execution

## 8. Rollback Plan

Each step is a single PR. Rollback = revert the merge commit.

```bash
# Example: rollback step 1
git revert -m 1 <merge-commit-sha>
npm run gate
git push origin main
```

## 9. Success Criteria (full extraction)

- [ ] Step 1: `packages/contracts/` exists, builds, gate passes
- [ ] Step 2: `packages/providers/` exists, builds, gate passes
- [ ] Step 3: `packages/engine-core/` exists, builds, gate passes
- [ ] Step 4: `packages/server-core/` exists, builds, gate passes
- [ ] Step 5: `apps/web/` exists, full build passes
- [ ] All `$lib/` shims removed
- [ ] Root `CLAUDE.md` updated with final structure
- [ ] Each package has `README.md`

---

## References

- Root CLAUDE.md section 3: Frontend/Backend Separation
- CTO cleanup plan: `cto-cleanup-plan-2026-04-12.md`
- CLAUDE.md rewrite proposal: `root-claude-md-rewrite-proposal-2026-04-12.md`
