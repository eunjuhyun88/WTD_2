import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 100),
  duration: __ENV.DURATION || '60s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SYMBOL = __ENV.SYMBOL || 'BTCUSDT';
const TF = __ENV.TF || '1h';

export default function () {
  const res = http.get(`${BASE_URL}/api/cogochi/analyze?symbol=${SYMBOL}&tf=${TF}`);
  check(res, {
    'status is 200 or 503': (r) => r.status === 200 || r.status === 503,
    'has request id': (r) => !!r.headers['X-Request-Id'] || !!r.headers['x-request-id'],
  });
  sleep(0.2);
}

