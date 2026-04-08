#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  coordinationConfig,
  currentBranch,
  isFeatureBranch,
  listChangedFiles,
  loadConfig,
  normalizeRepoPath,
  readClaims,
  resolveRootDir,
} from './coordination-lib.mjs';

const rootDir = resolveRootDir();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  });
  if (result.status !== 0) {
    const rendered = [command, ...args].join(' ');
    throw new Error(`[autopilot] command failed (${result.status}): ${rendered}`);
  }
  return result;
}

function sanitize(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseArgs(argv) {
  const output = { stage: '', forceCheckpoint: false };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!output.stage && !current.startsWith('-')) {
      output.stage = current;
      continue;
    }
    if (current === '--force-checkpoint') {
      output.forceCheckpoint = true;
      continue;
    }
    if (current === '-h' || current === '--help') {
      console.log('Usage: node scripts/dev/context-autopilot.mjs <stage> [--force-checkpoint]');
      process.exit(0);
    }
    throw new Error(`[autopilot] unknown option: ${current}`);
  }
  if (!output.stage) {
    throw new Error('[autopilot] missing stage');
  }
  return output;
}

function autopilotConfig(config) {
  return {
    enabled: config.autopilot?.enabled ?? true,
    agentId: process.env.CTX_AGENT_ID?.trim() || config.autopilot?.agentId || 'autopilot',
    relayAgentId: process.env.MEMENTO_AGENT?.trim() || process.env.CTX_AGENT_ID?.trim() || config.autopilot?.relayAgentId || 'implementer-ui',
    autoSave: config.autopilot?.autoSave ?? true,
    autoCheckpoint: config.autopilot?.autoCheckpoint ?? true,
    autoClaim: config.autopilot?.autoClaim ?? true,
    autoCompactOnStop: config.autopilot?.autoCompactOnStop ?? true,
    autoCompactOnPreCompact: config.autopilot?.autoCompactOnPreCompact ?? true,
    autoRelayOnStop: config.autopilot?.autoRelayOnStop ?? true,
    minimumClaimPathDepth: Number(config.autopilot?.minimumClaimPathDepth ?? 2),
    defaultSurface: config.autopilot?.defaultSurface || (config.surfaces?.[0]?.id ?? 'core'),
    defaultObjectivePrefix: config.autopilot?.defaultObjectivePrefix || 'Resume branch work on',
    defaultDocs: config.autopilot?.defaultDocs ?? [
      'README.md',
      'AGENTS.md',
      'docs/README.md',
      'ARCHITECTURE.md',
      'docs/CONTEXT_ENGINEERING.md',
    ],
    minIntervalSec: Number(process.env.CTX_AUTO_MIN_INTERVAL_SEC ?? config.autopilot?.minIntervalSec ?? 300),
  };
}

function inferSurface(config, branchName, branchClaims, changedFiles, autopilot) {
  const envSurface = process.env.CTX_SURFACE?.trim();
  if (envSurface) return envSurface;
  if (branchClaims.length === 1 && branchClaims[0].surface) return branchClaims[0].surface;

  const surfaces = (config.surfaces ?? []).map((item) => item.id).filter(Boolean);
  if (surfaces.length === 0) return autopilot.defaultSurface || 'core';
  if (surfaces.length === 1) return surfaces[0];

  const branchLower = branchName.toLowerCase();
  for (const surface of surfaces) {
    if (branchLower.includes(surface.toLowerCase())) return surface;
  }

  for (const filePath of changedFiles) {
    const lower = filePath.toLowerCase();
    for (const surface of surfaces) {
      if (lower.includes(`/${surface.toLowerCase()}`) || lower.includes(`${surface.toLowerCase()}.`)) {
        return surface;
      }
    }
  }

  return autopilot.defaultSurface || surfaces[0];
}

function pointerWorkId(branchName) {
  const branchSafe = sanitize(branchName.replaceAll('/', '-'));
  const pointer = path.join(rootDir, '.agent-context', 'runtime', `${branchSafe}.work-id`);
  if (!fs.existsSync(pointer)) return '';
  return fs.readFileSync(pointer, 'utf8').trim();
}

function currentWorkId(branchName) {
  const explicit = process.env.CTX_WORK_ID?.trim();
  if (explicit) return explicit;
  const pointer = pointerWorkId(branchName);
  if (pointer) return pointer;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  return `AUTO-${stamp}-${sanitize(branchName.replaceAll('/', '-'))}`;
}

