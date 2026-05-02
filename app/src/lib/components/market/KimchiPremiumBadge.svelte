<script lang="ts">
  /**
   * KimchiPremiumBadge — W-0307 F-12
   *
   * 한국 김치 프리미엄(%) 실시간 배지.
   * 5분마다 자동 갱신. 색: 양수=빨강, 음수=파랑, ±0.5% 이내=회색.
   * Tooltip: "Upbit BTC vs Binance BTC × USD/KRW"
   */
  import { onMount, onDestroy } from 'svelte';

  interface KimchiData {
    premium_pct: number;
    usd_krw: number | null;
    ts: number;
    source: string;
  }

  let data = $state<KimchiData | null>(null);
  let stale = $state(false);
  let loading = $state(true);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const REFRESH_MS = 5 * 60 * 1000; // 5분
  const STALE_THRESHOLD_MS = 6 * 60 * 1000; // 6분 넘으면 stale

  async function load() {
    try {
      const res = await fetch('/api/market/kimchi-premium');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      data = body.data as KimchiData;
      stale = false;
    } catch {
      stale = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    intervalId = setInterval(() => void load(), REFRESH_MS);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });

  const pct = $derived(data?.premium_pct ?? 0);
  const sign = $derived(pct > 0 ? '+' : '');
  const color = $derived(
    pct > 0.5 ? 'positive' : pct < -0.5 ? 'negative' : 'neutral'
  );
  const label = $derived(`${sign}${pct.toFixed(2)}%`);
  const isStale = $derived(stale || (data ? Date.now() - data.ts * 1000 > STALE_THRESHOLD_MS : false));
  const tooltip = $derived(
    data
      ? `Kimchi Premium: Upbit BTC vs Binance BTC × USD/KRW\nUSD/KRW: ${data.usd_krw ? data.usd_krw.toFixed(0) : 'n/a'}\n갱신: ${new Date(data.ts * 1000).toLocaleTimeString('ko-KR')}`
      : 'Upbit BTC vs Binance BTC × USD/KRW'
  );
</script>

{#if loading}
  <span class="kp-badge kp-loading" title="김치 프리미엄 로딩 중…">🇰🇷 …</span>
{:else}
  <span
    class="kp-badge kp-{color} {isStale ? 'kp-stale' : ''}"
    title={tooltip}
    role="status"
    aria-label="김치 프리미엄 {label}"
  >
    🇰🇷 {label}
    {#if isStale}<span class="kp-stale-icon" aria-hidden="true">⚠</span>{/if}
  </span>
{/if}

<style>
  .kp-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    cursor: default;
    user-select: none;
    transition: opacity 0.2s;
    letter-spacing: 0.04em;
  }

  /* 양수: 한국 표준 빨강 (상승) */
  .kp-positive {
    color: #ff3b30;
    border-color: rgba(255, 59, 48, 0.25);
    background: rgba(255, 59, 48, 0.07);
  }

  /* 음수: 파랑 (하락) */
  .kp-negative {
    color: #007aff;
    border-color: rgba(0, 122, 255, 0.25);
    background: rgba(0, 122, 255, 0.07);
  }

  /* 중립: 회색 */
  .kp-neutral {
    color: rgba(255, 255, 255, 0.45);
    border-color: rgba(255, 255, 255, 0.1);
  }

  /* 로딩 */
  .kp-loading {
    color: rgba(255, 255, 255, 0.3);
    animation: pulse 1.4s ease-in-out infinite;
  }

  /* stale */
  .kp-stale {
    opacity: 0.6;
  }

  .kp-stale-icon {
    font-size: var(--ui-text-xs);
    color: #f59e0b;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.7; }
  }
</style>
