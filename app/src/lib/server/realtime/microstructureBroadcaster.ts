// ═══════════════════════════════════════════════════════════════
// Microstructure WebSocket Broadcaster
// ═══════════════════════════════════════════════════════════════
// Singleton hub for broadcasting microstructure updates to all connected clients.
// Transition from per-user connections (N×500 CCU) to single shared hub (1 conn).

interface MicrostructureMessage {
  type: 'quote' | 'trade' | 'book' | 'liquidation';
  symbol: string;
  data: Record<string, unknown>;
  ts: number;
}

interface MicrostructureSubscriber {
  id: string;
  symbols: Set<string>;
  send: (msg: MicrostructureMessage) => void;
  audienceFilter?: (msg: MicrostructureMessage) => boolean;
}

export class MicrostructureBroadcaster {
  private subscribers = new Map<string, MicrostructureSubscriber>();
  private hubSocket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  subscribe(
    id: string,
    symbols: string[],
    send: (msg: MicrostructureMessage) => void,
    audienceFilter?: (msg: MicrostructureMessage) => boolean,
  ): () => void {
    const subscriber: MicrostructureSubscriber = {
      id,
      symbols: new Set(symbols),
      send,
      audienceFilter,
    };

    this.subscribers.set(id, subscriber);
    this.ensureConnected();

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(id);
      if (this.subscribers.size === 0) {
        this.disconnect();
      }
    };
  }

  updateSubscription(id: string, symbols: string[]): void {
    const sub = this.subscribers.get(id);
    if (sub) {
      sub.symbols = new Set(symbols);
    }
  }

  broadcast(msg: MicrostructureMessage): void {
    for (const [, sub] of this.subscribers) {
      // Check if subscriber is interested in this symbol
      if (!sub.symbols.has(msg.symbol)) continue;

      // Apply audience filter (e.g., cross-tenant isolation)
      if (sub.audienceFilter && !sub.audienceFilter(msg)) continue;

      try {
        sub.send(msg);
      } catch (err) {
        console.error(`[broadcaster] send error to ${sub.id}:`, err);
      }
    }
  }

  private ensureConnected(): void {
    if (this.hubSocket && this.hubSocket.readyState === WebSocket.OPEN) {
      return;
    }

    // Only reconnect if we have subscribers
    if (this.subscribers.size === 0) return;

    this.connect();
  }

  private connect(): void {
    try {
      // In production, connect to microstructure feed endpoint
      // For now, stub the connection
      const wsUrl = process.env.MICROSTRUCTURE_WS_URL ?? 'ws://localhost:9000/feed';
      this.hubSocket = new WebSocket(wsUrl);

      this.hubSocket.onopen = () => {
        console.log('[broadcaster] WebSocket connected');
        this.reconnectAttempts = 0;

        // Subscribe to all unique symbols from subscribers
        const allSymbols = new Set<string>();
        for (const [, sub] of this.subscribers) {
          for (const sym of sub.symbols) {
            allSymbols.add(sym);
          }
        }

        if (allSymbols.size > 0) {
          this.hubSocket?.send(
            JSON.stringify({
              action: 'subscribe',
              symbols: Array.from(allSymbols),
            }),
          );
        }
      };

      this.hubSocket.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as MicrostructureMessage;
          this.broadcast(msg);
        } catch (err) {
          console.error('[broadcaster] parse error:', err);
        }
      };

      this.hubSocket.onerror = (err) => {
        console.error('[broadcaster] WebSocket error:', err);
      };

      this.hubSocket.onclose = () => {
        console.warn('[broadcaster] WebSocket closed, will reconnect');
        this.hubSocket = null;

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
          setTimeout(() => this.connect(), delay);
        }
      };
    } catch (err) {
      console.error('[broadcaster] connect error:', err);
    }
  }

  private disconnect(): void {
    if (this.hubSocket) {
      this.hubSocket.close();
      this.hubSocket = null;
    }
  }

  stats(): { subscriberCount: number; totalSymbols: number; connected: boolean } {
    const allSymbols = new Set<string>();
    for (const [, sub] of this.subscribers) {
      for (const sym of sub.symbols) {
        allSymbols.add(sym);
      }
    }

    return {
      subscriberCount: this.subscribers.size,
      totalSymbols: allSymbols.size,
      connected: this.hubSocket?.readyState === WebSocket.OPEN,
    };
  }
}

export const microstructureBroadcaster = new MicrostructureBroadcaster();
