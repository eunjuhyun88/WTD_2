import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');

const generatedFiles = [
  'docs/generated/route-map.md',
  'docs/generated/store-authority-map.md',
  'docs/generated/api-group-map.md'
];

const routeMeta = [
  {
    route: '/',
    role: 'product entry',
    primaryConcern: 'positioning, navigation, onboarding',
    keyState: '`walletStore`, `authSessionStore`, `profileTier`',
    deepDocs: '`docs/PRODUCT_SENSE.md`'
  },
  {
    route: '/dashboard',
    role: 'daily hub',
    primaryConcern: 'agent status, battle quota, revenue summary, Lab CTA',
    keyState: '`agentStore`, `battleStore`',
    deepDocs: '`docs/product-specs/core.md`'
  },
  {
    route: '/onboard',
    role: 'onboarding flow',
    primaryConcern: 'archetype selection, tutorial battle, ERA reveal',
    keyState: '`onboardingStore`',
    deepDocs: '`docs/product-specs/core.md`'
  },
  {
    route: '/agent',
    role: 'agent roster surface',
    primaryConcern: 'owned-agent collection, manage/train handoff, create entry',
    keyState: '`agentData`, `userProfileStore`, `matchHistoryStore`',
    deepDocs: '`docs/page-specs/agent-page.md`'
  },
  {
    route: '/agent/[id]',
    role: 'agent hq detail route',
    primaryConcern: 'doctrine, memory, history, and record for one agent',
    keyState: '`agentData`, `doctrineStore`',
    deepDocs: '`docs/page-specs/agent-detail-page.md`'
  },
  {
    route: '/agents',
    role: 'agent collection surface',
    primaryConcern: 'stats, memory, roster legibility',
    keyState: '`agentData`',
    deepDocs: '`docs/PRODUCT_SENSE.md`'
  },
  {
    route: '/create',
    role: 'create-agent bridge',
    primaryConcern: 'activation, wallet connection, and terminal handoff',
    keyState: '`walletStore`, `authSessionStore`',
    deepDocs: '`docs/page-specs/create-agent-page.md`'
  },
  {
    route: '/arena',
    role: 'main strategic arena',
    primaryConcern: 'structured human-vs-agent decision loop',
    keyState: '`gameState`, `matchHistoryStore`, `pnlStore`, `battleFeedStore`',
    deepDocs: '`docs/product-specs/arena.md`'
  },
  {
    route: '/arena-v2',
    role: 'simplified arena variant',
    primaryConcern: 'alternate arena flow and views',
    keyState: '`arenaV2State`, live price context',
    deepDocs: '`docs/product-specs/arena.md`'
  },
  {
    route: '/arena-war',
    role: 'fast AI battle mode',
    primaryConcern: 'phase machine, battle rendering, GameRecord flow',
    keyState: '`arenaWarStore`',
    deepDocs: '`docs/design-docs/arena-domain-model.md`'
  },
  {
    route: '/holdings',
    role: 'redirect route',
    primaryConcern: 'redirect to canonical profile/holdings experience',
    keyState: 'none',
    deepDocs: '`docs/product-specs/passport.md`'
  },
  {
    route: '/live',
    role: 'auxiliary live route/data hook',
    primaryConcern: 'limited runtime support surface',
    keyState: 'route-level data',
    deepDocs: '`docs/PRODUCT_SENSE.md`'
  },
  {
    route: '/lab',
    role: 'model training workbench',
    primaryConcern: 'agent doctrine, retained memory, release readiness',
    keyState: '`agentData`',
    deepDocs: '`docs/page-specs/lab-page.md`'
  },
  {
    route: '/battle',
    role: 'standalone proof battle',
    primaryConcern: 'daily-limited historical chart battle and result loop',
    keyState: '`battleStore`, `matchHistoryStore`',
    deepDocs: '`docs/page-specs/battle-page.md`'
  },
  {
    route: '/oracle',
    role: 'redirect route',
    primaryConcern: 'redirect into signals ai leaderboard view',
    keyState: 'none',
    deepDocs: '`docs/product-specs/signals.md`'
  },
  {
    route: '/passport',
    role: 'profile/progression surface',
    primaryConcern: 'identity, stats, learning, history',
    keyState: '`userProfileStore`, `userLifecycleStore`, `matchHistoryStore`, `quickTradeStore`',
    deepDocs: '`docs/product-specs/passport.md`'
  },
  {
    route: '/settings',
    role: 'preferences surface',
    primaryConcern: 'local settings and user controls',
    keyState: '`gameState` and preference state',
    deepDocs: '`docs/FRONTEND.md`'
  },
  {
    route: '/signals',
    role: 'signal discovery surface',
    primaryConcern: 'community, track, convert flows',
    keyState: '`gameState`, `matchHistoryStore`, signal state',
    deepDocs: '`docs/product-specs/signals.md`'
  },
  {
    route: '/signals/[postId]',
    role: 'community signal detail route',
    primaryConcern: 'single-post evidence, comments, and trade handoff',
    keyState: 'route-local post loader + `communityStore` reaction state',
    deepDocs: '`docs/page-specs/signals-detail-page.md`'
  },
  {
    route: '/terminal',
    role: 'intel/action surface',
    primaryConcern: 'scan, intel, action orchestration',
    keyState: 'route shell + `copyTradeStore`, `trackedSignalStore`, live prices',
    deepDocs: '`docs/product-specs/terminal.md`'
  },
  {
    route: '/world',
    role: 'world bridge surface',
    primaryConcern: 'world-map preview, readiness framing, battle handoff',
    keyState: '`gameState`',
    deepDocs: '`docs/page-specs/world-page.md`'
  },
  {
    route: '/creator/[userId]',
    role: 'public creator profile route',
    primaryConcern: 'creator context and recent community signals',
    keyState: 'route-local creator loader + community signal cards',
    deepDocs: '`docs/page-specs/creator-page.md`'
  },
  {
    route: '/cogochi',
    role: 'cogochi hub',
    primaryConcern: 'DOUNI virtual pet entry and navigation',
    keyState: 'route-level data',
    deepDocs: '`docs/PRODUCT_SENSE.md`'
  },
  {
    route: '/cogochi/terminal',
    role: 'DOUNI AI terminal',
    primaryConcern: 'LLM-driven chat with function calling, market analysis, social data',
    keyState: 'route-local chat state + `currentSnapshot`',
    deepDocs: '`docs/PRODUCT_SENSE.md`'
  }
];

