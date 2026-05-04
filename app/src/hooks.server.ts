// ═══════════════════════════════════════════════════════════════
// Server Hooks
// ═══════════════════════════════════════════════════════════════
// 1. Session hydration → event.locals.user
// 2. Route-level auth enforcement (server-side, not bypassable by client)
// 3. Security headers
// 4. Static asset cache headers
// NOTE: Response compression should be handled by CDN/reverse proxy.

import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { handleErrorWithSentry, sentryHandle } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { readRequestHost, isHostAllowed } from '$lib/server/hostSecurity';
import { runMutatingApiOriginGuard } from '$lib/server/originGuard';
import { assertAppServerRuntimeSecurity } from '$lib/server/runtimeSecurity';
import { shouldApplyNoIndexHeader } from '$lib/seo/policy';
import { getAuthUserFromCookies, checkBetaAllowlist } from '$lib/server/authGuard';

// Sentry: init server-side only when DSN is present
const serverDsn = env.SENTRY_DSN?.trim();
if (serverDsn) {
  Sentry.init({
    dsn: serverDsn,
    tracesSampleRate: parseFloat(env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    environment: env.SENTRY_ENVIRONMENT ?? 'production',
  });
}

// Immutable asset path pattern (Vite hashed filenames)
const IMMUTABLE_ASSET = /\/_app\/immutable\//;

// ── Auth route classification ─────────────────────────────────
// Public pages: only the home route is accessible without auth.
// Public APIs: auth endpoints + read-only market/public data.
// Everything else requires a valid server-side session.

const PUBLIC_API_PREFIXES = [
  '/api/auth/',           // login, register, session check, nonce, etc.
  '/api/agents/stats',         // local-first agent sync no-op endpoints
  '/api/cogochi/analyze',       // read-only shell bootstrap
  '/api/cogochi/alerts',        // read-only recent alert feed
  '/api/cogochi/thermometer',   // read-only market pulse
  '/api/cogochi/news',          // read-only public news feed (CryptoPanic, no personal data)
  '/api/cogochi/whales',        // read-only Hyperliquid leaderboard proxy (public data)
  '/api/cogochi/alpha/',        // read-only alpha world model
  '/api/captures/chart-annotations', // optional chart overlay feed
  '/api/market/ohlcv',
  '/api/market/sparklines',
  '/api/market/funding',
  '/api/market/oi',
  '/api/market/symbols',    // Binance USDT perps universe search (public read-only)
  '/api/market/trending',
  '/api/market/news',
  '/api/market/events',
  '/api/market/flow',
  '/api/market/derivatives',
  '/api/market/depth-ladder',
  '/api/market/liquidation-clusters',
  '/api/market/microstructure',
  '/api/market/venue-divergence',  // W-0122-A: public read-only, 30s cached, rate limited
  '/api/market/liq-clusters',      // W-0122-B1: public read-only, derived from chart feed
  '/api/market/indicator-context', // W-0122 rolling percentile provider (30d distribution)
  '/api/market/stablecoin-ssr',    // W-0122-F: derived SSR (DefiLlama + CoinGecko), 30m cache
  '/api/market/rv-cone',           // W-0122-F: realized vol cone (Binance klines), 1h cache
  '/api/market/funding-flip',      // W-0122-F: funding flip clock (Binance history), 10m cache
  '/api/market/chain-intel',       // W-0122 extension: Solscan/TRONSCAN/Etherscan V2 canonical chain snapshots
  '/api/market/kimchi-premium',      // W-0363: KRW/USDT premium (public, 30s cached)
  '/api/market/influencer-metrics', // W-0122 extension: influencer metric pack (public read-only)
  '/api/market/reference-stack',   // W-0122 extension: curated reference stack with live/blocked capability states
  '/api/confluence/',              // W-0122-Confluence: score aggregator (read-only)
  '/api/market/options-snapshot',  // W-0122-C1: Deribit options snapshot (public), 5m cache
  '/api/market/chains/',           // W-0122 extension: supported chain search/catalog (public read-only)
  '/api/terminal/intel-policy',    // terminal read-only policy synthesis for public terminal shell
  '/api/terminal/agent/chat',      // AI agent SSE stream — user_id optional, quota tracked per-user when authed
  '/api/terminal/agent/models',    // AI agent model list — public read-only, no personal data
  '/api/coingecko/',
  '/api/feargreed',
  '/api/chart/',          // chart klines + feed — public market data, rate-limited
  '/api/coinalyze',
  '/api/macro/',
  '/api/polymarket/',
  '/api/onchain/',
  '/api/etherscan/',
  // Pattern routes: only read-only sub-paths are public.
  // /api/patterns/scan, /api/patterns/[slug]/capture, and /api/patterns/[slug]/verdict
  // require auth — they are mutating or cost-bearing.
  '/api/patterns/stats',
  '/api/patterns/alerts',
  '/api/patterns/states',
  '/api/patterns/alpha',
  '/api/patterns/thermometer',
  '/api/patterns/analyze',
  '/api/patterns/outcome',
  '/api/patterns/terminal',
  '/api/senti/',
  '/api/doctrine',
  '/api/beta/waitlist',   // unauthenticated waitlist signup (beta-pending users)
  '/api/patterns/transitions', // B4: read-only transitions feed
];

const PUBLIC_STATUS_PATHS = ['/status'];

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function isPublicPagePath(pathname: string): boolean {
  if (dev) return true; // DEV: bypass auth for local UI review
  return (
    pathname === '/' ||
    pathname === '/cogochi' ||
    pathname === '/healthz' ||
    pathname === '/readyz' ||
    pathname === '/status' ||
    PUBLIC_STATUS_PATHS.some(p => pathname.startsWith(p))
  );
}

export const handleError: HandleServerError = handleErrorWithSentry();

const _appHandle: Handle = async ({ event, resolve }) => {
  // Runtime security validation runs once per worker on the first real request.
  // Skipped during build (prerender) since SECURITY_ALLOWED_HOSTS is not present
  // at build time and there's no live traffic to defend.
  if (!building) {
    assertAppServerRuntimeSecurity(env);
  }

  const requestHost = readRequestHost(event.request);
  if (!isHostAllowed(requestHost)) {
    return new Response('Unrecognized host', { status: 421 });
  }

  // ── Session hydration (server-side, every request) ────────
  // Only call DB when a session cookie is present, to avoid unnecessary DB hits.
  const pathname = event.url.pathname;
  const isApiRoute = pathname.startsWith('/api/');
  const isPublicApi = isApiRoute && isPublicApiPath(pathname);
  const isPublicPage = isPublicPagePath(pathname);

  let user: App.Locals['user'] = null;
  const hasCookie = event.request.headers.get('cookie')?.includes('wtd_session=');

  if (hasCookie) {
    user = await getAuthUserFromCookies(event.cookies);
  }

  event.locals.user = user;
  event.locals.betaPending = false;

  // B1: Beta allowlist gate — authenticated users must be in beta_allowlist.
  // Applies to page routes only (not APIs, to preserve JSON error handling).
  if (user && !isPublicPage && !isApiRoute) {
    const allowed = await checkBetaAllowlist(user.wallet_address, user.email);
    if (!allowed) {
      event.locals.betaPending = true;
      throw redirect(303, '/?auth=beta-pending');
    }
  }

  // ── Auth enforcement (server-side only — cannot be bypassed by client) ──
  if (!isPublicPage && !isApiRoute) {
    // Protected page route — redirect to home with auth=required param.
    // The home page shows a login modal when this param is present.
    if (!user) {
      throw redirect(303, '/?auth=required');
    }
  } else if (isApiRoute && !isPublicApi) {
    // Protected API route — return 401 without redirect.
    // No 302 on API routes to prevent information leakage via redirect target.
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const blocked = runMutatingApiOriginGuard(event);
  const response = blocked ?? await resolve(event);

  // ── Security headers ──────────────────────────────────────
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-site');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  // dev: allow inline scripts/eval for Vite HMR; prod: lock down to reduce XSS surface.
  const scriptSrc = dev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com"
    : "script-src 'self' https://va.vercel-scripts.com";
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' wss: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
  ].join('; '));

  if (!dev && event.url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // ── Cache headers for immutable assets ────────────────────
  const url = event.url.pathname;
  if (IMMUTABLE_ASSET.test(url)) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }

  if (shouldApplyNoIndexHeader(url)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return response;
};

export const handle: Handle = sequence(sentryHandle(), _appHandle);
