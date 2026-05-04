import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// Mock fetch before importing the store
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after stubbing
import { inboxBadgeCount, startInboxBadgePolling, _fetchCount } from '../inboxBadge.store';

describe('inboxBadge.store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    inboxBadgeCount.set(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at 0', () => {
    expect(get(inboxBadgeCount)).toBe(0);
  });

  it('fetchCount sets store from response.count field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 7 }),
    } as unknown as Response);

    await _fetchCount();
    expect(get(inboxBadgeCount)).toBe(7);
  });

  it('fetchCount falls back to items.length when count absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [1, 2, 3] }),
    } as unknown as Response);

    await _fetchCount();
    expect(get(inboxBadgeCount)).toBe(3);
  });

  it('fetchCount ignores non-ok responses', async () => {
    inboxBadgeCount.set(5);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ count: 99 }),
    } as unknown as Response);

    await _fetchCount();
    expect(get(inboxBadgeCount)).toBe(5); // unchanged
  });

  it('fetchCount ignores fetch errors silently', async () => {
    inboxBadgeCount.set(3);
    mockFetch.mockRejectedValueOnce(new Error('network'));

    await _fetchCount();
    expect(get(inboxBadgeCount)).toBe(3); // unchanged
  });
});

describe('InboxDotClickSchema (telemetry)', () => {
  it('validates correct payload', async () => {
    const { InboxDotClickSchema } = await import('$lib/hubs/terminal/telemetry');
    const result = InboxDotClickSchema.safeParse({
      unread_count: 3,
      destination: '/cogochi?panel=vdt',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative unread_count', async () => {
    const { InboxDotClickSchema } = await import('$lib/hubs/terminal/telemetry');
    const result = InboxDotClickSchema.safeParse({
      unread_count: -1,
      destination: '/cogochi?panel=vdt',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong destination', async () => {
    const { InboxDotClickSchema } = await import('$lib/hubs/terminal/telemetry');
    const result = InboxDotClickSchema.safeParse({
      unread_count: 5,
      destination: '/verdict',
    });
    expect(result.success).toBe(false);
  });

  it('count=0 is valid (badge hidden but button accessible)', async () => {
    const { InboxDotClickSchema } = await import('$lib/hubs/terminal/telemetry');
    const result = InboxDotClickSchema.safeParse({
      unread_count: 0,
      destination: '/cogochi?panel=vdt',
    });
    expect(result.success).toBe(true);
  });
});