const storeMeta = [
  ['priceStore', 'canonical client truth', 'live market prices and stats', 'Header, Chart, and Terminal should consume this directly.'],
  ['gameState', 'route/session transient', 'arena phase/view/hypothesis/session UI', 'Must not become market-truth owner.'],
  ['arenaV2State', 'route/session transient', 'simplified arena v2 local flow', 'Route-specific state.'],
  ['arenaWarStore', 'route/session transient', 'arena-war state machine and local orchestration', 'Durable record still belongs to server persistence.'],
  ['activeGamesStore', 'route/session transient', 'local multi-game runtime tracking', 'Coordination state, not durable truth.'],
  ['authSessionStore', 'server-authoritative projection', 'authenticated session mirror and cookie-backed identity', 'Session authority should stay separate from wallet UX and route-local control state.'],
  ['walletStore', 'route/session transient', 'wallet connection transport and signed-wallet shell', 'Connection UX state should stay separate from durable profile or trade truth.'],
  ['walletModalStore', 'route/session transient', 'wallet modal visibility and step flow', 'Modal UX state is split from wallet transport and progression state.'],
  ['remoteSessionGuard', 'derived/support', 'remote-session gate helpers', 'Utility helpers around authenticated remote-backed store access.'],
  ['userProfileStore', 'server-authoritative projection', 'profile projection and progression read model', 'Current unified profile surface remains the durable profile-facing store.'],
  ['quickTradeStore', 'server-authoritative projection', 'quick trades with optimistic staging', 'Reconcile optimistic IDs to server truth.'],
  ['trackedSignalStore', 'server-authoritative projection', 'tracked signals and conversion state', 'Local cache/fallback only.'],
  ['copyTradeStore', 'server-authoritative projection', 'copy-trade builder and publish reconcile', 'Canonical publish path belongs to server.'],
  ['positionStore', 'server-authoritative projection', 'unified positions', 'Aggregates durable positions from server flows.'],
  ['predictStore', 'server-authoritative projection', 'prediction/polymarket state', 'Durable positions and votes are server-owned.'],
  ['matchHistoryStore', 'server-authoritative projection', 'arena history and performance', 'Should reflect durable outcomes.'],
  ['communityStore', 'server-authoritative projection', 'community posts and reactions', 'Local storage is convenience, not source of truth.'],
  ['notificationStore', 'server-authoritative projection', 'durable notifications with optimistic staging', 'Canonical notification records come from the server.'],
  ['pnlStore', 'derived/support', 'pnl summaries and derived display state', 'Depends on durable trade/outcome data.'],
  ['battleFeedStore', 'route/session transient', 'live battle feed', 'Runtime-only presentation state.'],
  ['battleStore', 'route/session transient', 'standalone battle runtime and round state', 'Owns `/battle` route play state; durable records still belong to server-backed history.'],
  ['agentData', 'derived/support', 'agent stats and learning presentation layer', 'Should not silently redefine server truth.'],
  ['doctrineStore', 'derived/support', 'per-agent doctrine editor state and version history', 'Editable doctrine state should reconcile with durable agent truth when server APIs land.'],
  ['warRoomStore', 'route/session transient', 'war-room discussion state', 'Runtime coordination state.'],
  ['dbStore', 'derived/support', 'localStorage CRUD helpers and table adapters', 'Utility persistence layer for local fallback tables; not durable server truth.'],
  ['hydration', 'derived/support', 'orchestrates initial store hydration', 'Not domain truth itself.'],
  ['progressionRules', 'derived/support', 'tier and LP mapping logic', 'Rule/helper module, not state owner.'],
  ['storageKeys', 'derived/support', 'local storage key registry', 'Utility only.'],
  ['strategyStore', 'derived/support', 'strategy CRUD, versioning, backtest results, and fork tracking', 'localStorage persistence; will reconcile with server when strategy APIs land.']
];

