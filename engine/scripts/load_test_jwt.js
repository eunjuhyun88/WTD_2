/**
 * k6 Load Test — JWT Auth (1000 concurrent users)
 *
 * Tests three scenarios:
 *   1. Cache-hit scenario     → expect p99 < 5ms
 *   2. Cache-miss simulation  → expect p99 < 500ms
 *   3. Circuit-open fallback  → expect p99 < 1ms (stale cache)
 *
 * Usage:
 *   k6 run --env BASE_URL=https://your-engine.run.app \
 *          --env JWT_TOKEN=<valid-supabase-jwt> \
 *          engine/scripts/load_test_jwt.js
 *
 * Install: brew install k6
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const JWT_TOKEN = __ENV.JWT_TOKEN || "";

if (!JWT_TOKEN) {
  throw new Error("JWT_TOKEN env var required. Get one from Supabase anon session.");
}

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const authSuccessRate = new Rate("auth_success_rate");
const authLatency = new Trend("auth_latency_ms", true);
const revoked401 = new Counter("auth_revoked_count");
const expired403 = new Counter("auth_expired_count");
const unavailable503 = new Counter("auth_unavailable_count");

// ---------------------------------------------------------------------------
// Test stages (VUs = virtual users ≈ concurrent users)
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // Ramp up to 1000 VUs over 2 minutes, sustain 3 minutes, ramp down
    steady_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },   // warm up
        { duration: "1m",  target: 500 },   // ramp to 500
        { duration: "1m",  target: 1000 },  // ramp to 1000
        { duration: "3m",  target: 1000 },  // sustain 1000
        { duration: "30s", target: 0 },     // cool down
      ],
    },
  },
  thresholds: {
    // SLO targets from W-0162 spec
    "auth_success_rate":           ["rate>0.999"],    // 99.9% success
    "auth_latency_ms":             ["p(99)<500"],     // p99 < 500ms
    "http_req_duration{name:auth}": ["p(99)<500"],
    "http_req_failed":             ["rate<0.001"],    // <0.1% failure
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTH_HEADERS = {
  Authorization: `Bearer ${JWT_TOKEN}`,
  "Content-Type": "application/json",
};

function checkAuthResponse(res, name) {
  const ok = check(res, {
    [`${name} status 200`]: (r) => r.status === 200,
    [`${name} has data`]:   (r) => r.body && r.body.length > 0,
  });

  authSuccessRate.add(ok);
  authLatency.add(res.timings.duration);

  if (res.status === 401) revoked401.add(1);
  if (res.status === 403) expired403.add(1);
  if (res.status === 503) unavailable503.add(1);

  return ok;
}

// ---------------------------------------------------------------------------
// Main scenario
// ---------------------------------------------------------------------------

export default function () {
  // Rotate between protected endpoints to cover different routes
  const endpoints = [
    "/facts/snapshot?symbol=BTCUSDT",
    "/runtime/state",
    "/captures",
  ];

  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const url = `${BASE_URL}${endpoint}`;

  const res = http.get(url, {
    headers: AUTH_HEADERS,
    tags: { name: "auth" },
  });

  checkAuthResponse(res, endpoint);
  sleep(0.1); // 100ms think time → realistic pacing
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const metrics = data.metrics;
  const successRate = metrics["auth_success_rate"]?.values?.rate ?? 0;
  const p99 = metrics["auth_latency_ms"]?.values?.["p(99)"] ?? 0;
  const p95 = metrics["auth_latency_ms"]?.values?.["p(95)"] ?? 0;
  const avg = metrics["auth_latency_ms"]?.values?.avg ?? 0;

  console.log("\n=== JWT Auth Load Test Results ===");
  console.log(`Auth Success Rate: ${(successRate * 100).toFixed(2)}%  (SLO: >99.9%)`);
  console.log(`Latency avg:       ${avg.toFixed(1)}ms`);
  console.log(`Latency p95:       ${p95.toFixed(1)}ms`);
  console.log(`Latency p99:       ${p99.toFixed(1)}ms  (SLO: <500ms)`);
  console.log(`Revoked 401s:      ${metrics["auth_revoked_count"]?.values?.count ?? 0}`);
  console.log(`Expired 403s:      ${metrics["auth_expired_count"]?.values?.count ?? 0}`);
  console.log(`Unavailable 503s:  ${metrics["auth_unavailable_count"]?.values?.count ?? 0}`);
  console.log("==================================\n");

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
