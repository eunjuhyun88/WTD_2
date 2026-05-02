// Microstructure WebSocket Broadcaster — Phase 3 stub
// Singleton hub: 1 upstream WebSocket fan-out to N subscribers.
// Full implementation deferred pending Phase 1-2 perf data (Go/No-Go).

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
  private readonly maxReconnectAttempts = 5;

  subscribe(
    id: string,
    symbols: string[],
    send: (msg: MicrostructureMessage) => void,
    audienceFilter?: (msg: MicrostructureMessage) => boolean,
  ): () => void {
    this.subscribers.set(id, { id, symbols: new Set(symbols), send, audienceFilter });
    this.ensureConnected();
    return () => {
      this.subscribers.delete(id);
      if (this.subscribers.size === 0) this.disconnect();
    };
  }

  updateSubscription(id: string, symbols: string[]): void {
    const sub = this.subscribers.get(id);
    if (sub) sub.symbols = new Set(symbols);
  }

  broadcast(msg: MicrostructureMessage): void {
    for (const [, sub] of this.subscribers) {
      if (!sub.symbols.has(msg.symbol)) continue;
      if (sub.audienceFilter && !sub.audienceFilter(msg)) continue;
      try { sub.send(msg); } catch (err) {
        console.error(`[broadcaster] send error to ${sub.id}:`, err);
      }
    }
  }

  stats(): { subscriberCount: number; totalSymbols: number; connected: boolean } {
    const allSymbols = new Set<string>();
    for (const [, sub] of this.subscribers) {
      for (const sym of sub.symbols) allSymbols.add(sym);
    }
    return {
      subscriberCount: this.subscribers.size,
      totalSymbols: allSymbols.size,
      connected: this.hubSocket?.readyState === WebSocket.OPEN,
    };
  }

  private ensureConnected(): void {
    if (this.hubSocket?.readyState === WebSocket.OPEN) return;
    if (this.subscribers.size === 0) return;
    this.connect();
  }

  private connect(): void {
    try {
      const wsUrl = process.env.MICROSTRUCTURE_WS_URL ?? 'ws://localhost:9000/feed';
      this.hubSocket = new WebSocket(wsUrl);

      this.hubSocket.onopen = () => {
        this.reconnectAttempts = 0;
        const allSymbols = new Set<string>();
        for (const [, sub] of this.subscribers) {
          for (const sym of sub.symbols) allSymbols.add(sym);
        }
        if (allSymbols.size > 0) {
          this.hubSocket?.send(JSON.stringify({ action: 'subscribe', symbols: Array.from(allSymbols) }));
        }
      };

      this.hubSocket.onmessage = (event) => {
        try {
          this.broadcast(JSON.parse(String(event.data)) as MicrostructureMessage);
        } catch (err) { console.error('[broadcaster] parse error:', err); }
      };

      this.hubSocket.onerror = (err) => { console.error('[broadcaster] WebSocket error:', err); };

      this.hubSocket.onclose = () => {
        this.hubSocket = null;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, ++this.reconnectAttempts), 30_000);
          setTimeout(() => this.connect(), delay);
        }
      };
    } catch (err) { console.error('[broadcaster] connect error:', err); }
  }

  private disconnect(): void {
    this.hubSocket?.close();
    this.hubSocket = null;
  }
}

export const microstructureBroadcaster = new MicrostructureBroadcaster();
