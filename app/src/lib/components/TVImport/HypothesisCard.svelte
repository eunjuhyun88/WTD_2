<script lang="ts">
	interface VisibleAtom {
		kind: string;
		confidence: number;
		source: string;
	}

	interface Props {
		patternFamily: string;
		direction: string | null;
		parserTier: string;
		atoms: VisibleAtom[];
		confidence: number;
		triggerBlock: string;
		confirmationBlocks: string[];
		unsupportedAtoms: string[];
		compilerConfidence: number;
	}

	let {
		patternFamily,
		direction,
		parserTier,
		atoms,
		confidence,
		triggerBlock,
		confirmationBlocks,
		unsupportedAtoms,
		compilerConfidence,
	}: Props = $props();

	const tierColor: Record<string, string> = {
		pine: 'var(--color-green)',
		text: 'var(--color-yellow)',
		vision: 'var(--color-blue)',
	};

	const dirColor = direction === 'long' ? 'var(--color-green)' : direction === 'short' ? 'var(--color-red)' : 'var(--color-text-muted)';
</script>

<div class="hypothesis-card">
	<div class="card-header">
		<span class="pattern-family">{patternFamily}</span>
		{#if direction}
			<span class="direction-badge" style="color: {dirColor}">{direction.toUpperCase()}</span>
		{/if}
		<span class="tier-badge" style="border-color: {tierColor[parserTier] ?? 'var(--color-border)'}">
			{parserTier}
		</span>
	</div>

	<div class="confidence-row">
		<div class="conf-bar">
			<div class="conf-fill" style="width: {Math.round(confidence * 100)}%; background: {tierColor[parserTier]}"></div>
		</div>
		<span class="conf-label">{Math.round(confidence * 100)}% parse</span>
		<span class="conf-sep">·</span>
		<span class="conf-label">{Math.round(compilerConfidence * 100)}% compile</span>
	</div>

	{#if atoms.length > 0}
		<div class="atoms-section">
			<div class="section-label">Detected atoms ({atoms.length})</div>
			<div class="atom-list">
				{#each atoms as atom}
					<div class="atom-chip" class:unsupported={unsupportedAtoms.includes(atom.kind)}>
						<span class="atom-kind">{atom.kind}</span>
						<span class="atom-conf">{Math.round(atom.confidence * 100)}%</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if triggerBlock}
		<div class="blocks-section">
			<div class="section-label">Trigger</div>
			<code class="block-code">{triggerBlock}</code>
		</div>
	{/if}

	{#if confirmationBlocks.length > 0}
		<div class="blocks-section">
			<div class="section-label">Confirmations ({confirmationBlocks.length})</div>
			{#each confirmationBlocks as block}
				<code class="block-code">{block}</code>
			{/each}
		</div>
	{/if}

	{#if unsupportedAtoms.length > 0}
		<div class="unsupported-section">
			<div class="section-label warn">Unsupported atoms (preserved)</div>
			<div class="atom-list">
				{#each unsupportedAtoms as kind}
					<span class="atom-chip unsupported">{kind}</span>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.hypothesis-card {
		background: var(--color-surface-2, #1a1a2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.pattern-family {
		font-size: 14px;
		font-weight: 600;
		color: var(--color-text-primary, #e2e8f0);
		flex: 1;
	}

	.direction-badge {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.tier-badge {
		font-size: 10px;
		border: 1px solid;
		border-radius: 4px;
		padding: 1px 6px;
		color: var(--color-text-muted, #94a3b8);
	}

	.confidence-row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--color-text-muted, #94a3b8);
	}

	.conf-bar {
		flex: 1;
		height: 4px;
		background: var(--color-border, #333);
		border-radius: 2px;
		overflow: hidden;
	}

	.conf-fill {
		height: 100%;
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.conf-sep {
		opacity: 0.4;
	}

	.section-label {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted, #94a3b8);
		margin-bottom: 6px;
	}

	.section-label.warn {
		color: var(--color-yellow, #f59e0b);
	}

	.atom-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.atom-chip {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--color-surface-3, #242440);
		border: 1px solid var(--color-border, #333);
		border-radius: 4px;
		padding: 2px 8px;
		font-size: 11px;
		color: var(--color-text-primary, #e2e8f0);
	}

	.atom-chip.unsupported {
		opacity: 0.5;
		border-style: dashed;
	}

	.atom-conf {
		color: var(--color-text-muted, #94a3b8);
		font-size: 10px;
	}

	.block-code {
		display: block;
		font-family: monospace;
		font-size: 11px;
		background: var(--color-surface-3, #242440);
		border-radius: 4px;
		padding: 6px 8px;
		color: var(--color-text-primary, #e2e8f0);
		word-break: break-all;
		margin-bottom: 4px;
	}

	.atoms-section,
	.blocks-section,
	.unsupported-section {
		display: flex;
		flex-direction: column;
	}
</style>
