import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const appDir = path.resolve(import.meta.dirname, '..', '..');
const scriptPath = path.resolve(appDir, 'scripts/perf/performance-audit.mjs');

async function makeSummaryFile(dir, name, payload) {
  const filePath = path.join(dir, name);
  await writeFile(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function runAudit(args = [], env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: appDir,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  });
}

test('runtime-posture-only mode succeeds locally', () => {
  const result = runAudit();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Profile: runtime-posture-only/);
  assert.match(result.stdout, /Findings: 0/);
});

test('strict mode fails when a required summary is missing', () => {
  const result = runAudit(['--strict', '--profile', 'auth-snapshot-500']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /perf\.summary_missing/);
});

test('strict mode passes when the auth profile summary meets budget', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'perf-audit-pass-'));
  try {
    const summaryPath = await makeSummaryFile(tempDir, 'auth-pass.json', {
      metrics: {
        http_req_failed: { values: { rate: 0.01 } },
        http_req_duration: { values: { 'p(95)': 620, 'p(99)': 1200 } },
      },
      options: {
        scenarios: {
          auth_and_snapshot: {
            stages: [
              { duration: '2m', target: 300 },
              { duration: '3m', target: 500 },
            ],
          },
        },
      },
    });

    const result = runAudit(['--strict', '--profile', 'auth-snapshot-500', '--summary', summaryPath]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Findings: 0/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('strict mode fails when the auth profile summary exceeds budget', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'perf-audit-fail-'));
  try {
    const summaryPath = await makeSummaryFile(tempDir, 'auth-fail.json', {
      metrics: {
        http_req_failed: { values: { rate: 0.06 } },
        http_req_duration: { values: { 'p(95)': 1400, 'p(99)': 2100 } },
      },
      options: {
        scenarios: {
          auth_and_snapshot: {
            stages: [
              { duration: '2m', target: 250 },
              { duration: '3m', target: 300 },
            ],
          },
        },
      },
    });

    const result = runAudit(['--strict', '--profile', 'auth-snapshot-500', '--summary', summaryPath]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /perf\.metric_budget_exceeded/);
    assert.match(result.stdout, /perf\.target_vus_not_reached/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('strict mode flags production runtime posture risks', () => {
  const result = runAudit(['--strict'], {
    ENVIRONMENT: 'production',
    RATE_LIMIT_REDIS_REST_URL: '',
    SHARED_CACHE_REDIS_REST_URL: '',
    KV_REST_API_URL: '',
    ENGINE_ENABLE_SCHEDULER: 'true',
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /perf\.distributed_rate_limit_missing/);
  assert.match(result.stdout, /perf\.shared_cache_missing/);
  assert.match(result.stdout, /perf\.public_scheduler_enabled/);
});
