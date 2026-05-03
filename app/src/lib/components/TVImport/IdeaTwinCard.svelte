<script lang="ts">
	interface Props {
		importId: string;
		authorUsername: string;
		authorDisplayName?: string | null;
		engineAlphaScore?: number | null;
		actualOutcome?: string | null;
		actualOutcomePct?: number | null;
		horizonBars?: number;
		pending?: boolean;
	}

	let {
		importId,
		authorUsername,
		authorDisplayName,
		engineAlphaScore,
		actualOutcome,
		actualOutcomePct,
		horizonBars = 30,
		pending = true,
	}: Props = $props();

	const outcomeColor: Record<string, string> = {
		win: 'var(--color-green, #22c55e)',
		loss: 'var(--color-red, #ef4444)',
		neutral: 'var(--color-text-muted, #94a3b8)',
	};
</script>

<div class="twin-card">
	<div class="twin-header">
		<div class="author-info">
			<span class="author-name">{authorDisplayName ?? authorUsername}</span>
			{#if authorDisplayName}
				<span class="author-handle">@{authorUsername}</span>
			{/if}
		</div>
		<div class="twin-badge">Idea Twin</div>
	</div>

	<div class="twin-scores">
		<div class="score-item">
			<span class="score-label">Engine α at import</span>
			<span class="score-value">
				{engineAlphaScore != null ? engineAlphaScore.toFixed(3) : '—'}
			</span>
		</div>

		<div class="score-item">
			<span class="score-label">Outcome ({horizonBars}b)</span>
			{#if pending}
				<span class="score-value pending">pending</span>
			{:else if actualOutcome}
				<span class="score-value" style="color: {outcomeColor[actualOutcome] ?? ''}">
					{actualOutcome.toUpperCase()}
					{#if actualOutcomePct != null}
						({actualOutcomePct >= 0 ? '+' : ''}{(actualOutcomePct * 100).toFixed(1)}%)
					{/if}
				</span>
			{:else}
				<span class="score-value muted">—</span>
			{/if}
		</div>
	</div>

	<div class="twin-id">ID: {importId.slice(0, 8)}…</div>
</div>

<style>
	.twin-card {
		background: var(--color-surface-2, #1a1a2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.twin-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.author-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.author-name {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-text-primary, #e2e8f0);
	}

	.author-handle {
		font-size: 11px;
		color: var(--color-text-muted, #94a3b8);
	}

	.twin-badge {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--color-blue, #3b82f6);
		background: color-mix(in srgb, var(--color-blue, #3b82f6) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-blue, #3b82f6) 30%, transparent);
		border-radius: 4px;
		padding: 2px 8px;
	}

	.twin-scores {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.score-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.score-label {
		font-size: 11px;
		color: var(--color-text-muted, #94a3b8);
	}

	.score-value {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-primary, #e2e8f0);
	}

	.score-value.pending {
		color: var(--color-text-muted, #94a3b8);
		font-style: italic;
	}

	.score-value.muted {
		color: var(--color-text-muted, #94a3b8);
	}

	.twin-id {
		font-size: 10px;
		color: var(--color-text-muted, #94a3b8);
		font-family: monospace;
	}
</style>
