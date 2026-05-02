<script lang="ts">
  /**
   * AlertStrip — W-0391-D
   *
   * Dashboard 최상단 48px 알림 스트립.
   * OI 급등 / FR 이상값 / Kimchi Premium 실시간 표시.
   * 30초마다 폴링. Mute 48시간 유지.
   */
  import { onMount, onDestroy } from 'svelte';

  // ─── Types ────────────────────────────────────────────────────────────────

  interface Alert {
    id: string;
    text: string;
  }

  interface IndicatorContextPayload {
    symbol: string;
    at: number;
    context: {
      oi_change_1h?: { value: number; percentile: number };
      funding_rate?: { value: number; percentile: number };
      oi_change_4h?: { value: number; percentile: number };
    };
  }

  interface KimchiPayload {
    premium_pct: number;
    source: string;
    ts: number;
  }

  // ─── State ────────────────────────────────────────────────────────────────

  let alerts = $state<Alert[]>([]);
  let muted = $state(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  // ─── Thresholds ────────────────────────────────────────────────────────────

  const OI_SPIKE_THRESHOLD = 0.10;      // +10% OI change (1h proxy for ~30m spike)
  const FR_HIGH_THRESHOLD  = 0.0005;    // +0.05%
  const FR_LOW_THRESHOLD   = -0.0003;   // -0.03%
  const KIMCHI_THRESHOLD   = 2.5;       // ≥ 2.5%

  // ─── Mute helpers ─────────────────────────────────────────────────────────

  const MUTE_KEY = 'alerts.muted';
  const MUTE_DURATION_MS = 48 * 60 * 60 * 1000; // 48h

  function checkMuted(): boolean {
    try {
      const raw = localStorage.getItem(MUTE_KEY);
      if (!raw) return false;
      const ts = Number(raw);
      if (Date.now() - ts < MUTE_DURATION_MS) return true;
      localStorage.removeItem(MUTE_KEY);
      return false;
    } catch {
      return false;
    }
  }

  function mute() {
    try {
      localStorage.setItem(MUTE_KEY, String(Date.now()));
    } catch { /* storage unavailable */ }
    muted = true;
  }

  // ─── Data fetch ────────────────────────────────────────────────────────────

  async function parseIndicator(res: PromiseSettledResult<Response>, symbol: string): Promise<Alert[]> {
    if (res.status !== 'fulfilled' || !res.value.ok) return [];
    let body: IndicatorContextPayload;
    try {
      body = (await res.value.json()) as IndicatorContextPayload;
    } catch {
      return [];
    }
    const ctx = body?.context;
    if (!ctx) return [];

    const found: Alert[] = [];

    // OI spike: oi_change_1h > 10% (as decimal, e.g. 0.12 = 12%)
    const oiChange = ctx.oi_change_1h?.value;
    if (oiChange != null && Math.abs(oiChange) > OI_SPIKE_THRESHOLD) {
      const dir = oiChange > 0 ? '+' : '';
      const hint = oiChange > 0 ? '숏스퀴즈 선행' : '롱스퀴즈 선행';
      found.push({
        id: `oi-${symbol}`,
        text: `${symbol} OI ${dir}${(oiChange * 100).toFixed(1)}%/1h (${hint})`,
      });
    }

    // FR anomaly: funding_rate > 0.05% or < -0.03%
    const fr = ctx.funding_rate?.value;
    if (fr != null && (fr > FR_HIGH_THRESHOLD || fr < FR_LOW_THRESHOLD)) {
      const sign = fr > 0 ? '+' : '';
      const note = fr > FR_HIGH_THRESHOLD ? '롱 과열' : '숏 과열';
      found.push({
        id: `fr-${symbol}`,
        text: `${symbol} FR ${sign}${(fr * 100).toFixed(4)}% (${note})`,
      });
    }

    return found;
  }

  async function fetchAlerts(): Promise<void> {
    // Fetch in parallel: BTC + ETH indicator-context + Kimchi Premium
    const [btcRes, ethRes, kimchiRes] = await Promise.allSettled([
      fetch('/api/market/indicator-context?symbol=BTCUSDT'),
      fetch('/api/market/indicator-context?symbol=ETHUSDT'),
      fetch('/api/market/kimchi-premium'),
    ]);

    const [btcAlerts, ethAlerts] = await Promise.all([
      parseIndicator(btcRes, 'BTC'),
      parseIndicator(ethRes, 'ETH'),
    ]);

    const next: Alert[] = [...btcAlerts, ...ethAlerts];

    // Kimchi Premium
    if (kimchiRes.status === 'fulfilled' && kimchiRes.value.ok) {
      const body = await kimchiRes.value.json().catch(() => null) as { data?: KimchiPayload } | null;
      const pct = body?.data?.premium_pct;
      if (pct != null && Math.abs(pct) >= KIMCHI_THRESHOLD) {
        const dir = pct >= 0 ? '' : '−';
        const note = pct >= 0 ? '상단 저항' : '하단 지지';
        next.push({
          id: 'kimchi',
          text: `Kim ${dir}${Math.abs(pct).toFixed(2)}% → ${note}`,
        });
      }
    }

    alerts = next;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  onMount(() => {
    muted = checkMuted();
    if (!muted) {
      void fetchAlerts();
      intervalId = setInterval(() => void fetchAlerts(), 30_000);
    }
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });

  // ─── Derived ──────────────────────────────────────────────────────────────

  const visible = $derived(!muted && alerts.length > 0);
</script>

{#if visible}
  <div class="alert-strip" role="status" aria-live="polite" aria-label="시장 알림">
    <span class="alert-icon" aria-hidden="true">⚡</span>
    <div class="alert-list">
      {#each alerts as alert (alert.id)}
        <span class="alert-item">{alert.text}</span>
        {#if alert !== alerts[alerts.length - 1]}
          <span class="alert-sep" aria-hidden="true">│</span>
        {/if}
      {/each}
    </div>
    <button
      class="alert-mute"
      type="button"
      aria-label="알림 48시간 숨기기"
      onclick={mute}
    >×</button>
  </div>
{/if}

<style>
  .alert-strip {
    display: flex;
    align-items: center;
    height: 48px;
    padding: 0 12px;
    background: var(--g2, #131110);
    border-bottom: 1px solid var(--g3, #1c1918);
    gap: 8px;
    overflow: hidden;
    box-sizing: border-box;
  }

  .alert-icon {
    font-size: var(--ui-text-xs);
    color: var(--amb, #f5a623);
    flex-shrink: 0;
    line-height: 1;
  }

  .alert-list {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    overflow: hidden;
  }

  .alert-item {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: var(--ui-text-xs);
    color: var(--amb, #f5a623);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .alert-sep {
    color: var(--g4, #272320);
    font-size: var(--ui-text-xs);
    flex-shrink: 0;
  }

  .alert-mute {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: var(--g6, #6b6460);
    font-size: var(--ui-text-xs);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
    transition: color 0.15s;
  }

  .alert-mute:hover {
    color: var(--g9, #eceae8);
  }
</style>
