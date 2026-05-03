export interface CaptureInfo {
  capture_id: string;
  symbol: string;
  pattern_slug: string;
  expires_at: number;
}

export type TokenStatus = 'ready' | 'expired' | 'invalid';

export function parseVerdictToken(token: string): CaptureInfo | null {
  try {
    const [payloadB64] = token.split('.');
    const json = Buffer.from(
      payloadB64.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf-8');
    return JSON.parse(json) as CaptureInfo;
  } catch {
    return null;
  }
}

export function evaluateToken(token: string | null): {
  captureInfo: CaptureInfo | null;
  tokenStatus: TokenStatus;
} {
  if (!token) return { captureInfo: null, tokenStatus: 'invalid' };
  const info = parseVerdictToken(token);
  if (!info) return { captureInfo: null, tokenStatus: 'invalid' };
  if (Date.now() / 1000 > info.expires_at) return { captureInfo: info, tokenStatus: 'expired' };
  return { captureInfo: info, tokenStatus: 'ready' };
}
