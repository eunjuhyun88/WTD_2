<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createPriceChartRuntime } from '$lib/chart-engine/core/createPriceChartRuntime';
	import type { ChartPresentation, PriceChartViewSpec } from '$lib/chart-engine';

	let {
		spec,
		presentation = 'inline',
	}: {
		spec: PriceChartViewSpec;
		presentation?: ChartPresentation;
	} = $props();

	let chartContainer: HTMLDivElement | undefined = $state();
	let runtime: Awaited<ReturnType<typeof createPriceChartRuntime>> | null = null;

	onMount(async () => {
		if (!chartContainer) return;
		runtime = await createPriceChartRuntime(chartContainer);
		runtime.update(spec, presentation);
	});

	onDestroy(() => {
		runtime?.destroy();
		runtime = null;
	});

	$effect(() => {
		spec;
		presentation;
		runtime?.update(spec, presentation);
	});

	function compareLabel(deltaPct: number | null): string {
		if (deltaPct == null) return '--';
		const sign = deltaPct > 0 ? '+' : '';
		return `${sign}${deltaPct.toFixed(2)}%`;
	}
</script>

<div class:focus={presentation === 'focus'} class="ce-price-chart">
	<div class="ce-price-canvas" bind:this={chartContainer}></div>
	{#if spec.compareWindows.length > 0}
		<div class="ce-compare">
			{#each spec.compareWindows as window}
				<span class:up={(window.deltaPct ?? 0) > 0} class:down={(window.deltaPct ?? 0) < 0} class="ce-chip">
					{window.key} {compareLabel(window.deltaPct)}
				</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.ce-price-chart {
		display: flex;
		flex-direction: column;
		gap: 8px;
		height: 100%;
	}
	.ce-price-canvas {
		width: 100%;
		height: 100%;
		flex: 1 1 auto;
		min-height: 210px;
	}
	.ce-price-chart.focus .ce-price-canvas {
		min-height: 320px;
	}
	.ce-compare {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.ce-chip {
		border-radius: 999px;
		border: 1px solid rgba(219, 154, 159, 0.16);
		padding: 4px 7px;
		font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
		background: rgba(247, 242, 234, 0.03);
	}
	.ce-chip.up {
		color: var(--sc-good, #adca7c);
		border-color: rgba(173, 202, 124, 0.3);
	}
	.ce-chip.down {
		color: var(--sc-bad, #cf7f8f);
		border-color: rgba(207, 127, 143, 0.3);
	}
</style>