const apiCategoryOrder = [
  'Auth & Session',
  'Market Data',
  'Terminal Scanner',
  'Signals',
  'Quick Trades',
  'GMX V2',
  'Polymarket',
  'Unified Positions',
  'Arena',
  'Arena War',
  'Passport Learning',
  'User Profile',
  'Predictions',
  'Community',
  'Copy Trading',
  'Tournaments',
  'Notifications',
  'Market Alerts',
  'Proxies & Infra'
];

const apiCategoryMeta = {
  'Auth & Session': { purpose: 'login, wallet auth, session lifecycle' },
  'Market Data': { purpose: 'market snapshot, flow, news, and dex data' },
  'Terminal Scanner': { purpose: 'scan and intel orchestration' },
  'Signals': { purpose: 'signal objects and action conversion' },
  'Quick Trades': { purpose: 'fast trade lifecycle' },
  'GMX V2': { purpose: 'GMX position lifecycle' },
  Polymarket: { purpose: 'prediction market and related positions' },
  'Unified Positions': { purpose: 'aggregated position view' },
  Arena: { purpose: 'strategic arena lifecycle' },
  'Arena War': { purpose: 'fast battle records and memory' },
  'Passport Learning': { purpose: 'learning datasets, evals, and jobs' },
  'User Profile': { purpose: 'profile, progression, preferences, and agent stats' },
  Predictions: { purpose: 'prediction positions and voting' },
  Community: { purpose: 'activity, posts, and reactions' },
  'Copy Trading': { purpose: 'publish and run tracking' },
  Tournaments: { purpose: 'tournament lifecycle and bracket access' },
  Notifications: { purpose: 'notification lifecycle' },
  'Market Alerts': { purpose: 'specialized market alert surface' },
  'Proxies & Infra': { purpose: 'third-party proxy and support endpoints' }
};

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
      continue;
    }
    files.push(entryPath);
  }
  return files;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function discoverPageRoutes() {
  const routesDir = path.join(rootDir, 'src/routes');
  const files = walkFiles(routesDir)
    .filter((file) => file.endsWith('+page.svelte') || file.endsWith('+page.ts'));
  const discovered = files.map((file) => {
    const rel = toPosix(path.relative(routesDir, file));
    const withoutFile = rel.replace(/\/\+page\.(svelte|ts)$/, '').replace(/^\+page\.(svelte|ts)$/, '');
    const route = withoutFile ? `/${withoutFile}` : '/';
    return { route, file: `src/routes/${rel}` };
  });
  return discovered.sort((a, b) => a.route.localeCompare(b.route));
}

