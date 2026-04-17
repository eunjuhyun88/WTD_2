/**
 * In-memory terminal scan jobs for POST …/scan?async / body.async.
 *
 * Completed payloads mirror `RunTerminalScanResult` for the poller to map
 * into the same shape as synchronous 200 responses.
 *
 * Limits: TTL 15m, best-effort eviction when the map grows large.
 */
import { randomUUID } from 'node:crypto';

import type { RunTerminalScanResult } from '$lib/services/scanService';

export type TerminalScanJobState = 'accepted' | 'running' | 'completed' | 'failed';

export type TerminalScanJobRecord = {
  userId: string;
  state: TerminalScanJobState;
  createdAt: number;
  result?: RunTerminalScanResult;
  error?: string;
};

const jobs = new Map<string, TerminalScanJobRecord>();

const JOB_TTL_MS = 15 * 60 * 1000;
const MAX_JOBS = 400;

function pruneJobs(): void {
  const now = Date.now();
  for (const [id, j] of jobs.entries()) {
    if (now - j.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
  if (jobs.size <= MAX_JOBS) return;
  const sorted = [...jobs.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  const overflow = jobs.size - MAX_JOBS + 20;
  for (let i = 0; i < overflow && i < sorted.length; i++) {
    jobs.delete(sorted[i][0]);
  }
}

export function createTerminalScanJob(userId: string): string {
  pruneJobs();
  const jobId = randomUUID();
  jobs.set(jobId, { userId, state: 'accepted', createdAt: Date.now() });
  return jobId;
}

export function markTerminalScanJobRunning(jobId: string): void {
  const j = jobs.get(jobId);
  if (j) j.state = 'running';
}

export function completeTerminalScanJob(jobId: string, result: RunTerminalScanResult): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.state = 'completed';
  j.result = result;
}

export function failTerminalScanJob(jobId: string, message: string): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.state = 'failed';
  j.error = message;
}

export function getTerminalScanJob(jobId: string, userId: string): TerminalScanJobRecord | null {
  const j = jobs.get(jobId);
  if (!j || j.userId !== userId) return null;
  return j;
}
