<script lang="ts">
	/**
	 * /research/diff/[cycle_id] — cycle diff & promotion view.
	 * Shows YAML rules delta, layer validation results, and promote action.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	interface LayerResult {
		layer: number;
		name: string;
		passed: boolean;
		candidatesIn: number;
		candidatesOut: number;
		failureReason?: string;
	}

	interface CycleDetail {
		cycleId: number;
		status: string;
		strategy: string;
		dsrDelta: number;
		costUsd: number;
		latencySec: number;
		commitSha: string;
		createdAt: string;
	}

	let { data } = $props<{ data: PageData }>();

	let cycle = $state<CycleDetail | null>(null);
	let layerResults = $state<LayerResult[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let yamlDiff = $state('');
	let promoting = $state(false);

	const LAYERS = [
		{ id: 1, name: 'Market Filter', desc: 'Filter by market regime' },
		{ id: 2, name: 'Signal Validation', desc: 'Validate signal strength' },
		{ id: 3, name: 'Risk Check', desc: 'Check position risk' },
		{ id: 4, name: 'Correlation Filter', desc: 'Filter correlated pairs' },
		{ id: 5, name: 'Kelly Sizing', desc: 'Compute Kelly fraction' },
		{ id: 6, name: 'Backtest Verify', desc: 'Verify on historical data' }
	];

	async function loadDiffData(): Promise<void> {
		try {
			const cycleId = $page.params.cycle_id;
			if (!cycleId) {
				error = 'Cycle ID not found';
				return;
			}
			const res = await fetch(`/api/research/cycle/${cycleId}`);
			const body = await res.json();
			if (!res.ok || !body.ok) {
				error = body.error ?? 'Failed to load cycle diff';
				return;
			}

			cycle = body.cycle || null;

			// Generate mock layer results
			layerResults = LAYERS.map((layer) => ({
				layer: layer.id,
				name: layer.name,
				passed: Math.random() > 0.1,
				candidatesIn: Math.floor(Math.random() * 500) + 100,
				candidatesOut: Math.floor(Math.random() * 300) + 50,
				failureReason: Math.random() > 0.7 ? 'High correlation detected' : undefined
			}));

			// Generate mock YAML diff
			yamlDiff = `--- Previous Rules (Cycle ${parseInt(cycleId) - 1})
+++ Current Rules (Cycle ${cycleId})
@@ Market Config @@
 market_regime: "multi"
-signal_threshold: 0.65
+signal_threshold: 0.72

@@ Risk Parameters @@
 max_position_size: 5000
-max_drawdown: 0.20
+max_drawdown: 0.15
 kelly_fraction: 0.25
+position_correlation_limit: 0.6

@@ Validation Layers @@
 layer_2_signal_validation: true
-layer_3_risk_check: false
+layer_3_risk_check: true
 layer_6_backtest_verify: true`;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	async function promoteToProduction(): Promise<void> {
		promoting = true;
		try {
			// TODO: implement promotion endpoint
			await new Promise((resolve) => setTimeout(resolve, 500));
			alert(`Cycle ${data.cycleId} promoted (mock)`);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			promoting = false;
		}
	}

	onMount(loadDiffData);

	function fmtTime(iso: string): string {
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d.toISOString().slice(5, 16).replace('T', ' ') : '—';
	}

	function fmtPct(n: number): string {
		return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
	}

	function fmtPassRate(passed: boolean): string {
		return passed ? '✓ PASS' : '✗ FAIL';
	}
</script>

<svelte:head>
	<title>Research · Cycle Diff — WTD</title>
</svelte:head>

<section class="diff-root" data-testid="diff-root">
	<header class="diff-header">
		<h1>Research &gt; Cycle Diff & Promotion</h1>
		{#if cycle}
			<div class="header-actions">
				<span class="cycle-id">Cycle #{cycle.cycleId}</span>
				<button
					onclick={promoteToProduction}
					disabled={promoting || !cycle || cycle.status !== 'committed'}
					class="promote-btn"
					data-testid="promote-btn"
				>
					{promoting ? '⏳ Promoting…' : '🚀 Promote'}
				</button>
			</div>
		{/if}
	</header>

	{#if loading}
		<p class="muted" data-testid="diff-loading">Loading…</p>
	{:else if error}
		<p class="error" data-testid="diff-error">Error: {error}</p>
	{:else if cycle}
		<!-- Cycle Metrics -->
		<section class="metrics-section" data-testid="cycle-metrics">
			<h2>Cycle Metrics</h2>
			<div class="metrics-grid">
				<div class="metric">
					<span class="label">Status</span>
					<span class="value">{cycle.status}</span>
				</div>
				<div class="metric">
					<span class="label">Strategy</span>
					<span class="value">{cycle.strategy}</span>
				</div>
				<div class="metric">
					<span class="label">DSR Δ</span>
					<span class="value">{fmtPct(cycle.dsrDelta)}</span>
				</div>
				<div class="metric">
					<span class="label">Cost</span>
					<span class="value">${cycle.costUsd.toFixed(2)}</span>
				</div>
				<div class="metric">
					<span class="label">Latency</span>
					<span class="value">{cycle.latencySec.toFixed(1)}s</span>
				</div>
				<div class="metric">
					<span class="label">Timestamp</span>
					<span class="value">{fmtTime(cycle.createdAt)}</span>
				</div>
			</div>
		</section>

		<!-- Layer Validation Results -->
		<section class="layers-section" data-testid="layer-results">
			<h2>6-Layer Validation Pipeline</h2>
			{#each layerResults as result}
				<div class="layer-row">
					<div class="layer-header">
						<div class="layer-title">
							<span class="layer-num">L{result.layer}</span>
							<span class="layer-name">{result.name}</span>
							<span class="layer-desc">{LAYERS[result.layer - 1]?.desc}</span>
						</div>
						<span class={`layer-status ${result.passed ? 'pass' : 'fail'}`}>
							{fmtPassRate(result.passed)}
						</span>
					</div>
					<div class="layer-metrics">
						<div class="metric">
							<span class="label">In</span>
							<span class="value">{result.candidatesIn}</span>
						</div>
						<div class="metric">
							<span class="label">Out</span>
							<span class="value">{result.candidatesOut}</span>
						</div>
						<div class="metric">
							<span class="label">Rate</span>
							<span class="value">{((result.candidatesOut / result.candidatesIn) * 100).toFixed(1)}%</span>
						</div>
					</div>
					{#if result.failureReason}
						<div class="failure-reason">
							{result.failureReason}
						</div>
					{/if}
				</div>
			{/each}
		</section>

		<!-- YAML Diff -->
		<section class="diff-section" data-testid="yaml-diff">
			<h2>Rules Delta (YAML Diff)</h2>
			<pre class="yaml-block"><code>{yamlDiff}</code></pre>
		</section>
	{:else}
		<p class="banner" data-testid="diff-not-found">Cycle not found.</p>
	{/if}
</section>

<style>
	.diff-root {
		padding: 16px;
		font-family: var(--font-body, system-ui);
		color: var(--g10);
		background: var(--g0);
		min-height: 100vh;
	}

	.diff-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 24px;
	}

	.diff-header h1 {
		font-size: 14px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.cycle-id {
		font-size: 12px;
		color: var(--g6);
		font-family: var(--font-mono, ui-monospace);
	}

	.promote-btn {
		font-family: var(--font-mono, ui-monospace);
		font-size: 11px;
		background: var(--pos);
		color: var(--g0);
		border: none;
		padding: 6px 12px;
		cursor: pointer;
		border-radius: 3px;
		white-space: nowrap;
	}

	.promote-btn:hover:not(:disabled) {
		background: #059669;
	}

	.promote-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.metrics-section,
	.layers-section,
	.diff-section {
		background: var(--g1);
		border: 1px solid var(--g3);
		padding: 16px;
		margin-bottom: 24px;
	}

	.metrics-section h2,
	.layers-section h2,
	.diff-section h2 {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 12px;
		color: var(--g7);
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 12px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.metric .label {
		font-size: var(--ui-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--g6);
	}

	.metric .value {
		font-size: 13px;
		font-weight: 500;
		font-family: var(--font-mono, ui-monospace);
	}

	.layer-row {
		padding: 12px 0;
		border-bottom: 1px solid var(--g2);
	}

	.layer-row:last-child {
		border-bottom: none;
	}

	.layer-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 8px;
	}

	.layer-title {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.layer-num {
		font-size: 11px;
		font-weight: 600;
		color: var(--g7);
		min-width: 24px;
	}

	.layer-name {
		font-size: 12px;
		font-weight: 500;
		color: var(--g9);
	}

	.layer-desc {
		font-size: var(--ui-text-xs);
		color: var(--g6);
	}

	.layer-status {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.layer-status.pass {
		color: var(--pos);
	}

	.layer-status.fail {
		color: var(--neg);
	}

	.layer-metrics {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 8px;
	}

	.failure-reason {
		font-size: var(--ui-text-xs);
		color: var(--neg);
		background: var(--neg-d);
		padding: 6px 8px;
		border-radius: 2px;
		margin-top: 8px;
	}

	.yaml-block {
		background: var(--g0);
		padding: 12px;
		border-radius: 3px;
		overflow-x: auto;
		font-family: var(--font-mono, ui-monospace);
		font-size: var(--ui-text-xs);
		line-height: 1.5;
		color: var(--g7);
		margin: 0;
	}

	.yaml-block code {
		white-space: pre;
	}

	.muted {
		color: var(--g6);
		padding: 12px;
	}

	.error {
		color: var(--neg);
		background: var(--neg-d);
		padding: 12px;
		border-radius: 3px;
	}

	.banner {
		background: var(--amb);
		color: var(--g0);
		padding: 12px;
		border-radius: 3px;
		font-size: 11px;
	}
</style>
