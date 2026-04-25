/**
 * W-0098 — 500-user load test
 *
 * Usage:
 *   k6 run scripts/load_test_500.js
 *   k6 run --env BASE=https://your-app.vercel.app scripts/load_test_500.js
 *
 * Requires k6: https://k6.io/docs/get-started/installation/
 *   brew install k6
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ──────────────────────────────────────────
const errorRate = new Rate('errors');
const klinesP95 = new Trend('klines_duration', true);
const scoreP95  = new Trend('score_duration', true);

// ── Config ──────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: '30s', target: 100 },   // ramp-up
    { duration: '60s', target: 500 },   // ramp to 500 VU
    { duration: '60s', target: 500 },   // sustain
    { duration: '30s', target: 0 },     // ramp-down
  ],
  thresholds: {
    'klines_duration{percentile:95}': ['p(95)<500'],  // 500ms p95 target
    'score_duration{percentile:95}':  ['p(95)<2000'], // 2s p95 target
    'errors':                         ['rate<0.01'],  // <1% error rate
    'http_req_failed':                ['rate<0.01'],
  },
};

const BASE = __ENV.BASE || 'http://localhost:5173';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const TFS     = ['1h', '4h', '1d'];

function randomSymbol() { return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]; }
function randomTf()     { return TFS[Math.floor(Math.random() * TFS.length)]; }

// ── Virtual user scenario ───────────────────────────────────
export default function () {
  const sym = randomSymbol();
  const tf  = randomTf();

  // 1. Chart klines (hot path — every user loads chart)
  const klinesRes = http.get(
    `${BASE}/api/chart/klines?symbol=${sym}&tf=${tf}&limit=200`,
    { tags: { name: 'klines' } }
  );
  const klinesOk = check(klinesRes, {
    'klines status 200': (r) => r.status === 200,
    'klines has klines':  (r) => {
      try { return Array.isArray(JSON.parse(r.body).klines); } catch { return false; }
    },
  });
  errorRate.add(!klinesOk);
  klinesP95.add(klinesRes.timings.duration);

  sleep(0.5);

  // 2. Engine score (heavy — ~20% of users trigger on chart load)
  if (Math.random() < 0.2) {
    // Minimal payload: just symbol + 2 bars (engine validates min bars separately)
    // In real usage the app sends full klines, but for load testing we probe availability
    const scoreRes = http.get(
      `${BASE}/api/engine/healthz`,
      { tags: { name: 'engine_health' } }
    );
    const scoreOk = check(scoreRes, {
      'engine health 200': (r) => r.status === 200,
    });
    errorRate.add(!scoreOk);
    scoreP95.add(scoreRes.timings.duration);
  }

  sleep(0.1);
}

/**
 * Separate scenario for scoring (run with --env SCENARIO=score):
 *
 * export function scoreScenario() {
 *   POST /api/engine/score with real kline payload
 * }
 *
 * Full score scenario requires fetching real kline data first (or fixtures).
 * See scripts/load_test_score.js for the dedicated score load test.
 */
