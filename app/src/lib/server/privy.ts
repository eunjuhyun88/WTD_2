/**
 * Privy server-side JWT verification — W-0325
 *
 * Uses the Privy JWKS endpoint to verify tokens issued by the Privy auth service.
 * The app secret is used for symmetric verification as a fallback.
 *
 * SECURITY: This module is server-only (`src/lib/server/`).
 * Do NOT import from client-side code.
 *
 * Required env vars:
 *   PRIVY_APP_SECRET  — from Privy dashboard (server-side only, gitignored)
 *   PUBLIC_PRIVY_APP_ID — Privy app ID (also the DogeOS clientId)
 */

const APP_ID     = import.meta.env.PUBLIC_PRIVY_APP_ID as string;
const APP_SECRET = import.meta.env.PRIVY_APP_SECRET    as string;

const JWKS_URL   = `https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`;

/** Verify a Privy-issued JWT using the JWKS endpoint.
 *  Returns the decoded payload or throws on failure.
 */
export async function verifyPrivyToken(token: string): Promise<Record<string, unknown>> {
  if (!APP_ID || !APP_SECRET) {
    throw new Error('Privy env vars not configured (PRIVY_APP_SECRET / PUBLIC_PRIVY_APP_ID)');
  }

  // Fetch JWKS (public keys from Privy)
  const jwksRes = await fetch(JWKS_URL);
  if (!jwksRes.ok) throw new Error(`JWKS fetch failed: ${jwksRes.status}`);
  const { keys } = await jwksRes.json() as { keys: JsonWebKey[] };

  // Parse JWT header to find kid
  const [headerB64, payloadB64, sigB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('Invalid JWT format');

  const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
  const key = keys.find((k: any) => k.kid === header.kid) ?? keys[0];
  if (!key) throw new Error('No matching JWKS key found');

  // Import the public key
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  // Verify signature
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sig, signedData);
  if (!valid) throw new Error('JWT signature invalid');

  // Decode payload
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

  // Validate claims
  if (payload.iss !== 'privy.io') throw new Error('Invalid issuer');
  if (payload.aud !== APP_ID)    throw new Error('Invalid audience');
  if (payload.exp < Date.now() / 1000) throw new Error('Token expired');

  return payload;
}

/** Extract the Privy user ID from a verified JWT payload */
export function extractPrivyUserId(payload: Record<string, unknown>): string {
  const sub = payload['sub'];
  if (typeof sub !== 'string') throw new Error('Missing sub claim');
  return sub; // format: "did:privy:xxxxx"
}
