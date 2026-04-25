<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import ChartBoard from '../workspace/ChartBoard.svelte';
  import PeekDrawer from './PeekDrawer.svelte';
  import CaptureReviewDrawer from '../chart/CaptureReviewDrawer.svelte';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { CaptureAnnotation } from '../chart/primitives/CaptureMarkerPrimitive';
  import type { PanelAnalyzeData } from '$lib/terminal/panelAdapter';

  type PeekTab = 'analyze' | 'scan' | 'judge' | 'review';

  interface Props {
    symbol: string;
    tf: string;
    verdictLevels?: Record<string, number>;
    initialData?: ChartSeriesPayload | null;
    depthSnapshot?: any;
    liqSnapshot?: any;
    quantRegime?: any;
    cvdDivergence?: any;
    change24hPct?: number | null;
    showLabCta: boolean;
    labCtaSlug: string | null;
    analyzeCount: number;
    scanCount: number;
    judgeCount: number;
    reviewCount?: number;
    onCaptureSaved: (id: string) => void;
    onTfChange: (tf: string) => void;
    onDismissLabCta: () => void;
    alphaMarkers?: Array<{ timestamp: number; phase: string; label: string; color?: string }>;
    /** W-0210 Layer 1: full analysis data → ChartBoard AlphaOverlayLayer */
    analysisData?: PanelAnalyzeData | null;
    analyze?: Snippet;
    scan?: Snippet;
    judge?: Snippet;
    review?: Snippet;
  }

  let {
    symbol,
    tf,
    verdictLevels = {},
    initialData = null,
    depthSnapshot = null,
    liqSnapshot = null,
    quantRegime = null,
    cvdDivergence = null,
    change24hPct = null,
    showLabCta,
    labCtaSlug,
    analyzeCount,
    scanCount,
    judgeCount,
    reviewCount = 0,
    onCaptureSaved,
    onTfChange,
    onDismissLabCta,
    alphaMarkers = undefined,
    analysisData = null,
    analyze,
    scan,
    judge,
    review,
  }: Props = $props();

  // ── Tablet capture routing (768–1023px) ────────────────────────────────────
  let isTablet = $state(false);
  let selectedCapture = $state<CaptureAnnotation | null>(null);
  let peekOpenTab = $state<PeekTab | null>(null);

  onMount(() => {
    const mq = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    isTablet = mq.matches;
    const onChange = (e: MediaQueryListEvent) => { isTablet = e.matches; };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  function handleCaptureSelect(ann: CaptureAnnotation) {
    selectedCapture = ann;
    peekOpenTab = 'review';
  }

  function clearCapture() {
    selectedCapture = null;
    peekOpenTab = null;
  }

  // Effective reviewCount: bump by 1 when a capture is selected on tablet
  const effectiveReviewCount = $derived(
    reviewCount + (isTablet && selectedCapture ? 1 : 0)
  );
</script>

<main class="center-panel">
  <div class="chart-and-strip">
    <ChartBoard
      {symbol}
      {tf}
      verdictLevels={verdictLevels}
      {initialData}
      depthSnapshot={depthSnapshot}
      liqSnapshot={liqSnapshot}
      quantRegime={quantRegime ?? undefined}
      cvdDivergence={cvdDivergence ?? undefined}
      change24hPct={change24hPct}
      contextMode="chart"
      {alphaMarkers}
      {analysisData}
      {onCaptureSaved}
      {onTfChange}
      onCaptureSelect={isTablet ? handleCaptureSelect : undefined}
    />
    {#if showLabCta}
      <div class="lab-cta-banner">
        <span class="lab-cta-check">✓</span>
        <span class="lab-cta-text">Setup saved</span>
        <div class="lab-cta-actions">
          <a class="lab-cta-link lab-cta-link--dash" href="/dashboard">Dashboard →</a>
          <a class="lab-cta-link" href={labCtaSlug ? `/lab?slug=${labCtaSlug}` : '/lab'}>Lab →</a>
        </div>
        <button class="lab-cta-close" onclick={onDismissLabCta} aria-label="Dismiss">×</button>
      </div>
    {/if}
  </div>

  {#snippet reviewContent()}
    {#if isTablet && selectedCapture}
      <CaptureReviewDrawer
        annotation={selectedCapture}
        variant="inline"
        onClose={clearCapture}
        onVerdict={() => clearCapture()}
      />
    {:else}
      {@render review?.()}
    {/if}
  {/snippet}

  <PeekDrawer
    {analyzeCount}
    {scanCount}
    {judgeCount}
  />
</main>

<style>
  .center-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .chart-and-strip {
    display: flex;
    flex-direction: column;
    width: 100%;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .lab-cta-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: rgba(99, 179, 237, 0.08);
    border-top: 1px solid rgba(99, 179, 237, 0.20);
    flex-shrink: 0;
    font-family: var(--sc-font-mono);
    font-size: 12px;
  }
  .lab-cta-check { color: var(--sc-good, #adca7c); font-size: 14px; }
  .lab-cta-text  { color: rgba(247, 242, 234, 0.78); font-weight: 600; }
  .lab-cta-actions { display: flex; align-items: center; gap: 6px; margin-left: 2px; }
  .lab-cta-link {
    color: rgba(99, 179, 237, 0.92);
    text-decoration: none;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border: 1px solid rgba(99, 179, 237, 0.28);
    border-radius: 3px;
    background: rgba(99, 179, 237, 0.08);
    transition: all 0.1s;
  }
  .lab-cta-link:hover {
    background: rgba(99, 179, 237, 0.16);
    border-color: rgba(99, 179, 237, 0.45);
    color: rgba(99, 179, 237, 1);
  }
  .lab-cta-link--dash {
    color: rgba(173, 202, 124, 0.88);
    border-color: rgba(173, 202, 124, 0.24);
    background: rgba(173, 202, 124, 0.07);
  }
  .lab-cta-link--dash:hover {
    background: rgba(173, 202, 124, 0.14);
    border-color: rgba(173, 202, 124, 0.40);
    color: rgba(173, 202, 124, 1);
  }
  .lab-cta-close {
    margin-left: auto;
    background: transparent;
    border: none;
    color: rgba(247, 242, 234, 0.36);
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
    padding: 0 2px;
    transition: color 0.1s;
  }
  .lab-cta-close:hover { color: rgba(247, 242, 234, 0.72); }
</style>
