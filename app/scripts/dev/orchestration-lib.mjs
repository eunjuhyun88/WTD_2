#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  loadConfig,
  normalizeRepoPath,
  readClaims,
  readJson,
  sanitize,
  validateSurfaceId,
  writeJson,
} from './coordination-lib.mjs';

export const VALID_WORK_STATUSES = ['planned', 'ready', 'active', 'blocked', 'handoff', 'done', 'abandoned'];
const VALID_PRIORITY = new Set(['p0', 'p1', 'p2', 'p3']);

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function pickField(raw, key, existing, fallback = '') {
  if (Object.prototype.hasOwnProperty.call(raw, key)) {
    const value = raw[key];
    if (value === undefined) {
      return existing && Object.prototype.hasOwnProperty.call(existing, key) ? existing[key] : fallback;
    }
    if (value === null) {
      return value;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return existing && Object.prototype.hasOwnProperty.call(existing, key) ? existing[key] : fallback;
    }
    return value;
  }
  if (existing && Object.prototype.hasOwnProperty.call(existing, key)) {
    return existing[key];
  }
  return fallback;
}

function normalizeList(items, mapper = (value) => value) {
  return unique((items ?? []).map((item) => mapper(item)).filter(Boolean));
}

function repoPath(rootDir, relPath) {
  return path.join(rootDir, normalizeRepoPath(relPath));
}

export function orchestrationConfig(config) {
  return {
    enabled: config.orchestration?.enabled ?? true,
    workItemsDir: normalizeRepoPath(config.orchestration?.workItemsDir ?? '.agent-context/orchestration/work-items'),
    boardPath: normalizeRepoPath(config.orchestration?.boardPath ?? '.agent-context/orchestration/board.md'),
    summaryPath: normalizeRepoPath(config.orchestration?.summaryPath ?? '.agent-context/orchestration/summary.json'),
    defaultStatus: normalizeString(config.orchestration?.defaultStatus || 'planned') || 'planned',
    readyStatuses: normalizeList(config.orchestration?.readyStatuses ?? ['ready']),
    activeStatuses: normalizeList(config.orchestration?.activeStatuses ?? ['active']),
    blockedStatuses: normalizeList(config.orchestration?.blockedStatuses ?? ['blocked', 'handoff']),
    terminalStatuses: normalizeList(config.orchestration?.terminalStatuses ?? ['done', 'abandoned']),
    enforceClaimSync: config.orchestration?.enforceClaimSync ?? true,
  };
}

export function orchestrationPaths(rootDir, config = loadConfig(rootDir)) {
  const orchestration = orchestrationConfig(config);
  return {
    orchestrationDir: repoPath(rootDir, path.dirname(orchestration.workItemsDir)),
    workItemsDir: repoPath(rootDir, orchestration.workItemsDir),
    boardPath: repoPath(rootDir, orchestration.boardPath),
    summaryPath: repoPath(rootDir, orchestration.summaryPath),
  };
}

export function workItemPath(rootDir, workId, config = loadConfig(rootDir)) {
  const { workItemsDir } = orchestrationPaths(rootDir, config);
  return path.join(workItemsDir, `${sanitize(workId)}.json`);
}

export function readWorkItems(rootDir, config = loadConfig(rootDir)) {
  const { workItemsDir } = orchestrationPaths(rootDir, config);
  if (!fs.existsSync(workItemsDir)) return [];
  return fs.readdirSync(workItemsDir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => readJson(path.join(workItemsDir, entry)))
    .filter((item) => item && item.workId)
    .map((item) => normalizeWorkItem(item, { existing: item }))
    .sort((left, right) => String(left.workId ?? '').localeCompare(String(right.workId ?? '')));
}

