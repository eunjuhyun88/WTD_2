/**
 * wsPool.ts — Reference-counted WebSocket deduplication pool
 *
 * W-0288: With 4 chart panes watching the same symbol+tf, we'd normally open
 * 4 separate Binance WebSocket connections.  wsPool lets N subscribers share
 * ONE underlying WS connection and fan-out via callbacks.
 *
 * Usage (inside DataFeed or ChartPane):
 *
 *   const release = wsPool.acquire(wsUrl, (evt) => handleMsg(evt));
 *   // on cleanup:
 *   release();
 *
 * The pool keeps the WS alive as long as at least one subscriber holds a
 * reference.  When the last subscriber releases, the WS is closed cleanly.
 */

type MsgHandler = (evt: MessageEvent) => void;
type ReleaseHandle = () => void;

interface PoolEntry {
  ws: WebSocket;
  handlers: Set<MsgHandler>;
  refCount: number;
}

const _pool = new Map<string, PoolEntry>();

function acquire(url: string, onMessage: MsgHandler): ReleaseHandle {
  let entry = _pool.get(url);

  if (!entry) {
    const ws = new WebSocket(url);
    entry = { ws, handlers: new Set(), refCount: 0 };

    const e = entry; // capture for closure
    ws.onmessage = (evt) => e.handlers.forEach((h) => h(evt));
    ws.onerror   = () => {
      // On error the WS will close; entries are cleaned up via onclose
    };
    ws.onclose   = () => {
      // Only remove if it's still this entry (not replaced by reconnect)
      if (_pool.get(url) === e) _pool.delete(url);
    };
    _pool.set(url, entry);
  }

  entry.handlers.add(onMessage);
  entry.refCount += 1;
  const capturedEntry = entry;
  const capturedUrl   = url;

  return () => {
    capturedEntry.handlers.delete(onMessage);
    capturedEntry.refCount -= 1;
    if (capturedEntry.refCount <= 0) {
      capturedEntry.ws.close();
      if (_pool.get(capturedUrl) === capturedEntry) {
        _pool.delete(capturedUrl);
      }
    }
  };
}

/** Snapshot of current pool entries — for debugging / DevTools. */
function snapshot(): Array<{ url: string; subscribers: number; readyState: number }> {
  return Array.from(_pool.entries()).map(([url, entry]) => ({
    url,
    subscribers: entry.refCount,
    readyState: entry.ws.readyState,
  }));
}

export const wsPool = { acquire, snapshot };
