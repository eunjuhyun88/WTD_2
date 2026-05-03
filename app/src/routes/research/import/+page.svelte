<script lang="ts">
	/**
	 * /research/import — TradingView Idea Import Workbench
	 * W-0393: Parse → Compile → Estimate → Commit
	 */
	import HypothesisCard from '$lib/components/TVImport/HypothesisCard.svelte';
	import ConstraintLadder from '$lib/components/TVImport/ConstraintLadder.svelte';
	import IdeaTwinCard from '$lib/components/TVImport/IdeaTwinCard.svelte';

	// ── State ──────────────────────────────────────────────────────────────────

	let url = $state('');
	let phase = $state<'idle' | 'loading' | 'preview' | 'committing' | 'done' | 'error'>('idle');
	let errorMsg = $state<string | null>(null);

	interface DiagRow {
		strictness: string;
		estimated_signal_count: number;
		min_sample_pass: boolean;
		warnings: string[];
		filter_dropoff: Array<{ filter: string; retained_pct: number }>;
	}

	interface Draft {
		draft_id: string;
		source_url: string;
		chart_id: string;
		source_type: string;
		parser_tier: string;
		symbol: string | null;
		exchange: string | null;
		timeframe_raw: string | null;
		timeframe_engine: string | null;
		title: string | null;
		description: string | null;
		author_username: string | null;
		author_display_name: string | null;
		snapshot_url: string | null;
		vision_spec: {
			direction: string | null;
			pattern_family: string;
			visible_atoms: Array<{ kind: string; confidence: number; source: string }>;
			confidence: number;
			parser_tier: string;
		};
		compiler_spec: {
			base_pattern_slug: string;
			direction: string;
			timeframe: string;
			trigger_block: string;
			confirmation_blocks: string[];
			indicator_filters: unknown[];
			unsupported_atoms: string[];
			compiler_confidence: number;
			strictness_variants: Record<string, unknown>;
		};
		diagnostics: DiagRow;
	}

	interface CommitResult {
		ok: boolean;
		import_id: string;
		combo_id: string;
		variant_id: string;
		estimated_signal_count: number;
		min_sample_pass: boolean;
		strictness: string;
	}

	let draft = $state<Draft | null>(null);
	let selectedStrictness = $state('base');
	let ladderVariants = $state<Record<string, DiagRow>>({});
	let ladderLoading = $state(false);
	let commitResult = $state<CommitResult | null>(null);

	// Overrides
	let overrideSymbol = $state('');
	let overrideTimeframe = $state('');
	let overrideDirection = $state('');

	// ── Actions ────────────────────────────────────────────────────────────────

	async function runPreview(): Promise<void> {
		if (!url.trim()) return;
		phase = 'loading';
		errorMsg = null;
		draft = null;
		ladderVariants = {};

		try {
			const res = await fetch('/api/research/tv-import/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url: url.trim() }),
			});
			const body = await res.json();
			if (!res.ok) {
				throw new Error(body.detail ?? `HTTP ${res.status}`);
			}
			draft = body as Draft;
			phase = 'preview';

			// Pre-fetch strict + loose in background
			prefetchVariants();
		} catch (e) {
			errorMsg = (e as Error).message;
			phase = 'error';
		}
	}

	async function prefetchVariants(): Promise<void> {
		if (!draft) return;
		ladderLoading = true;
		const toFetch = ['strict', 'loose'];

		await Promise.all(
			toFetch.map(async (s) => {
				try {
					const res = await fetch('/api/research/tv-import/estimate', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ draft_id: draft!.draft_id, strictness: s }),
					});
					if (res.ok) {
						const row = await res.json();
						ladderVariants = { ...ladderVariants, [s]: row as DiagRow };
					}
				} catch {
					// silent
				}
			})
		);
		ladderLoading = false;
	}

	async function handleSelectStrictness(s: string): Promise<void> {
		selectedStrictness = s;
		if (s !== 'base' && s !== 'strict' && s !== 'loose') return;
		if (ladderVariants[s] || s === 'base') return;
		ladderLoading = true;
		try {
			const res = await fetch('/api/research/tv-import/estimate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ draft_id: draft!.draft_id, strictness: s }),
			});
			if (res.ok) {
				const row = await res.json();
				ladderVariants = { ...ladderVariants, [s]: row as DiagRow };
			}
		} catch {
			// silent
		}
		ladderLoading = false;
	}

	async function runCommit(): Promise<void> {
		if (!draft) return;
		phase = 'committing';
		errorMsg = null;
		try {
			const res = await fetch('/api/research/tv-import/commit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					draft_id: draft.draft_id,
					selected_strictness: selectedStrictness,
					symbol: overrideSymbol || null,
					timeframe: overrideTimeframe || null,
					direction: overrideDirection || null,
				}),
			});
			const body = await res.json();
			if (!res.ok) {
				throw new Error(body.detail ?? `HTTP ${res.status}`);
			}
			commitResult = body as CommitResult;
			phase = 'done';
		} catch (e) {
			errorMsg = (e as Error).message;
			phase = 'error';
		}
	}

	function reset(): void {
		url = '';
		phase = 'idle';
		draft = null;
		commitResult = null;
		errorMsg = null;
		selectedStrictness = 'base';
		ladderVariants = {};
		overrideSymbol = '';
		overrideTimeframe = '';
		overrideDirection = '';
	}

	// ── Derived ────────────────────────────────────────────────────────────────

	const baseDiag = $derived(
		draft
			? {
					strictness: 'base',
					estimated_signal_count: draft.diagnostics.estimated_signal_count,
					min_sample_pass: draft.diagnostics.min_sample_pass,
					warnings: draft.diagnostics.warnings,
					filter_dropoff: draft.diagnostics.filter_dropoff,
				}
			: null
	);

	const canCommit = $derived(
		phase === 'preview' &&
			draft !== null &&
			(selectedStrictness === 'loose' ||
				(baseDiag?.min_sample_pass ?? false) ||
				(ladderVariants[selectedStrictness]?.min_sample_pass ?? false))
	);