function discoverStores() {
  const storesDir = path.join(rootDir, 'src/lib/stores');
  return fs.readdirSync(storesDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => name.replace(/\.ts$/, ''))
    .sort((a, b) => a.localeCompare(b));
}

function apiRouteFromFile(file) {
  const rel = toPosix(path.relative(path.join(rootDir, 'src/routes'), file));
  return `/${rel.replace(/\/\+server\.ts$/, '')}`;
}

function discoverApiRoutes() {
  const apiDir = path.join(rootDir, 'src/routes/api');
  return walkFiles(apiDir)
    .filter((file) => file.endsWith('+server.ts'))
    .map(apiRouteFromFile)
    .sort((a, b) => a.localeCompare(b));
}

function groupApiRoute(route) {
  if (route.startsWith('/api/auth/')) return 'Auth & Session';
  if (route.startsWith('/api/market/alerts/')) return 'Market Alerts';
  if (route.startsWith('/api/market/')) return 'Market Data';
  if (route.startsWith('/api/terminal/')) return 'Terminal Scanner';
  if (route.startsWith('/api/signals/') || route === '/api/signals' || route === '/api/signal-actions') return 'Signals';
  if (route === '/api/quick-trades' || route.startsWith('/api/quick-trades/')) return 'Quick Trades';
  if (route.startsWith('/api/gmx/')) return 'GMX V2';
  if (
    route.startsWith('/api/polymarket/') ||
    route === '/api/positions/polymarket' ||
    route.startsWith('/api/positions/polymarket/')
  ) return 'Polymarket';
  if (route === '/api/positions/unified') return 'Unified Positions';
  if (route.startsWith('/api/arena-war')) return 'Arena War';
  if (route.startsWith('/api/arena/') || route === '/api/matches') return 'Arena';
  if (route.startsWith('/api/profile/passport/learning/')) return 'Passport Learning';
  if (
    route === '/api/profile' ||
    route === '/api/profile/passport' ||
    route === '/api/portfolio/holdings' ||
    route === '/api/preferences' ||
    route === '/api/progression' ||
    route.startsWith('/api/agents/stats')
  ) return 'User Profile';
  if (route === '/api/predictions' || route.startsWith('/api/predictions/')) return 'Predictions';
  if (
    route.startsWith('/api/activity') ||
    route.startsWith('/api/community/') ||
    route.startsWith('/api/creator/')
  ) return 'Community';
  if (route.startsWith('/api/copy-trades/')) return 'Copy Trading';
  if (route.startsWith('/api/battle')) return 'Arena';
  if (route.startsWith('/api/memory/')) return 'Arena';
  if (route.startsWith('/api/doctrine')) return 'User Profile';
  if (route.startsWith('/api/exchange/')) return 'Proxies & Infra';
  if (route.startsWith('/api/lab/')) return 'Passport Learning';
  if (route.startsWith('/api/cycles/')) return 'Market Data';
  if (route.startsWith('/api/marketplace/')) return 'Copy Trading';
  if (route.startsWith('/api/tournaments/')) return 'Tournaments';
  if (route.startsWith('/api/notifications')) return 'Notifications';
  if (
    route === '/api/coinalyze' ||
    route.startsWith('/api/coingecko/') ||
    route.startsWith('/api/etherscan/') ||
    route === '/api/feargreed' ||
    route.startsWith('/api/macro/') ||
    route.startsWith('/api/onchain/') ||
    route.startsWith('/api/pnl') ||
    route.startsWith('/api/senti/') ||
    route === '/api/ui-state' ||
    route.startsWith('/api/yahoo/') ||
    route === '/api/chat/messages'
  ) return 'Proxies & Infra';
  return null;
}

