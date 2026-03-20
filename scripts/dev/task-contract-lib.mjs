#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { currentBranch, isFeatureBranch, loadConfig, normalizeRepoPath, resolveRootDir, sanitize } from './coordination-lib.mjs';

export const REQUIRED_CONTRACT_HEADINGS = [
  '## Goal',
  '## Scope',
  '## Finish Line',
  '## Evidence',
  '## Non-Goals',
];

export function contractConfig(config) {
  return {
    enabled: config.contracts?.enabled ?? true,
    activeDir: normalizeRepoPath(config.contracts?.activeDir ?? 'docs/task-contracts/active'),
    completedDir: normalizeRepoPath(config.contracts?.completedDir ?? 'docs/task-contracts/completed'),
    reportPath: normalizeRepoPath(config.contracts?.reportPath ?? 'docs/generated/task-contract-report.md'),
    requireOnFeatureBranches: config.contracts?.requireOnFeatureBranches ?? false,
    blockStopOnIncomplete: config.contracts?.blockStopOnIncomplete ?? true,
    featureBranchPrefixes: config.contracts?.featureBranchPrefixes ?? config.coordination?.featureBranchPrefixes ?? ['codex/'],
    defaultType: config.contracts?.defaultType ?? 'implementation',
  };
}

export function repoRoot() {
  return resolveRootDir();
}

export function repoConfig(rootDir = repoRoot()) {
  return loadConfig(rootDir);
}

export function contractPaths(rootDir, contracts) {
  return {
    activeDir: path.join(rootDir, contracts.activeDir),
    completedDir: path.join(rootDir, contracts.completedDir),
    reportPath: path.join(rootDir, contracts.reportPath),
  };
}

export function ensureContractDirs(rootDir, contracts) {
  const paths = contractPaths(rootDir, contracts);
  fs.mkdirSync(paths.activeDir, { recursive: true });
  fs.mkdirSync(paths.completedDir, { recursive: true });
  fs.mkdirSync(path.dirname(paths.reportPath), { recursive: true });
  return paths;
}

export function slugify(value) {
  return sanitize(value).replace(/\.+/g, '-');
}

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .sort()
    .map((name) => path.join(dirPath, name));
}

function sectionText(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\n([\\s\\S]*?)(?=^##\\s|\\Z)`, 'm');
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

function metadataField(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^- ${escaped}:\\s*\`?([^\\n\`]+)\`?`, 'm'));
  return match ? match[1].trim() : '';
}

function metadataBoolean(text, label) {
  const value = metadataField(text, label).toLowerCase();
  return value === 'yes' || value === 'true';
}

