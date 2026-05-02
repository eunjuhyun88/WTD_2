<script lang="ts">
	/**
	 * /research/battle — 8-way LLM track comparison across validation layers.
	 * W-0379 Phase 6. Mock data for cycle results breakdown by LLM provider.
	 */
	import { onMount } from 'svelte';

	interface TrackMetrics {
		name: string;
		commits: number;
		commitPass: number;
		dsrDelta: number;
		costUsd: number;
		latencySec: number;
		failCount: number;
		diversity: number;
	}

	interface LayerPass {
		layer: number;
		name: string;
		passRate: number;
	}

	interface SortState {
		column: string | null;
		ascending: boolean;
	}

	const TRACKS = ['deepseek', 'groq', 'cerebras', 'nvidia_nim', 'ollama', 'huggingface', 'claude', 'gemma'];
	const LAYERS = [
		{ id: 2, name: 'L2: Signal' },
		{ id: 3, name: 'L3: Risk' },
		{ id: 4, name: 'L4: Corr' },
		{ id: 5, name: 'L5: Kelly' },
		{ id: 6, name: 'L6: BT' }
	];

	let trackMetrics = $state<TrackMetrics[]>([]);
	let layerData = $state<Record<string, LayerPass[]>>({});
	let sortState = $state<SortState>({ column: null, ascending: true });

	onMount(() => {
		// Generate mock data for 8 tracks
		trackMetrics = TRACKS.map((track) => ({
			name: track,
			commits: Math.floor(Math.random() * 50) + 10,
			commitPass: Math.floor(Math.random() * 48) + 8,
			dsrDelta: (Math.random() - 0.5) * 4,
			costUsd: Math.random() * 200 + 50,
			latencySec: Math.random() * 60 + 20,
			failCount: Math.floor(Math.random() * 8),
			diversity: Math.random() * 0.8 + 0.2
		}));

		// Generate mock layer pass rates per track
		layerData = Object.fromEntries(
			TRACKS.map((track) => [
				track,
				LAYERS.map((layer) => ({
					layer: layer.id,
					name: layer.name,
					passRate: Math.random() * 0.3 + 0.65
				}))
			])
		);
	});

	function handleSort(column: string): void {
		if (sortState.column === column) {
			sortState.ascending = !sortState.ascending;
		} else {
			sortState.column = column;
			sortState.ascending = false;
		}

		const sorted = [...trackMetrics];
		sorted.sort((a, b) => {
			let aVal = (a as any)[column];
			let bVal = (b as any)[column];
			return sortState.ascending ? aVal - bVal : bVal - aVal;
		});
		trackMetrics = sorted;
	}

	function fmtPct(n: number): string {
		return `${(n * 100).toFixed(1)}%`;
	}

	function heatColor(passRate: number): string {
		if (passRate > 0.8) return 'hc-green';
		if (passRate > 0.65) return 'hc-yellow';
		return 'hc-red';
	}
</script>

<svelte:head>
	<title>Battle · 8-Way LLM Comparison — WTD</title>
</svelte:head>

