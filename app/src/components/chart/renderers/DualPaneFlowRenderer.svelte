<script lang="ts">
	import type { ChartPresentation, DualPaneFlowChartViewSpec } from '$lib/chart-engine';
	import {
		areaPath,
		formatFlowSeriesValue,
		histogramBars,
		linePath,
		toClosePoints,
	} from '$lib/chart-engine/utils/geometry';

	let {
		spec,
		presentation = 'inline',
	}: {
		spec: DualPaneFlowChartViewSpec;
		presentation?: ChartPresentation;
	} = $props();

	const topPoints = $derived(toClosePoints(spec.topPane.price));

	function compareLabel(deltaPct: number | null): string {
		if (deltaPct == null) return '--';
		return `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(2)}%`;
	}
</script>

<div class:focus={presentation === 'focus'} class="dual-pane-flow">
	<div class="dpf-top">
		<div class="dpf-head">
			<span class="dpf-title">Price</span>
			<div class="dpf-chips">
				{#each spec.compareWindows as window}
					<span class:up={(window.deltaPct ?? 0) > 0} class:down={(window.deltaPct ?? 0) < 0} class="dpf-chip">
						{window.key} {compareLabel(window.deltaPct)}
					</span>
				{/each}
			</div>
		</div>
		<svg class="dpf-top-chart" viewBox="0 0 640 110" preserveAspectRatio="none">
			<path d={areaPath(topPoints, 640, 90)} fill="rgba(219, 154, 159, 0.08)"></path>
			<path d={linePath(topPoints, 640, 90)} fill="none" stroke="#f7f2ea" stroke-width="2"></path>
		</svg>
	</div>

	<div class="dpf-bottom">
		{#each spec.bottomPane.series as series}
			<div class="flow-track">
				<div class="flow-meta">
					<span class="flow-label">{series.label}</span>
					<span class="flow-value">{formatFlowSeriesValue(series)}</span>
				</div>
				<svg class="flow-svg" viewBox="0 0 640 64" preserveAspectRatio="none">
					{#if series.mode === 'histogram'}
						<line x1="0" y1="32" x2="640" y2="32" stroke="rgba(247, 242, 234, 0.08)" stroke-width="1"></line>
						{#each histogramBars(series.points, 640, 64) as bar}
							<rect
								x={bar.x}
								y={bar.y}
								width={bar.w}
								height={bar.h}
								fill={bar.positive ? 'rgba(173, 202, 124, 0.55)' : 'rgba(207, 127, 143, 0.55)'}
							></rect>
						{/each}
					{:else if series.mode === 'area'}
						<path d={areaPath(series.points, 640, 56)} fill="rgba(0, 229, 255, 0.12)"></path>
						<path d={linePath(series.points, 640, 56)} fill="none" stroke="#00e5ff" stroke-width="2"></path>
					{:else}
						<path
							d={linePath(series.points, 640, 56)}
							fill="none"
							stroke={series.id.includes('oi') ? '#f2d193' : '#cf7f8f'}
							stroke-width="2"
						></path>
					{/if}
				</svg>
			</div>
		{/each}
	</div>
</div>

<style>
	.dual-pane-flow {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.dpf-top,
	.dpf-bottom {
		border: 1px solid rgba(219, 154, 159, 0.16);
		border-radius: 8px;
		background: linear-gradient(180deg, rgba(11, 18, 32, 0.92), rgba(5, 9, 20, 0.96));
		padding: 10px 12px;
	}
	.dpf-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
	}
	.dpf-title,
	.flow-label {
		font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
		font-size: var(--ui-text-xs);
		letter-spacing: 1px;
		color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
		text-transform: uppercase;
		font-weight: 700;
	}
	.dpf-top-chart {
		width: 100%;
		height: 110px;
	}
	.dpf-chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
	}
	.dpf-chip {
		border-radius: 999px;
		border: 1px solid rgba(219, 154, 159, 0.16);
		padding: 3px 6px;
		font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
		font-size: var(--ui-text-xs);
		color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
	}
	.dpf-chip.up {
		color: var(--sc-good, #adca7c);
		border-color: rgba(173, 202, 124, 0.3);
	}
	.dpf-chip.down {
		color: var(--sc-bad, #cf7f8f);
		border-color: rgba(207, 127, 143, 0.3);
	}
	.dpf-bottom {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.flow-track {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.flow-meta {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.flow-value {
		font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		color: var(--sc-text-1, rgba(247, 242, 234, 0.84));
		font-weight: 700;
	}
	.flow-svg {
		width: 100%;
		height: 64px;
		overflow: visible;
	}
</style>