function firstHeading(text) {
  const match = text.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function finishItems(text) {
  const section = sectionText(text, '## Finish Line');
  return [...section.matchAll(/^- \[([ xX])\] (.+)$/gm)].map((match) => ({
    checked: match[1].toLowerCase() === 'x',
    text: match[2].trim(),
  }));
}

export function parseContractFile(rootDir, filePath, bucket) {
  const text = fs.readFileSync(filePath, 'utf8');
  const relPath = normalizeRepoPath(path.relative(rootDir, filePath));
  const title = firstHeading(text);
  const branch = metadataField(text, 'Branch');
  const surface = metadataField(text, 'Surface');
  const type = metadataField(text, 'Type');
  const declaredStatus = metadataField(text, 'Status');
  const provisional = metadataBoolean(text, 'Provisional')
    || text.includes('Provisional contract for ')
    || text.includes('Replace this provisional contract with task-specific finish checks');
  const items = finishItems(text);
  const doneCount = items.filter((item) => item.checked).length;
  const missingHeadings = REQUIRED_CONTRACT_HEADINGS.filter((heading) => !text.includes(`${heading}\n`) && !text.includes(`${heading}\r\n`));
  const warnings = [];

  if (!title.startsWith('Task Contract:')) warnings.push('title should start with `Task Contract:`');
  if (!branch) warnings.push('missing `Branch` metadata');
  if (!surface) warnings.push('missing `Surface` metadata');
  if (!type) warnings.push('missing `Type` metadata');
  if (!declaredStatus) warnings.push('missing `Status` metadata');
  if (items.length === 0) warnings.push('finish line has no checkboxes');
  for (const heading of missingHeadings) {
    warnings.push(`missing heading ${heading}`);
  }

  const complete = items.length > 0 && doneCount === items.length;
  const status = bucket === 'completed' ? 'completed' : complete ? 'ready' : 'active';

  return {
    relPath,
    title,
    branch,
    surface,
    type,
    declaredStatus,
    provisional,
    finishTotal: items.length,
    finishDone: doneCount,
    complete,
    status,
    warnings,
  };
}

export function collectContracts(rootDir = repoRoot()) {
  const config = repoConfig(rootDir);
  const contracts = contractConfig(config);
  const paths = ensureContractDirs(rootDir, contracts);
  const active = listMarkdownFiles(paths.activeDir).map((filePath) => parseContractFile(rootDir, filePath, 'active'));
  const completed = listMarkdownFiles(paths.completedDir).map((filePath) => parseContractFile(rootDir, filePath, 'completed'));
  return { config, contracts, paths, active, completed };
}

export function currentBranchContracts(rootDir = repoRoot()) {
  const { active, contracts } = collectContracts(rootDir);
  const branch = currentBranch(rootDir);
  return {
    branch,
    contracts,
    active: active.filter((item) => item.branch === branch),
  };
}

export function shouldRequireContract(rootDir = repoRoot()) {
  const { contracts } = collectContracts(rootDir);
  const branch = currentBranch(rootDir);
  return isFeatureBranch(branch, contracts.featureBranchPrefixes) && contracts.requireOnFeatureBranches;
}

export function renderTaskContractReport(rootDir = repoRoot()) {
  const { contracts, active, completed } = collectContracts(rootDir);
  const branch = currentBranch(rootDir);
  const visibleActive = active.filter((item) => !item.provisional);
  const visibleCompleted = completed.filter((item) => !item.provisional);
  const lines = [
    '# Task Contract Report',
    '',
    `- Current branch: \`${branch}\``,
    `- Active dir: \`${contracts.activeDir}\``,
    `- Completed dir: \`${contracts.completedDir}\``,
    `- Require contract on feature branches: \`${contracts.requireOnFeatureBranches ? 'yes' : 'no'}\``,
    `- Block stop on incomplete contracts: \`${contracts.blockStopOnIncomplete ? 'yes' : 'no'}\``,
    '',
    '## Active Contracts',
    '',
    '| Contract | Branch | Surface | Type | Finish | Status | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...(visibleActive.length ? visibleActive.map((item) => `| \`${item.relPath}\` | \`${item.branch || '-'}\` | \`${item.surface || '-'}\` | \`${item.type || '-'}\` | ${item.finishDone}/${item.finishTotal} | \`${item.status}\` | ${item.warnings.length ? item.warnings.join('; ') : 'ok'} |`) : ['| none | - | - | - | 0/0 | `none` | no active contracts |']),
    '',
    '## Completed Contracts',
    '',
    '| Contract | Branch | Surface | Type | Finish | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
    ...(visibleCompleted.length ? visibleCompleted.map((item) => `| \`${item.relPath}\` | \`${item.branch || '-'}\` | \`${item.surface || '-'}\` | \`${item.type || '-'}\` | ${item.finishDone}/${item.finishTotal} | ${item.warnings.length ? item.warnings.join('; ') : 'ok'} |`) : ['| none | - | - | - | 0/0 | no completed contracts |']),
    '',
    '## Current Branch Verdict',
    '',
  ];

  const branchActive = visibleActive.filter((item) => item.branch === branch);
  if (branchActive.length === 0) {
    lines.push('- No active contract is bound to the current branch.');
  } else {
    for (const item of branchActive) {
      lines.push(`- \`${item.relPath}\`: ${item.finishDone}/${item.finishTotal} finish items complete`);
    }
  }

  return `${lines.join('\n')}\n`;
}