function ensureCoverage(discovered, expectedKeys, label) {
  const discoveredSet = new Set(discovered);
  const expectedSet = new Set(expectedKeys);
  const missingMeta = [...discoveredSet].filter((item) => !expectedSet.has(item));
  const missingFiles = [...expectedSet].filter((item) => !discoveredSet.has(item));

  if (missingMeta.length || missingFiles.length) {
    const problems = [];
    if (missingMeta.length) problems.push(`${label} missing metadata: ${missingMeta.join(', ')}`);
    if (missingFiles.length) problems.push(`${label} metadata missing files: ${missingFiles.join(', ')}`);
    throw new Error(problems.join('\n'));
  }
}

function generateRouteMap() {
  const discovered = discoverPageRoutes();
  ensureCoverage(
    discovered.map((entry) => entry.route),
    routeMeta.map((entry) => entry.route),
    'routes'
  );

  const fileMap = new Map(discovered.map((entry) => [entry.route, entry.file]));
  const routeRows = routeMeta.map((entry) => {
    const source = fileMap.get(entry.route);
    return `| \`${entry.route}\` | ${entry.role} | ${entry.primaryConcern} | ${entry.keyState} | ${entry.deepDocs} |`;
  }).join('\n');

  const shellFiles = [
    'src/routes/+layout.svelte',
    'src/routes/+page.svelte',
    'src/routes/terminal/+page.svelte',
    'src/routes/arena/+page.svelte',
    'src/routes/passport/+page.svelte'
  ];

  return `# Route Map

Generated by \`scripts/dev/refresh-generated-context.mjs\`.
Source of truth remains \`src/routes/\` plus canonical docs under \`docs/\`.

## App Routes

| Route | Role | Primary concern | Key stores / state | Deep docs |
| --- | --- | --- | --- | --- |
${routeRows}

## Route Shells and Global Entry

| File | Role |
| --- | --- |
${shellFiles.map((file) => `| \`${file}\` | ${describeShell(file)} |`).join('\n')}

## Route Ownership Rules

1. A route file owns entry/exit and high-level composition.
2. Live market truth should come from \`priceStore\`, not route-local copies.
3. Durable user and trade state should come from server-authoritative stores.
4. Large route changes should update the relevant product spec or frontend architecture doc.

## Related Docs

- \`docs/FRONTEND.md\`
- \`docs/product-specs/index.md\`
- \`docs/generated/store-authority-map.md\`
- \`docs/generated/api-group-map.md\`
`;
}

function describeShell(file) {
  if (file === 'src/routes/+layout.svelte') return 'app shell, global layout, and shared mounting point';
  if (file === 'src/routes/+page.svelte') return 'home entry route';
  if (file === 'src/routes/terminal/+page.svelte') return 'terminal route shell';
  if (file === 'src/routes/arena/+page.svelte') return 'arena route shell';
  if (file === 'src/routes/passport/+page.svelte') return 'passport route shell';
  return 'route shell';
}

