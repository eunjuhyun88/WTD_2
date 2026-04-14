export interface StreamTerminalMessageOptions {
  endpoint: string;
  body: unknown;
  onEvent: (event: any) => Promise<void> | void;
  onTextDelta: (text: string) => void;
  onStreamError: (message: string) => void;
}

export function snapshotFingerprint(snap: {
  symbol?: string;
  timeframe?: string;
  rsi14?: number;
  funding_rate?: number;
  oi_change_1h?: number;
  cvd_state?: string;
  regime?: string;
} | null | undefined): string {
  if (!snap) return '';
  return [
    snap.symbol ?? '',
    snap.timeframe ?? '',
    snap.rsi14 != null ? snap.rsi14.toFixed(1) : '',
    snap.funding_rate != null ? snap.funding_rate.toFixed(5) : '',
    snap.oi_change_1h != null ? snap.oi_change_1h.toFixed(3) : '',
    snap.cvd_state ?? '',
    snap.regime ?? '',
  ].join('|');
}

export function isAnalysisQuery(message: string): boolean {
  const lower = message.toLowerCase();
  return /분석|어때|어떻게|펀딩|oi\b|rsi|추세|시그널|진입|패턴|레짐|regime|signal|analysis|how.*(look|doing)|what.*(think|say)|check/.test(lower);
}

export function formatAgentFailureMessage(detail?: string, prefix = 'AI response failed'): string {
  const cleanDetail = detail?.trim();
  return cleanDetail ? `${prefix}: ${cleanDetail}` : prefix;
}

export async function streamTerminalMessage(options: StreamTerminalMessageOptions): Promise<{
  assistantText: string;
  streamError: string;
}> {
  const { endpoint, body, onEvent, onTextDelta, onStreamError } = options;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    const message = errBody ? `HTTP ${res.status} ${errBody.slice(0, 120)}` : `HTTP ${res.status}`;
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  let streamError = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const event = JSON.parse(raw);
        await onEvent(event);
        if (event.type === 'text_delta') {
          assistantText += event.text ?? '';
          onTextDelta(assistantText);
        } else if (event.type === 'error') {
          streamError = event.message ?? 'Unknown stream error';
          onStreamError(streamError);
        }
      } catch {
        // Ignore malformed event chunks and continue stream consumption.
      }
    }
  }

  return { assistantText, streamError };
}
