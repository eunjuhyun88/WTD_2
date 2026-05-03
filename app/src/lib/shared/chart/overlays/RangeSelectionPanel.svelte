<script lang="ts">
  /**
   * RangeSelectionPanel — W-0392 Phase 1/2
   *
   * Docks below the chart when a range is fully selected (anchorA + anchorB).
   * Shows: OHLCV summary, key indicators, [판정] + [구간만 저장] CTAs.
   *
   * Feature-flag: PUBLIC_RANGE_JUDGE_FLYWHEEL=false → component renders nothing.
   */

  import { selectedRange, chartSaveMode } from '$lib/stores/chartSaveMode';
  import { buildIndicatorSnapshotFromRange, MIN_RANGE_BARS, MIN_SNAPSHOT_KEYS, REQUIRED_SNAPSHOT_KEYS } from '$lib/terminal/buildIndicatorSnapshotFromRange';
  import type { RangeSnapshotResult, JudgeVerdict } from '$lib/terminal/buildIndicatorSnapshotFromRange';

  interface Props {
    symbol: string;
    tf: string;
    onSave?: (verdictJson: JudgeVerdict | null) => Promise<void>;
  }

  let { symbol, tf, onSave }: Props = $props();

  const featureEnabled = import.meta.env.PUBLIC_RANGE_JUDGE_FLYWHEEL !== 'false';

  let rangeResult = $state<RangeSnapshotResult | null>(null);
  let snapshotError = $state<string | null>(null);
  let judging = $state(false);
  let saving = $state(false);
  let verdict = $state<JudgeVerdict | null>(null);
  let judgeError = $state<string | null>(null);
  // 3s cooldown after judge click
  let judgeCooldown = $state(false);
  // verdict cache: key=`from|to|symbol|tf` → JudgeVerdict
  const verdictCache = new Map<string, { v: JudgeVerdict; expiresAt: number }>();

  $effect(() => {
    const range = $selectedRange;
    verdict = null;
    judgeError = null;
    snapshotError = null;

    if (!range || !range.payload) {
      rangeResult = null;
      return;
    }

    const result = buildIndicatorSnapshotFromRange(range.payload, range.anchorA, range.anchorB);
    if (!result) {
      rangeResult = null;
      const bars = range.payload.klines.filter(
        (k) => k.time >= Math.min(range.anchorA, range.anchorB) &&
               k.time <= Math.max(range.anchorA, range.anchorB),
      ).length;
      snapshotError = bars < MIN_RANGE_BARS
        ? `구간 너무 짧음 (${bars}개 봉 < ${MIN_RANGE_BARS})`
        : `지표 부족 (${MIN_SNAPSHOT_KEYS}개 이상 필요)`;
      return;
    }
    rangeResult = result;
  });

  function cacheKey(r: RangeSnapshotResult) {
    return `${r.fromTs}|${r.toTs}|${symbol}|${tf}`;
  }

  async function handleJudge() {
    if (!rangeResult || judgeCooldown || judging) return;
    judgeError = null;

    // Check cache (5 min TTL)
    const key = cacheKey(rangeResult);
    const cached = verdictCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      verdict = cached.v;
      return;
    }

    judging = true;
    judgeCooldown = true;
    setTimeout(() => { judgeCooldown = false; }, 3000);

    try {
      const res = await fetch('/api/engine/agent/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe: tf,
          indicator_snapshot: rangeResult.snapshot,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as JudgeVerdict;
      verdict = data;
      verdictCache.set(key, { v: data, expiresAt: Date.now() + 5 * 60 * 1000 });
    } catch (e) {
      judgeError = `판정 실패: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      judging = false;
    }
  }

  async function handleSave(withVerdict: boolean) {
    if (saving) return;
    saving = true;
    try {
      await onSave?.(withVerdict ? verdict : null);
      chartSaveMode.exitRangeMode();
    } finally {
      saving = false;
    }
  }

  function fmtPrice(n: number) {
    return n >= 1000
      ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : n.toPrecision(5);
  }

  function fmtVol(n: number) {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
  }

  function fmtTs(ts: number) {
    return new Date(ts * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
  }

  const indicatorLabels: Record<string, string> = {
    rsi_14:    'RSI',
    vol_z_20:  'Vol-Z',
    atr_pct_14:'ATR%',
    macd_hist: 'MACD-H',
    bb_width:  'BB폭',
    ret_5b:    'Ret5b',
    ret_20b:   'Ret20b',
  };
</script>

{#if featureEnabled}
  {#if snapshotError}
    <div class="rsp rsp--error">
      <span class="rsp__err-icon">⚠</span>
      <span class="rsp__err-text">{snapshotError}</span>
      <button class="rsp__close" onclick={() => chartSaveMode.exitRangeMode()}>✕</button>
    </div>
  {:else if rangeResult}
    <div class="rsp">
      <!-- Header row -->
      <div class="rsp__header">
        <span class="rsp__title">
          {symbol} · {tf} · {rangeResult.nBars}봉
          ({fmtTs(rangeResult.fromTs)} ~ {fmtTs(rangeResult.toTs)})
        </span>
        <button class="rsp__close" onclick={() => chartSaveMode.exitRangeMode()}>✕</button>
      </div>

      <!-- OHLCV row -->
      <div class="rsp__ohlcv">
        <span>O:<b>{fmtPrice(rangeResult.openPrice)}</b></span>
        <span>H:<b>{fmtPrice(rangeResult.highPrice)}</b></span>
        <span>L:<b>{fmtPrice(rangeResult.lowPrice)}</b></span>
        <span>C:<b>{fmtPrice(rangeResult.closePrice)}</b></span>
        <span class="rsp__ret" class:rsp__ret--pos={rangeResult.retPct >= 0} class:rsp__ret--neg={rangeResult.retPct < 0}>
          {rangeResult.retPct >= 0 ? '+' : ''}{rangeResult.retPct.toFixed(2)}%
        </span>
        <span>Vol:<b>{fmtVol(rangeResult.totalVolume)}</b></span>
      </div>

      <!-- Indicator chips -->
      <div class="rsp__indicators">
        {#each REQUIRED_SNAPSHOT_KEYS as key}
          {#if key in rangeResult.snapshot}
            <span class="rsp__chip">
              {indicatorLabels[key] ?? key}:<b>{rangeResult.snapshot[key].toFixed(2)}</b>
            </span>
          {/if}
        {/each}
      </div>

      <!-- Verdict (after judge) -->
      {#if verdict}
        <div class="rsp__verdict">
          <span class="rsp__verdict-dir" class:rsp__verdict-dir--long={verdict.verdict?.toUpperCase() === 'LONG'} class:rsp__verdict-dir--short={verdict.verdict?.toUpperCase() === 'SHORT'}>
            {verdict.verdict?.toUpperCase()}
          </span>
          {#if verdict.entry != null}
            <span>Entry:<b>{fmtPrice(verdict.entry)}</b></span>
          {/if}
          {#if verdict.stop != null}
            <span>Stop:<b>{fmtPrice(verdict.stop)}</b></span>
          {/if}
          {#if verdict.target != null}
            <span>Target:<b>{fmtPrice(verdict.target)}</b></span>
          {/if}
          {#if verdict.rr != null}
            <span>RR:<b>{verdict.rr.toFixed(1)}</b></span>
          {/if}
          {#if verdict.rationale}
            <p class="rsp__rationale">{verdict.rationale}</p>
          {/if}
        </div>
      {/if}

      {#if judgeError}
        <p class="rsp__judge-error">{judgeError}</p>
      {/if}

      <!-- CTA row -->
      <div class="rsp__ctas">
        <button
          class="rsp__btn rsp__btn--judge"
          disabled={judging || judgeCooldown}
          onclick={handleJudge}
        >
          {judging ? '판정 중…' : '판정'}
        </button>
        <button
          class="rsp__btn rsp__btn--save"
          disabled={saving}
          onclick={() => handleSave(!!verdict)}
        >
          {saving ? '저장 중…' : verdict ? '저장' : '구간만 저장'}
        </button>
      </div>
    </div>
  {/if}
{/if}

<style>
  .rsp {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 14px;
    background: var(--color-surface-2, #1a1d23);
    border-top: 1px solid var(--color-border, #2c2f38);
    font-size: 12px;
    color: var(--color-text-secondary, #9aa0b0);
  }

  .rsp--error {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
  }

  .rsp__err-icon { color: var(--color-warning, #f59e0b); font-size: 14px; }
  .rsp__err-text { flex: 1; }

  .rsp__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .rsp__title {
    font-weight: 600;
    color: var(--color-text-primary, #e2e8f0);
    font-size: 11px;
    letter-spacing: 0.02em;
  }

  .rsp__close {
    background: none;
    border: none;
    color: var(--color-text-muted, #64748b);
    cursor: pointer;
    font-size: 13px;
    padding: 0 2px;
    line-height: 1;
  }
  .rsp__close:hover { color: var(--color-text-primary, #e2e8f0); }

  .rsp__ohlcv {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 11px;
  }

  .rsp__ohlcv b { color: var(--color-text-primary, #e2e8f0); }

  .rsp__ret { font-weight: 700; }
  .rsp__ret--pos { color: var(--color-buy, #22c55e); }
  .rsp__ret--neg { color: var(--color-sell, #ef4444); }

  .rsp__indicators {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .rsp__chip {
    background: var(--color-surface-3, #242830);
    border: 1px solid var(--color-border, #2c2f38);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10px;
  }

  .rsp__chip b { color: var(--color-text-primary, #e2e8f0); margin-left: 2px; }

  .rsp__verdict {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--color-surface-3, #242830);
    border-radius: 6px;
    font-size: 11px;
  }

  .rsp__verdict b { color: var(--color-text-primary, #e2e8f0); }

  .rsp__verdict-dir {
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 0.05em;
  }
  .rsp__verdict-dir--long  { color: var(--color-buy, #22c55e); }
  .rsp__verdict-dir--short { color: var(--color-sell, #ef4444); }

  .rsp__rationale {
    width: 100%;
    margin: 2px 0 0;
    font-size: 10px;
    color: var(--color-text-muted, #64748b);
    line-height: 1.4;
  }

  .rsp__judge-error {
    color: var(--color-error, #ef4444);
    font-size: 10px;
    margin: 0;
  }

  .rsp__ctas {
    display: flex;
    gap: 8px;
    margin-top: 2px;
  }

  .rsp__btn {
    flex: 1;
    padding: 6px 10px;
    border-radius: 5px;
    border: none;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: opacity 0.15s;
  }

  .rsp__btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .rsp__btn--judge {
    background: var(--color-accent, #6366f1);
    color: #fff;
  }
  .rsp__btn--judge:not(:disabled):hover { opacity: 0.85; }

  .rsp__btn--save {
    background: var(--color-surface-3, #242830);
    color: var(--color-text-primary, #e2e8f0);
    border: 1px solid var(--color-border, #2c2f38);
  }
  .rsp__btn--save:not(:disabled):hover { background: var(--color-surface-4, #2e3240); }
</style>
