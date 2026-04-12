import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:4173';
const TURNSTILE_TOKEN = __ENV.TURNSTILE_TOKEN || '';

export const options = {
  scenarios: {
    auth_and_snapshot: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '2m', target: 300 },
        { duration: '3m', target: 700 },
        { duration: '3m', target: 1100 },
        { duration: '2m', target: 1200 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.03'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

function randomHex(length) {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function makeWalletAddress() {
  return `0x${randomHex(40)}`;
}

export default function () {
  const wallet = makeWalletAddress();

  const noncePayload = JSON.stringify({
    address: wallet,
    provider: 'metamask',
    chain: 'ARB',
    turnstileToken: TURNSTILE_TOKEN || undefined,
  });

  const nonceRes = http.post(`${BASE_URL}/api/auth/nonce`, noncePayload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  });

  check(nonceRes, {
    'nonce endpoint returns 200/403/429': (r) => r.status === 200 || r.status === 403 || r.status === 429,
  });

  const snapshotRes = http.get(`${BASE_URL}/api/market/snapshot?pair=BTC/USDT&timeframe=4h&persist=0`, {
    timeout: '10s',
  });

  check(snapshotRes, {
    'snapshot endpoint returns 200/403/429': (r) => r.status === 200 || r.status === 403 || r.status === 429,
  });

  sleep(1);
}
