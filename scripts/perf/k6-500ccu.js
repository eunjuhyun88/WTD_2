/**
 * k6 500 CCU Load Test — W-0363 Phase 4
 *
 * 사용법:
 *   k6 run --env BASE_URL=https://app.cogotchi.dev scripts/perf/k6-500ccu.js
 *
 * 목표: 500 VU × 5분 지속, 99th-percentile p99 < 3000ms, 에러율 < 1%
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://app.cogotchi.dev';

export const errorRate = new Rate('errors');
export const apiLatency = new Trend('api_latency', true);

export const options = {
  stages: [
    // 2분 ramp-up → 500 VU
    { duration: '2m', target: 500 },
    // 5분 steady state
    { duration: '5m', target: 500 },
    // 1분 ramp-down
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

// 대표 공개 API 엔드포인트 (CDN 캐시 가능)
const PUBLIC_ENDPOINTS = [
  '/api/market/indicator-context?symbol=BTCUSDT',
  '/api/market/funding-flip?symbol=BTCUSDT',
  '/api/market/rv-cone?symbol=BTCUSDT',
  '/api/market/stablecoin-ssr',
  '/api/market/options-snapshot',
  '/api/market/kimchi-premium',
  '/api/cogochi/thermometer?symbol=BTCUSDT',
  '/api/cogochi/news?symbol=BTCUSDT',
  '/api/confluence/current?symbol=BTCUSDT',
];

export default function () {
  // 각 VU는 랜덤 엔드포인트 순회
  const endpoint = PUBLIC_ENDPOINTS[Math.floor(Math.random() * PUBLIC_ENDPOINTS.length)];
  const url = `${BASE_URL}${endpoint}`;

  const start = Date.now();
  const res = http.get(url, {
    headers: { Accept: 'application/json' },
    timeout: '10s',
  });
  const duration = Date.now() - start;

  apiLatency.add(duration);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'no error body': (r) => !r.json('error'),
    'response < 3s': (r) => r.timings.duration < 3000,
  });

  errorRate.add(!ok);

  // 실제 유저 행동 패턴: 2~5초 간격으로 다음 요청
  sleep(Math.random() * 3 + 2);
}

export function handleSummary(data) {
  return {
    stdout: `
=== W-0363 500 CCU Load Test Results ===
VUs: ${data.metrics.vus_max?.values?.max ?? 'N/A'}
Duration: ${data.state?.testRunDurationMs ? Math.round(data.state.testRunDurationMs / 1000) + 's' : 'N/A'}

HTTP Requests:
  Total:   ${data.metrics.http_reqs?.values?.count ?? 'N/A'}
  Rate:    ${data.metrics.http_reqs?.values?.rate?.toFixed(1) ?? 'N/A'}/s

Latency (ms):
  Median:  ${data.metrics.http_req_duration?.values?.med?.toFixed(0) ?? 'N/A'}
  p95:     ${data.metrics.http_req_duration?.values['p(95)']?.toFixed(0) ?? 'N/A'}
  p99:     ${data.metrics.http_req_duration?.values['p(99)']?.toFixed(0) ?? 'N/A'}
  Max:     ${data.metrics.http_req_duration?.values?.max?.toFixed(0) ?? 'N/A'}

Error Rate: ${data.metrics.errors?.values?.rate?.toFixed(4) ?? 'N/A'}

Thresholds: ${Object.entries(data.metrics)
  .filter(([, m]) => m.thresholds)
  .map(([k, m]) => `${k}: ${Object.values(m.thresholds).every(t => t.ok) ? 'PASS' : 'FAIL'}`)
  .join(', ')}
`,
  };
}
