#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { currentBranch, loadConfig, resolveRootDir, sanitize } from './coordination-lib.mjs';
import { contractConfig, contractPaths } from './task-contract-lib.mjs';

function usage() {
  process.stderr.write('Usage: node scripts/dev/scaffold-task-contract.mjs --id <id> [--title <title>] [--surface <surface>] [--type <type>] [--branch <branch>] [--status <status>] [--goal <goal>] [--force] [--provisional]\n');
}

function parseArgs(argv) {
  const output = {
    id: '',
    title: '',
    surface: '',
    type: '',
    branch: '',
    status: '',
    goal: '',
    force: false,
    provisional: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--id') output.id = argv[++index] ?? '';
    else if (current === '--title') output.title = argv[++index] ?? '';
    else if (current === '--surface') output.surface = argv[++index] ?? '';
    else if (current === '--type') output.type = argv[++index] ?? '';
    else if (current === '--branch') output.branch = argv[++index] ?? '';
    else if (current === '--status') output.status = argv[++index] ?? '';
    else if (current === '--goal') output.goal = argv[++index] ?? '';
    else if (current === '--force') output.force = true;
    else if (current === '--provisional') output.provisional = true;
    else if (current === '-h' || current === '--help') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`[task-contract] unknown option: ${current}`);
    }
  }

  if (!output.id) throw new Error('[task-contract] missing required --id');
  return output;
}

const args = parseArgs(process.argv.slice(2));
const rootDir = resolveRootDir();
const config = loadConfig(rootDir);
const contracts = contractConfig(config);
const paths = contractPaths(rootDir, contracts);
fs.mkdirSync(paths.activeDir, { recursive: true });

const branch = args.branch || currentBranch(rootDir);
const surface = args.surface || config.surfaces?.[0]?.id || 'core';
const type = args.type || contracts.defaultType;
const status = args.status || 'active';
const slug = sanitize(args.id).replace(/\.+/g, '-');
const title = args.title || args.id;
const goal = args.goal || (args.provisional ? `Provisional contract for ${branch}` : `Implement ${title}`);
const filePath = path.join(paths.activeDir, `${slug}.md`);

if (fs.existsSync(filePath) && !args.force) {
  throw new Error(`[task-contract] file already exists: ${path.relative(rootDir, filePath)}`);
}

const lines = [
  `# Task Contract: ${title}`,
  '',
  `- Branch: \`${branch}\``,
  `- Surface: \`${surface}\``,
  `- Type: \`${type}\``,
  `- Status: \`${status}\``,
  `- Provisional: \`${args.provisional ? 'yes' : 'no'}\``,
  '',
  '## Goal',
  '',
  goal,
  '',
  '## Scope',
  '',
  ...(args.provisional ? [
    '- confirm the exact implementation slice for this branch',
    '- replace provisional finish checks with task-specific checks',
  ] : [
    '- replace this line with the chosen implementation slice',
  ]),
  '',
  '## Finish Line',
  '',
  ...(args.provisional ? [
    '- [ ] Replace this provisional contract with task-specific finish checks',
    '- [ ] Verify the chosen implementation path and relevant files',
    '- [ ] Record evidence in `docs/AGENT_WATCH_LOG.md` or generated reports',
  ] : [
    '- [ ] Replace with deterministic completion condition 1',
    '- [ ] Replace with deterministic completion condition 2',
    '- [ ] Record evidence in `docs/AGENT_WATCH_LOG.md` or generated reports',
  ]),
  '',
  '## Evidence',
  '',
  '- commands, tests, screenshots, or harness outputs that prove completion',
  '',
  '## Non-Goals',
  '',
  '- work outside the declared scope',
  '',
];

fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
process.stdout.write(`${path.relative(rootDir, filePath)}\n`);