function branchCheckpointPath(branchName) {
  return path.join(rootDir, '.agent-context', 'checkpoints', `${sanitize(branchName.replaceAll('/', '-'))}-latest.md`);
}

function changedFilesForAutopilot(mainBranch, coordination) {
  return listChangedFiles(rootDir, mainBranch)
    .map(normalizeRepoPath)
    .filter(Boolean)
    .filter((filePath) => !coordination.sharedPathPrefixes.some((prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`)));
}

function commonPathPrefix(paths) {
  if (paths.length === 0) return '';
  const split = paths.map((item) => item.split('/').filter(Boolean));
  if (split.length === 1) {
    if (split[0].length <= 1) return split[0][0] ?? '';
    return split[0].slice(0, -1).join('/') || split[0].join('/');
  }
  const prefix = [];
  for (let index = 0; ; index += 1) {
    const candidate = split[0][index];
    if (!candidate) break;
    if (split.every((parts) => parts[index] === candidate)) {
      prefix.push(candidate);
      continue;
    }
    break;
  }
  return prefix.join('/');
}

function inferClaimPath(changedFiles, autopilot) {
  const explicit = process.env.CTX_AUTO_CLAIM_PATH?.trim();
  if (explicit) {
    return explicit
      .split(',')
      .map((value) => normalizeRepoPath(value))
      .filter(Boolean);
  }
  const prefix = commonPathPrefix(changedFiles);
  if (prefix) {
    const depth = prefix.split('/').filter(Boolean).length;
    if (depth >= autopilot.minimumClaimPathDepth) return [prefix];
  }

  const claimPrefixes = [];
  for (const filePath of changedFiles) {
    const normalized = normalizeRepoPath(filePath);
    if (!normalized) continue;
    const dirname = path.posix.dirname(normalized);
    const directoryDepth = dirname.split('/').filter(Boolean).length;
    if (dirname && dirname !== '.' && directoryDepth >= autopilot.minimumClaimPathDepth) {
      claimPrefixes.push(dirname);
      continue;
    }

    const fileDepth = normalized.split('/').filter(Boolean).length;
    if (fileDepth >= autopilot.minimumClaimPathDepth) {
      claimPrefixes.push(normalized);
    }
  }

  const collapsed = [...new Set(claimPrefixes)]
    .sort((left, right) => {
      const leftDepth = left.split('/').filter(Boolean).length;
      const rightDepth = right.split('/').filter(Boolean).length;
      if (leftDepth !== rightDepth) return leftDepth - rightDepth;
      return left.localeCompare(right);
    })
    .reduce((acc, candidate) => {
      if (acc.some((existing) => candidate === existing || candidate.startsWith(`${existing}/`))) {
        return acc;
      }
      acc.push(candidate);
      return acc;
    }, []);

  if (collapsed.length > 0) return collapsed;

  return [];
}

function isExpiredClaim(claim) {
  if (!claim?.leaseExpiresAt) return false;
  const expiry = Date.parse(claim.leaseExpiresAt);
  return Number.isFinite(expiry) && expiry < Date.now();
}

function releaseClaim(workId, note) {
  run('node', [
    'scripts/dev/release-work.mjs',
    '--work-id', workId,
    '--status', 'abandoned',
    '--note', note,
  ]);
}

function relayBranchHandoff({ branchName, workId, autopilot }) {
  if (!autopilot.autoRelayOnStop) return;
  if (!workId) return;
  if (!fs.existsSync(path.join(rootDir, 'scripts/dev/memento-relay.mjs'))) return;

  const summary = process.env.MEMENTO_SUMMARY?.trim() || `Autopilot stop relay for ${branchName}`;
  run('node', [
    'scripts/dev/memento-relay.mjs',
    '--branch', branchName,
    '--work-id', workId,
    '--agent', autopilot.relayAgentId,
    '--summary', summary,
  ]);
}

function ensureCheckpoint({ branchName, surface, workId, autopilot, forceCheckpoint }) {
  const checkpointLatest = branchCheckpointPath(branchName);
  if (!forceCheckpoint && fs.existsSync(checkpointLatest)) {
    console.log(`[autopilot] checkpoint already exists for branch ${branchName}`);
    return;
  }

  const objective = process.env.CTX_OBJECTIVE?.trim() || `${autopilot.defaultObjectivePrefix} ${branchName}`;
  const args = [
    'scripts/dev/context-checkpoint.sh',
    '--work-id', workId,
    '--surface', surface,
    '--objective', objective,
    '--status', 'in_progress',
    '--why', 'autopilot created a provisional checkpoint because the branch had no semantic checkpoint yet.',
    '--scope', 'Replace this provisional checkpoint with a task-specific objective and scope once the work intent is explicit.',
    '--next', 'Replace the provisional objective with the actual task objective.',
    '--next', 'Confirm or refine the owned path boundary before push.',
  ];
  for (const docPath of autopilot.defaultDocs) {
    args.push('--doc', docPath);
  }
  run('bash', args);
}

function ensureClaim({ branchName, surface, workId, autopilot, coordination, branchClaims, changedFiles }) {
  if (!coordination.requireClaimOnFeatureBranches || !isFeatureBranch(branchName, coordination.featureBranchPrefixes)) {
    return;
  }
  const expiredClaims = branchClaims.filter((claim) => isExpiredClaim(claim));
  const liveClaims = branchClaims.filter((claim) => !isExpiredClaim(claim));

  if (expiredClaims.length > 0) {
    for (const claim of expiredClaims) {
      releaseClaim(claim.workId, `Autopilot rotated expired claim for ${branchName}`);
    }
  }

  if (liveClaims.length > 1) {
    throw new Error(`[autopilot] branch ${branchName} has multiple live claims; resolve coordination state manually`);
  }

  if (liveClaims.length === 1) {
    const [existingClaim] = liveClaims;
    if (existingClaim.workId === workId) {
      console.log(`[autopilot] claim already current for branch ${branchName}`);
      return;
    }

    releaseClaim(existingClaim.workId, `Autopilot rotated superseded claim for ${branchName}; current work ID is ${workId}`);
  }
  const claimPaths = inferClaimPath(changedFiles, autopilot);
  if (claimPaths.length === 0) {
    console.log(`[autopilot] no safe claim path inferred for branch ${branchName}; skipping provisional claim`);
    return;
  }
  const args = [
    'scripts/dev/claim-work.mjs',
    '--work-id', workId,
    '--agent', autopilot.agentId,
    '--surface', surface,
    '--summary', `Autopilot provisional ownership for ${branchName}`,
  ];
  for (const claimPath of claimPaths) {
    args.push('--path', claimPath);
  }
  run('node', args);
}

const { stage, forceCheckpoint } = parseArgs(process.argv.slice(2));
const config = loadConfig(rootDir);
const autopilot = autopilotConfig(config);

if (process.env.CTX_AUTOPILOT_DISABLED === '1' || !autopilot.enabled) {
  console.log('[autopilot] disabled');
  process.exit(0);
}

const branchName = currentBranch(rootDir);
if (!branchName || branchName === 'HEAD') {
  console.log('[autopilot] detached HEAD; skipping');
  process.exit(0);
}

const mainBranch = config.git?.mainBranch || 'main';
const coordination = coordinationConfig(config);
const changedFiles = changedFilesForAutopilot(mainBranch, coordination);
const claims = readClaims(rootDir);
const branchClaims = claims.filter((claim) => claim.branch === branchName);
const surface = inferSurface(config, branchName, branchClaims, changedFiles, autopilot);
const workId = currentWorkId(branchName);

if (autopilot.autoSave) {
  run('bash', ['scripts/dev/context-auto.sh', stage], {
    env: {
      ...process.env,
      CTX_AUTO_SKIP_COMPACT: '1',
      CTX_AUTO_MIN_INTERVAL_SEC: String(autopilot.minIntervalSec),
      CTX_WORK_ID: workId,
      CTX_AGENT_ID: autopilot.agentId,
    },
  });
}

if (autopilot.autoCheckpoint) {
  ensureCheckpoint({ branchName, surface, workId, autopilot, forceCheckpoint });
}

if (autopilot.autoClaim && (stage === 'post-edit' || stage === 'pre-push')) {
  ensureClaim({ branchName, surface, workId, autopilot, coordination, branchClaims, changedFiles });
}

if ((stage === 'pre-compact' && autopilot.autoCompactOnPreCompact) || (stage === 'stop' && autopilot.autoCompactOnStop)) {
  run('bash', ['scripts/dev/context-compact.sh', '--work-id', workId]);
}

if (stage === 'stop') {
  relayBranchHandoff({ branchName, workId, autopilot });
}

console.log(`[autopilot] stage=${stage} branch=${branchName} work_id=${workId} surface=${surface}`);
