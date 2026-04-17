import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runTerminalScan } from './terminalApi';

type MockResponseInit = {
  status?: number;
  body?: unknown;
};

function mockJsonResponse({ status = 200, body = {} }: MockResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('runTerminalScan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns sync scan response for 200 payload', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: 200,
          body: {
            success: true,
            scanId: 'scan-sync-1',
            persisted: true,
            data: { scanId: 'scan-sync-1', signals: [] },
          },
        }),
      );

    const result = await runTerminalScan('BTC/USDT', '4h');

    expect(result.success).toBe(true);
    expect(result.scanId).toBe('scan-sync-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/terminal/scan',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('accepts async job and polls until completion', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: 202,
          body: { success: true, async: true, state: 'running', jobId: 'job-1' },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: 200,
          body: { success: true, state: 'running', jobId: 'job-1' },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: 200,
          body: {
            success: true,
            state: 'completed',
            jobId: 'job-1',
            scanId: 'scan-async-1',
            persisted: true,
            data: { scanId: 'scan-async-1', signals: [] },
          },
        }),
      );

    const result = await runTerminalScan('BTC/USDT', '4h', {
      preferAsync: true,
      poll: { intervalMs: 1, maxMs: 1_000 },
    });

    expect(result.success).toBe(true);
    expect(result.scanId).toBe('scan-async-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/terminal/scan/jobs/job-1', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/terminal/scan/jobs/job-1', expect.any(Object));
  });

  it('throws when async job reports failure', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: 202,
          body: { success: true, async: true, state: 'running', jobId: 'job-err' },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: 200,
          body: { success: false, state: 'failed', jobId: 'job-err', error: 'Scan failed' },
        }),
      );

    await expect(
      runTerminalScan('BTC/USDT', '4h', {
        preferAsync: true,
        poll: { intervalMs: 1, maxMs: 1_000 },
      }),
    ).rejects.toThrow('Scan failed');
  });
});
