#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPERIMENT_ID = 'replication-pilot-source-capture-2026-04-16';
const STRATEGY_ID = 'rsi-overbought-long-btc-4h';

function readText(path) {
	return readFileSync(path, 'utf8');
}

function extractStillRequired(summary) {
	const lines = summary.split('\n');
	const out = [];
	let inSection = false;
	for (const line of lines) {
		if (line.startsWith('## Still Required Before Parity Run')) {
			inSection = true;
			continue;
		}
		if (inSection && line.startsWith('## ')) break;
		if (inSection && line.startsWith('- ')) out.push(line.slice(2).trim());
	}
	return out;
}

function hasValue(summary, label) {
	const line = summary
		.split('\n')
		.find((entry) => entry.startsWith(`- ${label}:`));
	if (!line) return false;
	const value = line.slice(line.indexOf(':') + 1).replaceAll('`', '').trim();
	return value.length > 0;
}

function buildReport(status) {
	const lines = [];
	lines.push(`# Research report — ${EXPERIMENT_ID}`);
	lines.push('');
	lines.push(`- **Strategy id**: \`${status.strategyId}\``);
	lines.push(`- **Source pack**: \`${status.sourcePackRel}\``);
	lines.push(`- **Ready for parity**: ${status.readyForParity ? 'YES' : 'NO'}`);
	lines.push(`- **Blocked items**: ${status.blockedItems.length}`);
	lines.push(`- **Source URL present**: ${status.sourceUrlPresent ? 'YES' : 'NO'}`);
	lines.push(`- **Author label present**: ${status.authorPresent ? 'YES' : 'NO'}`);
	lines.push(`- **Placeholder Pine file**: ${status.placeholderCode ? 'YES' : 'NO'}`);
	lines.push('');
	lines.push('## File checks');
	lines.push('');
	lines.push(`- source-summary.md: ${status.summaryExists ? 'present' : 'missing'}`);
	lines.push(`- source-notes.md: ${status.notesExists ? 'present' : 'missing'}`);
	lines.push(`- source-code.pine: ${status.codeExists ? 'present' : 'missing'}`);
	lines.push('');
	lines.push('## Blockers');
	lines.push('');
	if (status.blockedItems.length === 0) {
		lines.push('- none');
	} else {
		for (const item of status.blockedItems) lines.push(`- ${item}`);
	}
	lines.push('');
	lines.push('## Interpretation');
	lines.push('');
	if (status.readyForParity) {
		lines.push('- source pack is complete enough to begin local parity implementation');
	} else {
		lines.push('- source pack is not yet complete enough for parity implementation');
		lines.push('- next work should replace missing provenance and placeholder logic before simulator work begins');
	}
	lines.push('');
	return lines.join('\n');
}

function main() {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const repoRoot = join(__dirname, '../../../../..');
	const sourcePackDir = join(
		repoRoot,
		'research/datasets/strategy-replication',
		STRATEGY_ID
	);
	const sourcePackRel = `research/datasets/strategy-replication/${STRATEGY_ID}`;
	const summaryPath = join(sourcePackDir, 'source-summary.md');
	const notesPath = join(sourcePackDir, 'source-notes.md');
	const codePath = join(sourcePackDir, 'source-code.pine');

	const status = {
		experimentId: EXPERIMENT_ID,
		strategyId: STRATEGY_ID,
		sourcePackRel,
		summaryExists: false,
		notesExists: false,
		codeExists: false,
		sourceUrlPresent: false,
		authorPresent: false,
		placeholderCode: true,
		blockedItems: [],
		readyForParity: false
	};

	let summary = '';
	let notes = '';
	let code = '';

	try {
		summary = readText(summaryPath);
		status.summaryExists = true;
	} catch {
		status.blockedItems.push('source-summary.md missing');
	}

	try {
		notes = readText(notesPath);
		status.notesExists = true;
	} catch {
		status.blockedItems.push('source-notes.md missing');
	}

	try {
		code = readText(codePath);
		status.codeExists = true;
	} catch {
		status.blockedItems.push('source-code.pine missing');
	}

	if (status.summaryExists) {
		status.sourceUrlPresent = hasValue(summary, 'source URL');
		status.authorPresent = hasValue(summary, 'author label');
		if (!status.sourceUrlPresent) status.blockedItems.push('source URL not captured');
		if (!status.authorPresent) status.blockedItems.push('author label not captured');
		for (const item of extractStillRequired(summary)) status.blockedItems.push(item);
	}

	if (status.notesExists && notes.includes('Do not implement this strategy from the label alone.')) {
		status.blockedItems.push('source-notes still mark the strategy as label-only');
	}

	if (status.codeExists) {
		status.placeholderCode = code.includes('Pending source capture');
		if (status.placeholderCode) status.blockedItems.push('source-code.pine is still a placeholder');
	}

	status.blockedItems = [...new Set(status.blockedItems)];
	status.readyForParity = status.blockedItems.length === 0;

	const outDir = join(repoRoot, 'docs/generated/research');
	mkdirSync(outDir, { recursive: true });
	const markdownPath = join(outDir, `report-${EXPERIMENT_ID}.md`);
	const jsonPath = join(outDir, `report-${EXPERIMENT_ID}.json`);

	writeFileSync(markdownPath, buildReport(status));
	writeFileSync(jsonPath, `${JSON.stringify(status, null, 2)}\n`);

	console.log(`[${EXPERIMENT_ID}] report written: ${markdownPath}`);
	console.log(`[${EXPERIMENT_ID}] status written: ${jsonPath}`);
	console.log(`[${EXPERIMENT_ID}] ready_for_parity=${status.readyForParity}`);
	console.log(`[${EXPERIMENT_ID}] blocked_items=${status.blockedItems.length}`);
	return 0;
}

process.exit(main());