function generateStoreAuthorityMap() {
  const discovered = discoverStores();
  ensureCoverage(discovered, storeMeta.map(([name]) => name), 'stores');

  const rows = storeMeta.map(([name, authorityClass, role, notes]) =>
    `| \`${name}\` | ${authorityClass} | ${role} | ${notes} |`
  ).join('\n');

  return `# Store Authority Map

Generated by \`scripts/dev/refresh-generated-context.mjs\`.
Source of truth remains store implementations plus canonical state-authority docs.

## Authority Categories

| Category | Meaning |
| --- | --- |
| canonical client truth | the one client-side owner for a domain |
| server-authoritative projection | client store mirrors or stages server truth |
| route/session transient | local control state for screens and flows |
| derived/support | helper, orchestration, or utility state |

## Stores

| Store | Authority class | Role | Notes |
| --- | --- | --- | --- |
${rows}

## Primary Rules

1. \`priceStore\` is the only canonical client owner for live price truth.
2. Profile, badge, quick trade, tracked signal, position, and history state are server-authoritative.
3. Route stores should own control flow, not durable domain truth.
4. Helper/orchestration modules should not turn into hidden persistence layers.

## Related Docs

- \`docs/FRONTEND.md\`
- \`docs/FE_STATE_MAP.md\`
- \`docs/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md\`
`;
}

function generateApiGroupMap() {
  const routes = discoverApiRoutes();
  const grouped = new Map(apiCategoryOrder.map((category) => [category, []]));

  for (const route of routes) {
    const category = groupApiRoute(route);
    if (!category) {
      throw new Error(`api route missing category mapping: ${route}`);
    }
    grouped.get(category).push(route);
  }

  const summaryRows = apiCategoryOrder
    .filter((category) => grouped.get(category).length > 0)
    .map((category) => {
      const items = grouped.get(category);
      const representative = items.slice(0, 4).map((route) => `\`${route}\``).join(', ');
      return `| ${category} | ${apiCategoryMeta[category].purpose} | ${representative} | ${items.length} |`;
    })
    .join('\n');

  const inventorySections = apiCategoryOrder
    .filter((category) => grouped.get(category).length > 0)
    .map((category) => {
      const items = grouped.get(category).map((route) => `- \`${route}\``).join('\n');
      return `### ${category}\n${items}`;
    })
    .join('\n\n');

  return `# API Group Map

Generated by \`scripts/dev/refresh-generated-context.mjs\`.
Source of truth remains \`src/routes/api/**\` and \`docs/API_CONTRACT.md\`.

## API Group Overview

| Group | Purpose | Representative routes | Count |
| --- | --- | --- | --- |
${summaryRows}

## Current Route Inventory Snapshot

${inventorySections}

## API Ownership Rules

1. If a route mutates durable user, trade, profile, or learning state, the server is authoritative.
2. If a route is a proxy, treat upstream data shape as untrusted until validated.
3. API contract changes should update \`docs/API_CONTRACT.md\` and the relevant canonical doc.
4. Money-adjacent routes should prioritize idempotency and reconciliation clarity.

## Related Docs

- \`docs/API_CONTRACT.md\`
- \`docs/SECURITY.md\`
- \`docs/generated/store-authority-map.md\`
`;
}

function writeOrCheck(relativePath, nextContent) {
  const fullPath = path.join(rootDir, relativePath);
  const normalized = nextContent.trimEnd() + '\n';
  const current = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : null;

  if (checkMode) {
    if (current !== normalized) {
      throw new Error(`generated doc is stale: ${relativePath}\nRun: npm run docs:refresh`);
    }
    return;
  }

  fs.writeFileSync(fullPath, normalized);
  console.log(`[docs:refresh] wrote ${relativePath}`);
}

function main() {
  const contents = {
    'docs/generated/route-map.md': generateRouteMap(),
    'docs/generated/store-authority-map.md': generateStoreAuthorityMap(),
    'docs/generated/api-group-map.md': generateApiGroupMap()
  };

  for (const relativePath of generatedFiles) {
    writeOrCheck(relativePath, contents[relativePath]);
  }

  if (checkMode) {
    console.log('[docs:refresh] generated docs are up to date.');
  }
}

main();
