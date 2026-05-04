<script lang="ts">
	/**
	 * /research/ledger — autoresearch cycle history + DSR trajectory visualization.
	 * W-0379 Phase 6. Displays cumulative cycle results from ledger.
	 */
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	interface LedgerEntry {
		cycleId: number;
		status: string;
		strategy: string;
		candidatesProposed: number;
		candidatesAfterL2: number;
		dsrDelta: number;
		costUsd: number;
		latencySec: number;
		commitSha: string;
		createdAt: string;
	}

	let { data } = $props<{ data: PageData }>();

	let entries = $state<LedgerEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let runningCycle = $state(false);

	async function loadEntries(): Promise<void> {
		try {
			const res = await fetch('/api/research/ledger?limit=100&offset=0');
			const body = await res.json();
			if (!res.ok || !body.ok) {
				error = body.error ?? 'Failed to load ledger';
				return;
			}
			entries = body.entries || [];
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	async function runCycle(): Promise<void> {
		runningCycle = true;
		try {
			const res = await fetch('/api/research/run-cycle', { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				error = body.error ?? 'Failed to run cycle';
				return;
			}
			// Reload entries after successful cycle
			await loadEntries();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			runningCycle = false;
		}
	}

	onMount(loadEntries);

	function computeCumulativeDSR(): { x: number; y: number }[] {
		let cumulative = 0;
		return entries.map((e, idx) => {
			cumulative += e.dsrDelta;
			return { x: e.cycleId, y: cumulative };
		});
	}

	function fmtTime(iso: string): string {
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d.toISOString().slice(5, 16).replace('T', ' ') : '—';
	}

	function fmtPct(n: number | null): string {
		if (n == null || !Number.isFinite(n)) return '—';
		return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
	}

	function statusClass(status: string): string {
		if (status === 'committed') return 'status-committed';
		if (status === 'rejected') return 'status-rejected';
		return 'status-pending';
	}
</script>

<svelte:head>
	<title>Research · Ledger — WTD</title>
</svelte:head>

<section class="ledger-root" data-testid="ledger-root">
	<header class="ledger-header">
		<h1>Research &gt; Autoresearch Ledger</h1>
		<button
			onclick={runCycle}
			disabled={runningCycle}
			class="run-cycle-btn"
			data-testid="run-cycle-btn"
		>
			{runningCycle ? 'Running…' : '▶ Run Cycle'}
		</button>
	</header>

	{#if loading}
		<p class="muted" data-testid="ledger-loading">Loading…</p>
	{:else if error}
		<p class="error" data-testid="ledger-error">Error: {error}</p>
	{:else if entries.length > 0}
		<!-- Calculate trajectory once at component level -->
		{@const trajectoryData = (() => {
			const points = computeCumulativeDSR();
			const minX = Math.max(...points.map(p => p.x), 1);
			const maxY = Math.max(...points.map(p => p.y), 5);
			const minY = Math.min(...points.map(p => p.y), -5);
			const range = maxY - minY || 10;
			const xScale = (minX > 0 ? 700 / minX : 700);
			const yScale = range > 0 ? 250 / range : 250 / 10;
			return { points, minX, maxY, minY, range, xScale, yScale };
		})()}

		<!-- DSR Trajectory Chart -->
		<section class="chart-section" data-testid="dsr-trajectory">
			<h2>Cumulative DSR Δ Trajectory</h2>
			<svg viewBox="0 100 800 300" class="dsr-chart" aria-label="DSR trajectory">
				<!-- Grid -->
				<defs>
					<pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
						<path d="M 40 0 L 0 0 0 30" fill="none" stroke="#e5e7eb" stroke-width="0.5" />
					</pattern>
				</defs>
				<rect width="800" height="300" fill="url(#grid)" />

				<!-- Axes -->
				<line x1="50" y1="100" x2="50" y2="350" stroke="#374151" stroke-width="1" />
				<line x1="50" y1="350" x2="750" y2="350" stroke="#374151" stroke-width="1" />

				<!-- Y-axis labels -->
				{#each [-5, -2.5, 0, 2.5, 5] as label}
					{@const y = 350 - (label + 5) * 25}
					<text x="40" {y} text-anchor="end" font-size="10" fill="#6b7280">{label.toFixed(1)}%</text>
				{/each}

				<!-- Plot line -->
				<polyline
					points={trajectoryData.points.map(p => `${50 + p.x * trajectoryData.xScale},${350 - (p.y - trajectoryData.minY) * trajectoryData.yScale}`).join(' ')}
					fill="none"
					stroke="#3b82f6"
					stroke-width="2"
					stroke-linecap="round"
				/>

				<!-- Data points -->
				{#each trajectoryData.points as p}
					<circle cx={50 + p.x * trajectoryData.xScale} cy={350 - (p.y - trajectoryData.minY) * trajectoryData.yScale} r="3" fill="#3b82f6" />
				{/each}

				<!-- X-axis labels -->
				{#each trajectoryData.points.filter((_, i) => i % Math.max(1, Math.floor(trajectoryData.points.length / 5)) === 0) as p}
					<text x={50 + p.x * trajectoryData.xScale} y="370" text-anchor="middle" font-size="10" fill="#6b7280"
						>Cycle {p.x}</text
					>
				{/each}
			</svg>
		</section>}

		<!-- Recent Cycles Table -->
		<section class="table-section" data-testid="recent-cycles">
			<h2>Recent Cycles ({entries.length})</h2>
			<table>
				<thead>
					<tr>
						<th>Cycle #</th>
						<th>Status</th>
						<th>Strategy</th>
						<th>DSR Δ</th>
						<th>Cost</th>
						<th>Latency</th>
						<th>Commit</th>
						<th>Time</th>
					</tr>
				</thead>
				<tbody>
					{#each entries as entry}
						<tr class={statusClass(entry.status)}>
							<td class="mono">{entry.cycleId}</td>
							<td><span class="status-badge {entry.status}">{entry.status}</span></td>
							<td>{entry.strategy}</td>
							<td class="number">{fmtPct(entry.dsrDelta)}</td>
							<td class="number">${entry.costUsd.toFixed(2)}</td>
							<td class="number">{entry.latencySec.toFixed(1)}s</td>
							<td class="mono"><code>{entry.commitSha.substring(0, 8)}</code></td>
							<td class="mono">{fmtTime(entry.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{:else}
		<p class="banner" data-testid="ledger-empty">No cycles yet. Click "Run Cycle" to start.</p>
	{/if}
</section>

<style>
	.ledger-root {
		padding: 16px;
		font-family: var(--font-body, system-ui);
		color: var(--g10);
		background: var(--g0);
		min-height: 100vh;
	}

	.ledger-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 24px;
	}

	.ledger-header h1 {
		font-size: 14px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0;
	}

	.run-cycle-btn {
		font-family: var(--font-mono, ui-monospace);
		font-size: 11px;
		background: var(--pos);
		color: var(--g0);
		border: none;
		padding: 8px 16px;
		cursor: pointer;
		border-radius: 3px;
	}

	.run-cycle-btn:hover:not(:disabled) {
		background: #059669;
	}

	.run-cycle-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.chart-section {
		background: var(--g1);
		border: 1px solid var(--g3);
		padding: 16px;
		margin-bottom: 24px;
	}

	.chart-section h2 {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 12px;
		color: var(--g7);
	}

	.dsr-chart {
		width: 100%;
		max-width: 100%;
		height: auto;
	}

	.table-section {
		background: var(--g1);
		border: 1px solid var(--g3);
		padding: 16px;
	}

	.table-section h2 {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 12px;
		color: var(--g7);
	}

	table {
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
	}

	td.number {
		text-align: right;
	}

	td.mono,
	.mono {
		font-family: var(--font-mono, ui-monospace);
	}

	code {
		background: var(--g0);
		padding: 2px 4px;
		border-radius: 2px;
	}

	.status-badge {
		padding: 2px 6px;
		font-size: var(--ui-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border-radius: 2px;
	}

	.status-badge.committed {
		background: var(--pos-d);
		color: var(--pos);
	}

	.status-badge.rejected {
		background: var(--neg-d);
		color: var(--neg);
	}

	.status-badge.pending {
		background: var(--g3);
		color: var(--g7);
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
