<script lang="ts">
	interface DiagRow {
		strictness: string;
		estimated_signal_count: number;
		min_sample_pass: boolean;
		warnings: string[];
		filter_dropoff: Array<{ filter: string; retained_pct: number }>;
	}

	interface Props {
		base: DiagRow;
		variants?: Record<string, DiagRow>;
		selected: string;
		onSelect: (strictness: string) => void;
		loading?: boolean;
	}

	let { base, variants = {}, selected, onSelect, loading = false }: Props = $props();

	const ALL = ['strict', 'base', 'loose'] as const;

	function rowFor(s: string): DiagRow | null {
		if (s === 'base') return base;
		return variants[s] ?? null;
	}

	function signalColor(count: number, pass: boolean): string {
		if (!pass) return 'var(--color-red, #ef4444)';
		if (count >= 100) return 'var(--color-green, #22c55e)';
		if (count >= 50) return 'var(--color-yellow, #f59e0b)';
		return 'var(--color-yellow, #f59e0b)';
	}
</script>

<div class="constraint-ladder">
	<div class="ladder-header">
		<span class="ladder-title">Constraint Ladder</span>
		{#if loading}
			<span class="loading-dot">…</span>
		{/if}
	</div>

	<div class="rungs">
		{#each ALL as s}
			{@const row = rowFor(s)}
			<button
				class="rung"
				class:selected={selected === s}
				class:no-data={!row}
				onclick={() => onSelect(s)}
				disabled={!row}
			>
				<div class="rung-top">
					<span class="rung-name">{s}</span>
					{#if row}
						<span class="rung-count" style="color: {signalColor(row.estimated_signal_count, row.min_sample_pass)}">
							~{row.estimated_signal_count}
						</span>
						{#if row.min_sample_pass}
							<span class="pass-icon">✓</span>
						{:else}
							<span class="fail-icon">✗</span>
						{/if}
					{:else}
						<span class="rung-count muted">—</span>
					{/if}
				</div>

				{#if row && row.warnings.length > 0}
					<div class="rung-warnings">
						{#each row.warnings as w}
							<span class="warning-chip">{w}</span>
						{/each}
					</div>
				{/if}

				{#if row && row.filter_dropoff.length > 0}
					<div class="dropoff-bar">
						{#each row.filter_dropoff as d}
							<div
								class="dropoff-segment"
								style="width: {d.retained_pct}%; background: var(--color-blue, #3b82f6)"
								title="{d.filter}: {d.retained_pct}% retained"
							></div>
						{/each}
					</div>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.constraint-ladder {
		background: var(--color-surface-2, #1a1a2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.ladder-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.ladder-title {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted, #94a3b8);
	}

	.loading-dot {
		font-size: 12px;
		color: var(--color-text-muted, #94a3b8);
		animation: pulse 1.4s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}

	.rungs {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.rung {
		width: 100%;
		background: var(--color-surface-3, #242440);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		padding: 10px 12px;
		cursor: pointer;
		text-align: left;
		transition: border-color 0.15s, background 0.15s;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.rung:hover:not(:disabled) {
		border-color: var(--color-blue, #3b82f6);
	}

	.rung.selected {
		border-color: var(--color-blue, #3b82f6);
		background: color-mix(in srgb, var(--color-blue, #3b82f6) 8%, var(--color-surface-3, #242440));
	}

	.rung.no-data {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.rung-top {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.rung-name {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-primary, #e2e8f0);
		min-width: 44px;
		text-transform: capitalize;
	}

	.rung-count {
		font-size: 13px;
		font-weight: 700;
		flex: 1;
	}

	.rung-count.muted {
		color: var(--color-text-muted, #94a3b8);
	}

	.pass-icon {
		font-size: 12px;
		color: var(--color-green, #22c55e);
	}

	.fail-icon {
		font-size: 12px;
		color: var(--color-red, #ef4444);
	}

	.rung-warnings {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.warning-chip {
		font-size: 10px;
		background: color-mix(in srgb, var(--color-yellow, #f59e0b) 12%, transparent);
		color: var(--color-yellow, #f59e0b);
		border-radius: 3px;
		padding: 1px 6px;
	}

	.dropoff-bar {
		height: 3px;
		background: var(--color-border, #333);
		border-radius: 2px;
		overflow: hidden;
		display: flex;
	}

	.dropoff-segment {
		height: 100%;
		border-radius: 2px;
	}
</style>