</script>

<svelte:head>
	<title>TV Import — Research</title>
</svelte:head>

<div class="workbench">
	<div class="workbench-header">
		<h1 class="workbench-title">TradingView Import</h1>
		<p class="workbench-subtitle">
			Parse a public chart idea URL into a testable hypothesis and add it to the scanner.
		</p>
	</div>

	<!-- URL input -->
	<div class="url-row">
		<input
			class="url-input"
			type="url"
			placeholder="https://www.tradingview.com/chart/… or /ideas/…"
			bind:value={url}
			onkeydown={(e) => e.key === 'Enter' && runPreview()}
			disabled={phase === 'loading' || phase === 'committing'}
		/>
		<button
			class="btn-primary"
			onclick={runPreview}
			disabled={!url.trim() || phase === 'loading' || phase === 'committing'}
		>
			{phase === 'loading' ? 'Parsing…' : 'Preview'}
		</button>
		{#if phase !== 'idle'}
			<button class="btn-ghost" onclick={reset}>Reset</button>
		{/if}
	</div>

	<!-- Error -->
	{#if phase === 'error' && errorMsg}
		<div class="error-banner">
			<span class="error-icon">⚠</span>
			{errorMsg}
		</div>
	{/if}

	<!-- Main 3-col layout -->
	{#if draft && (phase === 'preview' || phase === 'committing' || phase === 'done')}
		<div class="workbench-grid">
			<!-- Col 1: Snapshot + Meta -->
			<div class="col col-snapshot">
				{#if draft.snapshot_url}
					<div class="snapshot-wrap">
						<img
							class="snapshot-img"
							src={draft.snapshot_url}
							alt="Chart snapshot"
							loading="lazy"
						/>
					</div>
				{:else}
					<div class="snapshot-placeholder">No snapshot</div>
				{/if}

				<div class="meta-block">
					{#if draft.title}
						<div class="meta-title">{draft.title}</div>
					{/if}
					{#if draft.author_username}
						<div class="meta-author">
							{draft.author_display_name ?? draft.author_username}
							{#if draft.author_display_name}
								<span class="meta-handle">@{draft.author_username}</span>
							{/if}
						</div>
					{/if}
					<div class="meta-tags">
						{#if draft.symbol}
							<span class="tag">{draft.symbol}</span>
						{/if}
						{#if draft.timeframe_engine}
							<span class="tag">{draft.timeframe_engine}</span>
						{/if}
						<span class="tag">{draft.source_type}</span>
					</div>
					{#if draft.description}
						<div class="meta-description">{draft.description.slice(0, 200)}{draft.description.length > 200 ? '…' : ''}</div>
					{/if}
				</div>
			</div>

			<!-- Col 2: Hypothesis + Constraint Ladder -->
			<div class="col col-hypothesis">
				<HypothesisCard
					patternFamily={draft.compiler_spec.base_pattern_slug || draft.vision_spec.pattern_family}
					direction={draft.vision_spec.direction}
					parserTier={draft.parser_tier}
					atoms={draft.vision_spec.visible_atoms}
					confidence={draft.vision_spec.confidence}
					triggerBlock={draft.compiler_spec.trigger_block}
					confirmationBlocks={draft.compiler_spec.confirmation_blocks}
					unsupportedAtoms={draft.compiler_spec.unsupported_atoms}
					compilerConfidence={draft.compiler_spec.compiler_confidence}
				/>

				{#if baseDiag}
					<ConstraintLadder
						base={baseDiag}
						variants={ladderVariants}
						selected={selectedStrictness}
						onSelect={handleSelectStrictness}
						loading={ladderLoading}
					/>
				{/if}
			</div>

			<!-- Col 3: Overrides + Commit + Twin -->
			<div class="col col-actions">
				<!-- Overrides -->
				<div class="overrides-block">
					<div class="overrides-title">Overrides</div>
					<label class="override-field">
						<span>Symbol</span>
						<input
							type="text"
							placeholder={draft.symbol ?? 'BTCUSDT'}
							bind:value={overrideSymbol}
							disabled={phase !== 'preview'}
						/>
					</label>
					<label class="override-field">
						<span>Timeframe</span>
						<select bind:value={overrideTimeframe} disabled={phase !== 'preview'}>
							<option value="">Auto ({draft.timeframe_engine ?? '4h'})</option>
							{#each ['1h', '4h', '1d', '3d', '1w'] as tf}
								<option value={tf}>{tf}</option>
							{/each}
						</select>
					</label>
					<label class="override-field">
						<span>Direction</span>
						<select bind:value={overrideDirection} disabled={phase !== 'preview'}>
							<option value="">Auto ({draft.vision_spec.direction ?? 'long'})</option>
							<option value="long">Long</option>
							<option value="short">Short</option>
							<option value="both">Both</option>
						</select>
					</label>
				</div>

				<!-- Commit -->
				{#if phase === 'preview'}
					<button
						class="btn-commit"
						onclick={runCommit}
						disabled={!canCommit}
					>
						Add to Scanner
					</button>
					{#if !canCommit && selectedStrictness !== 'loose'}
						<p class="commit-hint">Switch to "loose" or pick a strictness with ≥30 signals to commit.</p>
					{/if}
				{/if}

				{#if phase === 'committing'}
					<div class="commit-loading">Committing…</div>
				{/if}

				<!-- Done -->
				{#if phase === 'done' && commitResult}
					<div class="commit-success">
						<div class="success-icon">✓</div>
						<div class="success-title">Added to scanner</div>
						<div class="success-meta">
							<span>~{commitResult.estimated_signal_count} signals</span>
							<span>·</span>
							<span>{commitResult.strictness}</span>
						</div>
					</div>

					{#if draft.author_username}
						<IdeaTwinCard
							importId={commitResult.import_id}
							authorUsername={draft.author_username}
							authorDisplayName={draft.author_display_name}
							pending={true}
						/>
					{/if}

					<button class="btn-ghost" onclick={reset}>Import another</button>
				{/if}

				<!-- Diagnostics detail -->
				{#if baseDiag && phase === 'preview'}
					<div class="diag-detail">
						<div class="diag-title">Diagnostics</div>
						{#if baseDiag.warnings.length}
							{#each baseDiag.warnings as w}
								<div class="diag-warning">{w}</div>
							{/each}
						{/if}
						{#if draft.diagnostics.suggested_relaxations?.length}
							<div class="diag-suggestions">
								<div class="diag-sub">Suggested relaxations</div>
								{#each draft.diagnostics.suggested_relaxations as r}
									<div class="diag-relax">{r}</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Idle empty state -->
	{#if phase === 'idle'}
		<div class="empty-state">
			<div class="empty-icon">📈</div>
			<div class="empty-title">Paste a TradingView URL above</div>
			<div class="empty-hint">
				Supports public chart ideas (<code>tradingview.com/ideas/…</code>) and<br />
				published scripts (<code>tradingview.com/script/…</code>)
			</div>
		</div>
	{/if}
</div>

<style>
	.workbench {
		max-width: 1280px;
		margin: 0 auto;
		padding: 24px 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.workbench-header {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.workbench-title {
		font-size: 20px;
		font-weight: 700;
		color: var(--color-text-primary, #e2e8f0);
		margin: 0;
	}

	.workbench-subtitle {
		font-size: 13px;
		color: var(--color-text-muted, #94a3b8);
		margin: 0;
	}

	.url-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.url-input {
		flex: 1;
		background: var(--color-surface-2, #1a1a2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		padding: 10px 14px;
		font-size: 13px;
		color: var(--color-text-primary, #e2e8f0);
		outline: none;
		transition: border-color 0.15s;
	}

	.url-input:focus {
		border-color: var(--color-blue, #3b82f6);
	}

	.url-input:disabled {
		opacity: 0.5;
	}

	.btn-primary {
		background: var(--color-blue, #3b82f6);
		color: #fff;
		border: none;
		border-radius: 6px;
		padding: 10px 20px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: opacity 0.15s;
	}

	.btn-primary:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn-ghost {
		background: transparent;
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		padding: 10px 16px;
		font-size: 13px;
		color: var(--color-text-muted, #94a3b8);
		cursor: pointer;
		white-space: nowrap;
		transition: border-color 0.15s;
	}

	.btn-ghost:hover {
		border-color: var(--color-text-muted, #94a3b8);
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		background: color-mix(in srgb, var(--color-red, #ef4444) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-red, #ef4444) 30%, transparent);
		border-radius: 6px;
		padding: 10px 14px;
		font-size: 13px;
		color: var(--color-red, #ef4444);
	}

	.error-icon {
		font-size: 14px;
	}

	/* 3-column grid */
	.workbench-grid {
		display: grid;
		grid-template-columns: 280px 1fr 280px;
		gap: 16px;
		align-items: start;
	}

	@media (max-width: 1024px) {
		.workbench-grid {
			grid-template-columns: 1fr 1fr;
		}

		.col-actions {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 640px) {
		.workbench-grid {
			grid-template-columns: 1fr;
		}
	}

	.col {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	/* Snapshot */
	.snapshot-wrap {
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid var(--color-border, #333);
		aspect-ratio: 16/9;
		background: var(--color-surface-2, #1a1a2e);
	}

	.snapshot-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.snapshot-placeholder {
		aspect-ratio: 16/9;
		background: var(--color-surface-2, #1a1a2e);
		border: 1px dashed var(--color-border, #333);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: var(--color-text-muted, #94a3b8);
	}

	/* Meta */
	.meta-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.meta-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-text-primary, #e2e8f0);
		line-height: 1.4;
	}

	.meta-author {
		font-size: 12px;
		color: var(--color-text-primary, #e2e8f0);
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.meta-handle {
		color: var(--color-text-muted, #94a3b8);
		font-size: 11px;
	}

	.meta-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.tag {
		font-size: 10px;
		background: var(--color-surface-3, #242440);
		border: 1px solid var(--color-border, #333);
		border-radius: 3px;
		padding: 1px 6px;
		color: var(--color-text-muted, #94a3b8);
	}

	.meta-description {
		font-size: 11px;
		color: var(--color-text-muted, #94a3b8);
		line-height: 1.5;
	}

	/* Overrides */
	.overrides-block {
		background: var(--color-surface-2, #1a1a2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.overrides-title {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted, #94a3b8);
	}

	.override-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.override-field span {
		font-size: 11px;
		color: var(--color-text-muted, #94a3b8);
	}

	.override-field input,
	.override-field select {
		background: var(--color-surface-3, #242440);
		border: 1px solid var(--color-border, #333);
		border-radius: 4px;
		padding: 6px 10px;
		font-size: 12px;
		color: var(--color-text-primary, #e2e8f0);
		outline: none;
	}

	.override-field input:disabled,
	.override-field select:disabled {
		opacity: 0.4;
	}

	/* Commit */
	.btn-commit {
		width: 100%;
		background: var(--color-green, #22c55e);
		color: #000;
		border: none;
		border-radius: 8px;
		padding: 12px;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.btn-commit:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.commit-hint {
		font-size: 11px;
		color: var(--color-text-muted, #94a3b8);
		text-align: center;
		margin: 0;
	}

	.commit-loading {
		text-align: center;
		font-size: 13px;
		color: var(--color-text-muted, #94a3b8);
		padding: 12px;
	}

	/* Done */
	.commit-success {
		background: color-mix(in srgb, var(--color-green, #22c55e) 8%, var(--color-surface-2, #1a1a2e));
		border: 1px solid color-mix(in srgb, var(--color-green, #22c55e) 30%, transparent);
		border-radius: 8px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-align: center;
	}

	.success-icon {
		font-size: 24px;
		color: var(--color-green, #22c55e);
	}

	.success-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text-primary, #e2e8f0);
	}

	.success-meta {
		display: flex;
		gap: 6px;
		font-size: 12px;
		color: var(--color-text-muted, #94a3b8);
	}

	/* Diagnostics */
	.diag-detail {
		background: var(--color-surface-2, #1a1a2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.diag-title {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted, #94a3b8);
	}

	.diag-warning {
		font-size: 11px;
		color: var(--color-yellow, #f59e0b);
	}

	.diag-sub {
		font-size: 10px;
		color: var(--color-text-muted, #94a3b8);
		margin-bottom: 4px;
	}

	.diag-relax {
		font-size: 11px;
		color: var(--color-text-primary, #e2e8f0);
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 80px 20px;
		text-align: center;
	}

	.empty-icon {
		font-size: 40px;
	}

	.empty-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--color-text-primary, #e2e8f0);
	}

	.empty-hint {
		font-size: 13px;
		color: var(--color-text-muted, #94a3b8);
		line-height: 1.6;
	}

	.empty-hint code {
		font-family: monospace;
		font-size: 11px;
		background: var(--color-surface-3, #242440);
		padding: 1px 4px;
		border-radius: 3px;
	}
</style>
