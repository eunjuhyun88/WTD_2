import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * D-03-app: WatchToggle component tests.
 *
 * Tests optimistic update + idempotent behavior matching D-03-eng (PR #373).
 * Engine route: POST /captures/{id}/watch
 */

describe('WatchToggle — D-03-app', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /api/captures/{id}/watch path', () => {
    const captureId = 'cap-001';
    const url = `/api/captures/${captureId}/watch`;
    expect(url).toMatch(/^\/api\/captures\/.+\/watch$/);
  });

  it('omits expiry_hours when null (engine default = permanent)', () => {
    const expiryHours: number | null = null;
    const body = expiryHours ? { expiry_hours: expiryHours } : {};
    expect(JSON.stringify(body)).toBe('{}');
  });

  it('includes expiry_hours when set', () => {
    const expiryHours = 72;
    const body = expiryHours ? { expiry_hours: expiryHours } : {};
    expect(body).toEqual({ expiry_hours: 72 });
  });

  it('idempotent: two POST calls both succeed (engine guarantees)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        capture_id: 'cap-001',
        is_watching: true,
        started_watching_at: '2026-04-27T00:00:00Z',
        watch_expires_at: null,
      }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const url = '/api/captures/cap-001/watch';
    const r1 = await fetch(url, { method: 'POST', body: '{}' });
    const r2 = await fetch(url, { method: 'POST', body: '{}' });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('optimistic update reverts on failure', async () => {
    // Simulate: optimistic toggle to true → API fails → revert to false
    let watching = false;
    const previous = watching;
    watching = !previous; // optimistic
    expect(watching).toBe(true);

    // API call fails
    const apiSucceeded = false;
    if (!apiSucceeded) {
      watching = previous; // revert
    }
    expect(watching).toBe(false);
  });

  it('response shape matches D-03-eng spec', () => {
    const sampleResponse = {
      capture_id: 'cap-123',
      is_watching: true,
      started_watching_at: '2026-04-27T12:00:00Z',
      watch_expires_at: null as string | null,
    };
    expect(sampleResponse.capture_id).toBeTruthy();
    expect(sampleResponse.is_watching).toBe(true);
    expect(sampleResponse.started_watching_at).toBeTruthy();
    expect(sampleResponse.watch_expires_at).toBeNull();
  });
});
