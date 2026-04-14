#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function usage() {
  console.log('Usage: node scripts/dev/memento-resume.mjs [--branch <name>] [--work-id <id>] [--agent <name>] [--json]');
}

function sanitize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
}

function clipText(text, maxLines = 48, maxChars = 5000) {
  if (!text) return '_missing_';
  const lines = text.split('\n').slice(0, maxLines).join('\n');
  if (lines.length <= maxChars && text.split('\n').length <= maxLines) {
    return lines;
  }
  return `${lines.slice(0, maxChars)}\n\n…truncated…`;
}

function latestMarkdownFile(dirPath) {
  if (!fs.existsSync(dirPath)) return '';
  const entries = fs.readdirSync(dirPath)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => {
      const filePath = path.join(dirPath, name);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return entries.length ? entries[0].filePath : '';
}

function mementoRoots(rootDir) {
  return [
    path.resolve(rootDir, '..', '.memento'),
    path.join(rootDir, '.agent-context', 'memento'),
  ];
}

function firstExistingPath(paths) {
  return paths.find((candidate) => fs.existsSync(candidate)) ?? '';
}

function freshestExistingPath(paths) {
  const existing = paths
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({
      filePath: candidate,
      mtimeMs: fs.statSync(candidate).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return existing[0]?.filePath ?? '';
}

const args = process.argv.slice(2);
let branch = '';
let workId = '';
let agent = process.env.MEMENTO_AGENT || 'implementer-ui';
let asJson = false;

for (let index = 0; index < args.length; index += 1) {
  const current = args[index];
  if (current === '--branch') {
    branch = args[index + 1] ?? '';
    index += 1;
  } else if (current === '--work-id') {
    workId = args[index + 1] ?? '';
    index += 1;
  } else if (current === '--agent') {
    agent = args[index + 1] ?? agent;
    index += 1;
  } else if (current === '--json') {
    asJson = true;
  }
  else if (current === '-h' || current === '--help') {
    usage();
    process.exit(0);
  }
}

const rootDir = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
if (!branch) {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
}

const branchSafe = sanitize(branch.replaceAll('/', '-'));
const workSafe = workId ? sanitize(workId) : '';
const contextDir = path.join(rootDir, '.agent-context');
const mementoDirs = mementoRoots(rootDir);

const checkpointPath = workSafe && fs.existsSync(path.join(contextDir, 'checkpoints', `${workSafe}.md`))
  ? path.join(contextDir, 'checkpoints', `${workSafe}.md`)
  : path.join(contextDir, 'checkpoints', `${branchSafe}-latest.md`);
const briefPath = workSafe
  ? (fs.existsSync(path.join(contextDir, 'briefs', `${workSafe}.md`))
      ? path.join(contextDir, 'briefs', `${workSafe}.md`)
      : '')
  : path.join(contextDir, 'briefs', `${branchSafe}-latest.md`);
const handoffPath = workSafe
  ? (fs.existsSync(path.join(contextDir, 'handoffs', `${workSafe}.md`))
      ? path.join(contextDir, 'handoffs', `${workSafe}.md`)
      : '')
  : path.join(contextDir, 'handoffs', `${branchSafe}-latest.md`);
const memoryPath = firstExistingPath(mementoDirs.map((dir) => path.join(dir, 'memories', agent, 'MEMORY.md')));
const branchRelayPath = freshestExistingPath(mementoDirs.map((dir) => path.join(dir, 'runtime', 'wtd', 'relay', `${branchSafe}-latest.md`)));
const latestRelayPath = branchRelayPath || freshestExistingPath(
  mementoDirs.map((dir) => latestMarkdownFile(path.join(dir, 'runtime', 'wtd', 'handoff-inbox'))).filter(Boolean),
);

const payload = {
  repoRoot: rootDir,
  branch,
  workId: workId || null,
  agent,
  files: {
    checkpoint: fs.existsSync(checkpointPath) ? path.relative(rootDir, checkpointPath) : null,
    brief: fs.existsSync(briefPath) ? path.relative(rootDir, briefPath) : null,
    handoff: fs.existsSync(handoffPath) ? path.relative(rootDir, handoffPath) : null,
    memory: fs.existsSync(memoryPath) ? path.relative(rootDir, memoryPath) : null,
    latestRelay: latestRelayPath ? path.relative(rootDir, latestRelayPath) : null,
  },
  excerpts: {
    checkpoint: clipText(readText(checkpointPath), 40, 4000),
    brief: clipText(readText(briefPath), 56, 5500),
    handoff: clipText(readText(handoffPath), 56, 5500),
    memory: clipText(readText(memoryPath), 48, 4500),
    latestRelay: clipText(readText(latestRelayPath), 48, 4500),
  },
};

if (asJson) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(0);
}

const lines = [
  '# Memento Resume Bundle',
  '',
  `- Repo root: \`${payload.repoRoot}\``,
  `- Branch: \`${payload.branch}\``,
  `- Work ID: \`${payload.workId ?? 'none'}\``,
  `- Agent memory: \`${payload.agent}\``,
  '',
  '## Source Files',
  '',
  `- Checkpoint: \`${payload.files.checkpoint ?? 'missing'}\``,
  `- Brief: \`${payload.files.brief ?? 'missing'}\``,
  `- Handoff: \`${payload.files.handoff ?? 'missing'}\``,
  `- Shared memory: \`${payload.files.memory ?? 'missing'}\``,
  `- Latest relay: \`${payload.files.latestRelay ?? 'missing'}\``,
  '',
  '## Checkpoint',
  '',
  payload.excerpts.checkpoint,
  '',
  '## Brief',
  '',
  payload.excerpts.brief,
  '',
  '## Handoff',
  '',
  payload.excerpts.handoff,
  '',
  '## Shared Memory',
  '',
  payload.excerpts.memory,
  '',
  '## Latest Relay',
  '',
  payload.excerpts.latestRelay,
  '',
];

process.stdout.write(`${lines.join('\n')}\n`);
