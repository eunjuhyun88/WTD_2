#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function usage() {
  console.log('Usage: node scripts/dev/memento-relay.mjs [--branch <name>] [--work-id <id>] [--agent <name>] [--summary <text>]');
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

function clipText(text, maxLines = 72, maxChars = 8000) {
  if (!text) return '_missing_';
  const clippedLines = text.split('\n').slice(0, maxLines).join('\n');
  if (clippedLines.length <= maxChars && text.split('\n').length <= maxLines) {
    return clippedLines;
  }
  return `${clippedLines.slice(0, maxChars)}\n\n…truncated…`;
}

function firstExistingPath(paths) {
  return paths.find((candidate) => fs.existsSync(candidate)) ?? '';
}

function writableRelayRoots(rootDir) {
  const candidates = [
    path.resolve(rootDir, '..', '.memento'),
    path.join(rootDir, '.agent-context', 'memento'),
  ];
  const writable = [];

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      const probePath = path.join(candidate, '.write-test');
      fs.writeFileSync(probePath, 'ok\n');
      fs.rmSync(probePath, { force: true });
      writable.push(candidate);
    } catch {
      // Ignore unwritable relay roots and fall back to the repo-local mirror.
    }
  }

  return [...new Set(writable)];
}

const args = process.argv.slice(2);
let branch = '';
let workId = '';
let agent = process.env.MEMENTO_AGENT || 'implementer-ui';
let summary = 'branch relay payload';

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
  } else if (current === '--summary') {
    summary = args[index + 1] ?? summary;
    index += 1;
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
const head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const createdAt = new Date().toISOString();
const contextDir = path.join(rootDir, '.agent-context');
const writableRoots = writableRelayRoots(rootDir);

if (writableRoots.length === 0) {
  throw new Error('[memento:relay] no writable memento runtime directory available');
}

const mementoRoots = [path.resolve(rootDir, '..', '.memento'), ...writableRoots];
const runtimeName = 'stockclaw';

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
const memoryPath = firstExistingPath(mementoRoots.map((dir) => path.join(dir, 'memories', agent, 'MEMORY.md')));

const relayPayload = {
  createdAt,
  repoRoot: rootDir,
  branch,
  head,
  workId: workId || null,
  agent,
  summary,
  sourceFiles: {
    checkpoint: fs.existsSync(checkpointPath) ? path.relative(rootDir, checkpointPath) : null,
    brief: fs.existsSync(briefPath) ? path.relative(rootDir, briefPath) : null,
    handoff: fs.existsSync(handoffPath) ? path.relative(rootDir, handoffPath) : null,
    memory: fs.existsSync(memoryPath) ? path.relative(path.resolve(rootDir, '..'), memoryPath) : null,
  },
  snippets: {
    checkpoint: clipText(readText(checkpointPath), 56, 7000),
    brief: clipText(readText(briefPath), 80, 9000),
    handoff: clipText(readText(handoffPath), 80, 9000),
    memory: clipText(readText(memoryPath), 48, 5000),
  },
};

const stamp = createdAt.replace(/[:.]/g, '-');
const baseName = `${stamp}-${branchSafe}-${sanitize(agent)}`;
const writtenPaths = [];
const relayJson = `${JSON.stringify(relayPayload, null, 2)}\n`;

const markdown = [
  '# Memento Relay Payload',
  '',
  `- Created at: \`${createdAt}\``,
  `- Branch: \`${branch}\``,
  `- Head: \`${head}\``,
  `- Work ID: \`${workId || 'none'}\``,
  `- Agent: \`${agent}\``,
  '',
  '## Summary',
  '',
  summary,
  '',
  '## Source Files',
  '',
  `- Checkpoint: \`${relayPayload.sourceFiles.checkpoint ?? 'missing'}\``,
  `- Brief: \`${relayPayload.sourceFiles.brief ?? 'missing'}\``,
  `- Handoff: \`${relayPayload.sourceFiles.handoff ?? 'missing'}\``,
  `- Shared memory: \`${relayPayload.sourceFiles.memory ?? 'missing'}\``,
  '',
  '## Checkpoint Snapshot',
  '',
  relayPayload.snippets.checkpoint,
  '',
  '## Brief Snapshot',
  '',
  relayPayload.snippets.brief,
  '',
  '## Handoff Snapshot',
  '',
  relayPayload.snippets.handoff,
  '',
  '## Shared Memory Snapshot',
  '',
  relayPayload.snippets.memory,
  '',
];

for (const mementoDir of writableRoots) {
  const runtimeDir = path.join(mementoDir, 'runtime', runtimeName);
  const inboxDir = path.join(runtimeDir, 'handoff-inbox');
  const relayDir = path.join(runtimeDir, 'relay');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.mkdirSync(relayDir, { recursive: true });

  const inboxJsonPath = path.join(inboxDir, `${baseName}.json`);
  const inboxMdPath = path.join(inboxDir, `${baseName}.md`);
  const latestJsonPath = path.join(relayDir, `${branchSafe}-latest.json`);
  const latestMdPath = path.join(relayDir, `${branchSafe}-latest.md`);

  fs.writeFileSync(inboxJsonPath, relayJson);
  fs.writeFileSync(inboxMdPath, `${markdown.join('\n')}\n`);
  fs.copyFileSync(inboxJsonPath, latestJsonPath);
  fs.copyFileSync(inboxMdPath, latestMdPath);
  writtenPaths.push({
    inboxJsonPath,
    inboxMdPath,
    latestJsonPath,
    latestMdPath,
  });
}

for (const paths of writtenPaths) {
  console.log(`[memento:relay] inbox json: ${path.relative(rootDir, paths.inboxJsonPath)}`);
  console.log(`[memento:relay] inbox md: ${path.relative(rootDir, paths.inboxMdPath)}`);
  console.log(`[memento:relay] latest json: ${path.relative(rootDir, paths.latestJsonPath)}`);
  console.log(`[memento:relay] latest md: ${path.relative(rootDir, paths.latestMdPath)}`);
}
