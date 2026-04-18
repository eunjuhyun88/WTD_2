// ═══════════════════════════════════════════════════════════════
// Server Hooks
// ═══════════════════════════════════════════════════════════════
// 1. Security headers
// 2. Static asset cache headers
// NOTE: Response compression should be handled by CDN/reverse proxy.

import type { Handle } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { readRequestHost, isHostAllowed } from '$lib/server/hostSecurity';
import { runMutatingApiOriginGuard } from '$lib/server/originGuard';
import { assertAppServerRuntimeSecurity } from '$lib/server/runtimeSecurity';
import { shouldApplyNoIndexHeader } from '$lib/seo/policy';

// Immutable asset path pattern (Vite hashed filenames)
const IMMUTABLE_ASSET = /\/_app\/immutable\//;

export const handle: Handle = async ({ event, resolve }) => {
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
  response.headers.set('Content-Security-Policy', "base-uri 'self'; frame-ancestors 'self'; object-src 'none'");

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
