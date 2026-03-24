#!/usr/bin/env node
import {
  loadConfig,
  normalizeRepoPath,
  resolveRootDir,
} from './coordination-lib.mjs';
import {
  VALID_WORK_STATUSES,
  orchestrationConfig,
  upsertWorkItem,
} from './orchestration-lib.mjs';

function usage() {
  console.log('Usage: node scripts/dev/orchestrate-work.mjs --work-id <id> [--title <text>] [--surface <surface>] [--summary <text>] [--status <planned|ready|active|blocked|handoff|done|abandoned>] [--priority <p0|p1|p2|p3>] [--agent <name>] [--branch <name>] [--path <prefix>] [--doc <path>] [--output <path>] [--depends-on <id>] [--handoff-to <agent>] [--note <text>]');
}

const rootDir = resolveRootDir();
const config = loadConfig(rootDir);
const orchestration = orchestrationConfig(config);
if (!orchestration.enabled) {
  console.log('[orch:work] orchestration disabled in context-kit.json');
  process.exit(0);
}

const args = process.argv.slice(2);
const options = {
  workId: '',
  title: '',
  surface: '',
  summary: '',
  status: '',
  priority: '',
  agent: process.env.USER || 'agent',
  branch: '',
  handoffTo: '',
  note: '',
  paths: [],
  docs: [],
  outputs: [],
  dependsOn: [],
};

for (let index = 0; index < args.length; index += 1) {
  const current = args[index];
  const next = args[index + 1];
  if (current === '--work-id') {
    options.workId = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--title') {
    options.title = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--surface') {
    options.surface = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--summary') {
    options.summary = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--status') {
    options.status = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--priority') {
    options.priority = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--agent') {
    options.agent = next ?? options.agent;
    index += 1;
    continue;
  }
  if (current === '--branch') {
    options.branch = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--path') {
    options.paths.push(normalizeRepoPath(next ?? ''));
    index += 1;
    continue;
  }
  if (current === '--doc') {
    options.docs.push(normalizeRepoPath(next ?? ''));
    index += 1;
    continue;
  }
  if (current === '--output') {
    options.outputs.push(normalizeRepoPath(next ?? ''));
    index += 1;
    continue;
  }
  if (current === '--depends-on') {
    options.dependsOn.push(next ?? '');
    index += 1;
    continue;
  }
  if (current === '--handoff-to') {
    options.handoffTo = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--note') {
    options.note = next ?? '';
    index += 1;
    continue;
  }
  if (current === '-h' || current === '--help') {
    usage();
    process.exit(0);
  }
  throw new Error(`[orch:work] unknown option: ${current}`);
}

if (!options.workId) {
  usage();
  process.exit(1);
}
if (options.status && !VALID_WORK_STATUSES.includes(options.status)) {
  throw new Error(`[orch:work] invalid status: ${options.status}`);
}

const item = upsertWorkItem(rootDir, options, { config });
console.log(`[orch:work] saved: ${item.workId}`);
console.log(`[orch:work] status: ${item.status}`);
if (item.surface) {
  console.log(`[orch:work] surface: ${item.surface}`);
}