export function normalizeWorkItem(raw, options = {}) {
  const existing = options.existing ?? null;
  const timestamp = options.timestamp ?? new Date().toISOString();
  const workId = normalizeString(pickField(raw, 'workId', existing));
  const rawTitle = pickField(raw, 'title', existing, '');
  const rawSummary = pickField(raw, 'summary', existing, '');
  const title = normalizeString(rawTitle || rawSummary || workId);
  const summary = normalizeString(rawSummary || title);
  const status = normalizeString(pickField(raw, 'status', existing, options.defaultStatus || 'planned')) || 'planned';
  if (!VALID_WORK_STATUSES.includes(status)) {
    throw new Error(`[orch] invalid status: ${status}`);
  }
  const priority = normalizeString(pickField(raw, 'priority', existing, 'p2')).toLowerCase();
  if (!VALID_PRIORITY.has(priority)) {
    throw new Error(`[orch] invalid priority: ${priority}`);
  }
  return {
    version: 1,
    workId,
    title,
    summary,
    surface: normalizeString(pickField(raw, 'surface', existing)),
    status,
    priority,
    agent: normalizeString(pickField(raw, 'agent', existing)) || null,
    branch: normalizeString(pickField(raw, 'branch', existing)) || null,
    handoffTo: normalizeString(pickField(raw, 'handoffTo', existing)) || null,
    note: normalizeString(pickField(raw, 'note', existing)) || '',
    claimStatus: normalizeString(pickField(raw, 'claimStatus', existing)) || null,
    releaseNote: normalizeString(pickField(raw, 'releaseNote', existing)) || null,
    paths: normalizeList(raw.paths ?? existing?.paths ?? [], normalizeRepoPath),
    docs: normalizeList(raw.docs ?? existing?.docs ?? [], normalizeRepoPath),
    outputs: normalizeList(raw.outputs ?? existing?.outputs ?? [], normalizeRepoPath),
    dependsOn: normalizeList(raw.dependsOn ?? existing?.dependsOn ?? []),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function resolveDependencyState(item, items, orchestration) {
  const itemsById = new Map(items.map((candidate) => [candidate.workId, candidate]));
  const missingDependencies = [];
  const openDependencies = [];
  for (const dependencyId of item.dependsOn ?? []) {
    const dependency = itemsById.get(dependencyId);
    if (!dependency) {
      missingDependencies.push(dependencyId);
      continue;
    }
    if (!orchestration.terminalStatuses.includes(dependency.status)) {
      openDependencies.push(dependencyId);
    }
  }
  const readyNow = item.status === 'ready' && missingDependencies.length === 0 && openDependencies.length === 0;
  const activeNow = item.status === 'active' && missingDependencies.length === 0 && openDependencies.length === 0;
  return {
    missingDependencies,
    openDependencies,
    readyNow,
    activeNow,
  };
}

function renderTable(items) {
  if (items.length === 0) {
    return ['- none'];
  }
  return [
    '| Work ID | Title | Surface | Status | Agent | Blockers |',
    '| --- | --- | --- | --- | --- | --- |',
    ...items.map((item) => {
      const blockers = item.missingDependencies.length > 0
        ? `missing: ${item.missingDependencies.join(', ')}`
        : item.openDependencies.length > 0
          ? item.openDependencies.join(', ')
          : '-';
      return `| \`${item.workId}\` | ${item.title} | \`${item.surface || '-'}\` | \`${item.status}\` | \`${item.agent || '-'}\` | ${blockers} |`;
    }),
  ];
}

function renderPaths(title, values) {
  return [
    `## ${title}`,
    ...(values.length > 0 ? values.map((value) => `- \`${value}\``) : ['- none']),
    '',
  ];
}

export function renderOrchestrationArtifacts(rootDir, config = loadConfig(rootDir)) {
  const orchestration = orchestrationConfig(config);
  if (!orchestration.enabled) return null;

  const { boardPath, summaryPath } = orchestrationPaths(rootDir, config);
  const items = readWorkItems(rootDir, config);
  const claims = readClaims(rootDir);
  const itemsWithState = items.map((item) => ({
    ...item,
    ...resolveDependencyState(item, items, orchestration),
  }));

  const summary = {
    generatedAt: new Date().toISOString(),
    counts: {
      total: itemsWithState.length,
      ready: itemsWithState.filter((item) => item.readyNow).length,
      active: itemsWithState.filter((item) => item.activeNow).length,
      blocked: itemsWithState.filter((item) => orchestration.blockedStatuses.includes(item.status) || item.openDependencies.length > 0 || item.missingDependencies.length > 0).length,
      handoff: itemsWithState.filter((item) => item.status === 'handoff').length,
      done: itemsWithState.filter((item) => item.status === 'done').length,
    },
    readyQueue: itemsWithState
      .filter((item) => item.readyNow)
      .map((item) => ({
        workId: item.workId,
        title: item.title,
        surface: item.surface,
        priority: item.priority,
        dependsOn: item.dependsOn,
      })),
    activeClaims: claims.map((claim) => ({
      workId: claim.workId,
      branch: claim.branch,
      agent: claim.agent,
      surface: claim.surface,
      status: claim.status,
    })),
  };

  const readyItems = itemsWithState.filter((item) => item.readyNow);
  const activeItems = itemsWithState.filter((item) => item.activeNow);
  const blockedItems = itemsWithState.filter((item) => item.status !== 'handoff' && !item.readyNow && !item.activeNow && (orchestration.blockedStatuses.includes(item.status) || item.openDependencies.length > 0 || item.missingDependencies.length > 0));
  const handoffItems = itemsWithState.filter((item) => item.status === 'handoff');
  const terminalItems = itemsWithState.filter((item) => orchestration.terminalStatuses.includes(item.status));

  const lines = [
    '# Work Orchestration Board',
    '',
    `- Generated at: \`${summary.generatedAt}\``,
    `- Total items: \`${summary.counts.total}\``,
    `- Ready now: \`${summary.counts.ready}\``,
    `- Active now: \`${summary.counts.active}\``,
    `- Blocked or waiting: \`${summary.counts.blocked}\``,
    '',
    '## Ready Queue',
    ...renderTable(readyItems),
    '',
    '## Active Work',
    ...renderTable(activeItems),
    '',
    '## Blocked / Waiting',
    ...renderTable(blockedItems),
    '',
    '## Handoff Queue',
    ...renderTable(handoffItems),
    '',
    '## Completed / Archived',
    ...renderTable(terminalItems),
    '',
    ...renderPaths('Active Claim IDs', claims.map((claim) => claim.workId)),
  ];

  ensureDir(path.dirname(boardPath));
  ensureDir(path.dirname(summaryPath));
  fs.writeFileSync(boardPath, `${lines.join('\n')}\n`);
  writeJson(summaryPath, summary);
  return { boardPath, summaryPath, summary };
}

export function upsertWorkItem(rootDir, patch, options = {}) {
  const config = options.config ?? loadConfig(rootDir);
  const orchestration = orchestrationConfig(config);
  if (!orchestration.enabled) return null;

  if (!patch.workId) {
    throw new Error('[orch] --work-id is required');
  }
  if (patch.surface) {
    validateSurfaceId(config, patch.surface);
  }

  const targetPath = workItemPath(rootDir, patch.workId, config);
  const existing = fs.existsSync(targetPath) ? readJson(targetPath) : null;
  const next = normalizeWorkItem(patch, {
    existing,
    defaultStatus: orchestration.defaultStatus,
  });
  ensureDir(path.dirname(targetPath));
  writeJson(targetPath, next);
  renderOrchestrationArtifacts(rootDir, config);
  return next;
}

export function syncClaimToWorkItem(rootDir, claim, options = {}) {
  if (!claim?.workId) return null;
  return upsertWorkItem(rootDir, {
    workId: claim.workId,
    title: claim.summary,
    summary: claim.summary,
    surface: claim.surface,
    status: claim.status === 'blocked' ? 'blocked' : 'active',
    priority: options.priority,
    agent: claim.agent,
    branch: claim.branch,
    paths: claim.paths,
    docs: claim.docs,
    dependsOn: claim.dependsOn,
    claimStatus: claim.status,
    handoffTo: null,
  }, options);
}

export function syncReleasedClaimToWorkItem(rootDir, claim, release, options = {}) {
  if (!claim?.workId) return null;
  const statusMap = {
    done: 'done',
    handoff: 'handoff',
    abandoned: 'abandoned',
  };
  return upsertWorkItem(rootDir, {
    workId: claim.workId,
    title: claim.summary,
    summary: claim.summary,
    surface: claim.surface,
    status: statusMap[release.status] ?? release.status,
    agent: claim.agent,
    branch: claim.branch,
    paths: claim.paths,
    docs: claim.docs,
    dependsOn: claim.dependsOn,
    claimStatus: null,
    handoffTo: release.handoffTo || null,
    releaseNote: release.note || null,
  }, options);
}

export function collectOrchestrationIssues({ items, claims, orchestration }) {
  const failures = [];
  const warnings = [];
  const itemsById = new Map(items.map((item) => [item.workId, item]));
  const claimByWorkId = new Map(claims.map((claim) => [claim.workId, claim]));

  for (const item of items) {
    if (!VALID_WORK_STATUSES.includes(item.status)) {
      failures.push(`work item \`${item.workId}\` uses invalid status \`${item.status}\``);
    }
    if (item.handoffTo == null && item.status === 'handoff') {
      failures.push(`work item \`${item.workId}\` is handoff without \`handoffTo\``);
    }
    if (item.dependsOn.includes(item.workId)) {
      failures.push(`work item \`${item.workId}\` cannot depend on itself`);
    }

    const dependencyState = resolveDependencyState(item, items, orchestration);
    if (dependencyState.missingDependencies.length > 0) {
      failures.push(`work item \`${item.workId}\` depends on missing work IDs: ${dependencyState.missingDependencies.map((value) => `\`${value}\``).join(', ')}`);
    }
    if ((item.status === 'ready' || item.status === 'active') && dependencyState.openDependencies.length > 0) {
      failures.push(`work item \`${item.workId}\` is \`${item.status}\` but still waits on ${dependencyState.openDependencies.map((value) => `\`${value}\``).join(', ')}`);
    }

    const claim = claimByWorkId.get(item.workId);
    if (orchestration.enforceClaimSync && item.status === 'active' && !claim) {
      failures.push(`work item \`${item.workId}\` is active but has no matching coordination claim`);
    }
    if (item.status !== 'active' && claim && orchestration.enforceClaimSync) {
      warnings.push(`work item \`${item.workId}\` has active claim \`${claim.workId}\` while status is \`${item.status}\``);
    }
    if (claim) {
      if (item.surface && claim.surface && item.surface !== claim.surface) {
        failures.push(`work item \`${item.workId}\` surface \`${item.surface}\` does not match claim surface \`${claim.surface}\``);
      }
      if (item.branch && claim.branch && item.branch !== claim.branch) {
        failures.push(`work item \`${item.workId}\` branch \`${item.branch}\` does not match claim branch \`${claim.branch}\``);
      }
    }
  }

  const visited = new Set();
  const stack = new Set();
  function visit(workId) {
    if (stack.has(workId)) {
      failures.push(`orchestration dependency cycle detected at \`${workId}\``);
      return;
    }
    if (visited.has(workId)) return;
    visited.add(workId);
    stack.add(workId);
    const item = itemsById.get(workId);
    for (const dependencyId of item?.dependsOn ?? []) {
      if (itemsById.has(dependencyId)) {
        visit(dependencyId);
      }
    }
    stack.delete(workId);
  }
  for (const item of items) {
    visit(item.workId);
  }

  if (orchestration.enforceClaimSync) {
    for (const claim of claims) {
      if (!itemsById.has(claim.workId)) {
        warnings.push(`claim \`${claim.workId}\` has no orchestration work item yet`);
      }
    }
  }

  return { failures, warnings };
}
