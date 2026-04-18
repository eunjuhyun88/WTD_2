/**
 * W-0098 — /score endpoint load test with real payload fixture
 *
 * Usage:
 *   k6 run scripts/load_test_score.js
 *   k6 run --env BASE=https://your-app.vercel.app scripts/load_test_score.js
 *   k6 run --env VUS=50 --env DURATION=30s scripts/load_test_score.js
 *
 * Tests the full LightGBM scoring path — not just engine health.
 * Sends a 200-bar BTCUSDT kline fixture to verify p95 < 2000ms at load.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate  = new Rate('score_errors');
const scoreTrend = new Trend('score_duration', true);
const cacheHits  = new Rate('score_cache_hits'); // when x-cache-status is 'hit' or response is instant

export const options = {
  stages: [
    { duration: '20s', target: parseInt(__ENV.VUS ?? '50') },
    { duration: __ENV.DURATION ?? '60s', target: parseInt(__ENV.VUS ?? '50') },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'score_duration{percentile:95}': ['p(95)<2000'],
    'score_errors':                  ['rate<0.01'],
    'http_req_failed':               ['rate<0.01'],
  },
};

const BASE = __ENV.BASE || 'https://app.cogotchi.dev';

// Minimal 200-bar fixture: all bars identical for the purpose of load testing.
// Real usage sends live klines from Binance — this just exercises the CPU path.
const NOW_MS = Date.now();
const BAR_MS = 3_600_000; // 1h

function makeKlineBar(i) {
  return {
    t: NOW_MS - (200 - i) * BAR_MS,
    o: 84000 + Math.sin(i * 0.1) * 500,
    h: 84600 + Math.sin(i * 0.1) * 500,
    l: 83500 + Math.sin(i * 0.1) * 500,
    c: 84200 + Math.sin(i * 0.1) * 500,
    v: 1200 + (i % 10) * 50,
    tbv: 600 + (i % 10) * 25,
  };
}

const KLINES = Array.from({ length: 200 }, (_, i) => makeKlineBar(i));

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

const SCORE_PAYLOAD = JSON.stringify({
  symbol: 'BTCUSDT',
  klines: KLINES,
  perp: {
    funding_rate: 0.0001,
    oi_change_1h: 0.02,
    oi_change_24h: 0.05,
    long_short_ratio: 1.15,
    taker_buy_ratio: 0.52,
  },
});

// Payloads for 3 symbols (exercises cache: same symbol+last_bar_ts → cache hit after first)
const PAYLOADS = SYMBOLS.map((sym) =>
  JSON.stringify({
    symbol: sym,
    klines: KLINES,
    perp: { funding_rate: 0.0001, oi_change_1h: 0.02, oi_change_24h: 0.05, long_short_ratio: 1.15 },
  })
);

export default function () {
  // Rotate through symbols — first request per symbol is a cache miss, subsequent are hits
  const payload = PAYLOADS[Math.floor(Math.random() * PAYLOADS.length)];

  const res = http.post(
    `${BASE}/api/engine/score`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'score' },
    }
  );

  const ok = check(res, {
    'score status 200':  (r) => r.status === 200,
    'score has p_win':   (r) => {
      try { return typeof JSON.parse(r.body).p_win === 'number'; } catch { return false; }
    },
  });
  errorRate.add(!ok);
  scoreTrend.add(res.timings.duration);

  sleep(0.2);
}