<section class="battle-root" data-testid="battle-root">
	<header class="battle-header">
		<h1>Research &gt; Battle (8-Way LLM Comparison)</h1>
	</header>

	<!-- Commit Timeline Placeholder -->
	<section class="viz-section" data-testid="commit-timeline">
		<h2>Commits Over Time</h2>
		<svg viewBox="0 0 1000 200" class="timeline-svg" aria-label="commit timeline">
			<defs>
				<pattern id="timeline-grid" width="100" height="20" patternUnits="userSpaceOnUse">
					<path d="M 100 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" stroke-width="0.5" />
				</pattern>
			</defs>
			<rect width="1000" height="200" fill="url(#timeline-grid)" />
			{#each TRACKS as track, i}
				{@const y = 20 + i * 22}
				<text x="10" {y} font-size="11" fill="#374151">{track}</text>
				{#each Array(trackMetrics[i]?.commits || 0)
					.fill(0)
					.map((_, j) => j) as commit}
					{@const x = 120 + commit * 8}
					<circle {x} {y} r="3" fill="#3b82f6" opacity="0.8" />
				{/each}
			{/each}
		</svg>
	</section>

	<!-- Commit Count Bar Chart -->
	<section class="viz-section" data-testid="commit-bars">
		<h2>Commit Count by Track</h2>
		<div class="bar-chart">
			{#each trackMetrics as track}
				<div class="bar-item">
					<div class="label">{track.name}</div>
					<div class="bar-container">
						<div
							class="bar"
							style="width: {(track.commits / 60) * 100}%"
							title="{track.commits} total, {track.commitPass} passed"
						>
							<span class="pass-segment" style="width: {(track.commitPass / track.commits) * 100}%"></span>
						</div>
					</div>
					<div class="count">{track.commits}</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Cost vs DSR Scatter -->
	<section class="viz-section" data-testid="cost-dsr-scatter">
		<h2>Cost vs DSR Δ</h2>
		<svg viewBox="0 0 600 400" class="scatter-svg" aria-label="cost vs dsr scatter">
			<!-- Grid -->
			<defs>
				<pattern id="scatter-grid" width="50" height="40" patternUnits="userSpaceOnUse">
					<path d="M 50 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" stroke-width="0.5" />
				</pattern>
			</defs>
			<rect width="600" height="400" fill="url(#scatter-grid)" />

			<!-- Axes -->
			<line x1="50" y1="350" x2="550" y2="350" stroke="#374151" stroke-width="1" />
			<line x1="50" y1="50" x2="50" y2="350" stroke="#374151" stroke-width="1" />

			<!-- Labels -->
			<text x="300" y="385" text-anchor="middle" font-size="12" fill="#374151">Cost (USD)</text>
			<text x="20" y="200" text-anchor="middle" font-size="12" fill="#374151" transform="rotate(-90 20 200)"
				>DSR Δ (%)</text
			>

			<!-- Data points -->
			{#each trackMetrics as track}
				{@const x = 50 + (track.costUsd / 250) * 500}
				{@const y = 350 - ((track.dsrDelta + 2) / 4) * 300}
				<circle {x} {y} r="5" fill="#3b82f6" opacity="0.7" />
				<text {x} y={y - 12} text-anchor="middle" font-size="9" fill="#374151">{track.name}</text>
			{/each}
		</svg>
	</section>

	<!-- Layer × Track Heatmap -->
	<section class="viz-section" data-testid="layer-heatmap">
		<h2>Validation Layer Pass Rates (Layer × Track)</h2>
		<table class="heatmap-table">
			<thead>
				<tr>
					<th>Track</th>
					{#each LAYERS as layer}
						<th>{layer.name}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each TRACKS as track}
					<tr>
						<td class="track-name">{track}</td>
						{#each layerData[track] || [] as layer}
							<td class="heatmap-cell {heatColor(layer.passRate)}">
								{fmtPct(layer.passRate)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<!-- Metrics Table -->
	<section class="viz-section" data-testid="metrics-table">
		<h2>Summary Metrics</h2>
		<table class="metrics-table">
			<thead>
				<tr>
					<th onclick={() => handleSort('name')}>Track</th>
					<th onclick={() => handleSort('commits')}>Commits</th>
					<th onclick={() => handleSort('commitPass')}>Pass Rate</th>
					<th onclick={() => handleSort('dsrDelta')}>DSR Δ</th>
					<th onclick={() => handleSort('costUsd')}>Cost</th>
					<th onclick={() => handleSort('latencySec')}>Latency</th>
					<th onclick={() => handleSort('failCount')}>Fails</th>
					<th onclick={() => handleSort('diversity')}>Diversity</th>
				</tr>
			</thead>
			<tbody>
				{#each trackMetrics as track}
					<tr>
						<td>{track.name}</td>
						<td class="number">{track.commits}</td>
						<td class="number">{fmtPct(track.commitPass / track.commits)}</td>
						<td class="number">{track.dsrDelta.toFixed(2)}%</td>
						<td class="number">${track.costUsd.toFixed(0)}</td>
						<td class="number">{track.latencySec.toFixed(1)}s</td>
						<td class="number">{track.failCount}</td>
						<td class="number">{track.diversity.toFixed(2)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
</section>

<style>
	.battle-root {
		padding: 16px;
		font-family: var(--font-body, system-ui);
		color: var(--g10);
		background: var(--g0);
		min-height: 100vh;
	}

	.battle-header {
		margin-bottom: 24px;
	}

	.battle-header h1 {
		font-size: 14px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0;
	}

	.viz-section {
		background: var(--g1);
		border: 1px solid var(--g3);
		padding: 16px;
		margin-bottom: 16px;
	}

	.viz-section h2 {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 12px;
		color: var(--g7);
	}

	.timeline-svg,
	.scatter-svg {
		width: 100%;
		height: auto;
	}

	.bar-chart {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.bar-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
	}

	.label {
		width: 80px;
		font-family: var(--font-mono, ui-monospace);
		flex-shrink: 0;
	}

	.bar-container {
		flex: 1;
		height: 16px;
		background: var(--g0);
		border: 1px solid var(--g3);
		position: relative;
	}

	.bar {
		height: 100%;
		background: var(--g3);
		display: flex;
		position: relative;
	}

	.pass-segment {
		background: var(--pos);
		height: 100%;
		display: block;
	}

	.count {
		width: 30px;
		text-align: right;
		font-family: var(--font-mono, ui-monospace);
		flex-shrink: 0;
	}

	.heatmap-table,
	.metrics-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
		font-family: var(--font-mono, ui-monospace);
	}

	th,
	td {
		padding: 6px 8px;
		text-align: left;
		border-bottom: 1px solid var(--g2);
	}

	th {
		background: var(--g2);
		color: var(--g7);
		font-weight: 500;
		text-transform: uppercase;
		font-size: var(--ui-text-xs);
		letter-spacing: 0.04em;
		cursor: pointer;
	}

	th:hover {
		background: var(--g3);
	}

	td.number {
		text-align: right;
	}

	.track-name {
		font-weight: 500;
	}

	.heatmap-cell {
		padding: 4px;
		text-align: center;
	}

	.hc-green {
		background: #dcfce7;
		color: #166534;
	}

	.hc-yellow {
		background: #fef3c7;
		color: #92400e;
	}

	.hc-red {
		background: #fee2e2;
		color: #991b1b;
	}
</style>
