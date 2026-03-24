#!/usr/bin/env node
import { currentBranch, loadConfig, resolveRootDir } from './coordination-lib.mjs';
import {
  orchestrationConfig,
  readWorkItems,
  resolveDependencyState,
} from './orchestration-lib.mjs';

const rootDir = resolveRootDir();
const config = loadConfig(rootDir);
const orchestration = orchestrationConfig(config);
if (!orchestration.enabled) {
  console.log('[orch:list] orchestration disabled in context-kit.json');
  process.exit(0);
}

const currentOnly = process.argv.includes('--current-branch');
const json = process.argv.includes('--json');
const readyOnly = process.argv.includes('--ready-only');
let statusFilter = '';
let surfaceFilter = '';
let agentFilter = '';

for (let index = 2; index < process.argv.length; index += 1) {
  const current = process.argv[index];
  const next = process.argv[index + 1];
  if (current === '--status') {
    statusFilter = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--surface') {
    surfaceFilter = next ?? '';
    index += 1;
    continue;
  }
  if (current === '--agent') {
    agentFilter = next ?? '';
    index += 1;
    continue;
  }
}

const branch = currentBranch(rootDir);
const itemsSource = readWorkItems(rootDir, config);
const items = itemsSource
  .map((item) => ({
    ...item,
    ...resolveDependencyState(item, itemsSource, orchestration),
  }))
  .filter((item) => !currentOnly || item.branch === branch)
  .filter((item) => !statusFilter || item.status === statusFilter)
  .filter((item) => !surfaceFilter || item.surface === surfaceFilter)
  .filter((item) => !agentFilter || item.agent === agentFilter)
  .filter((item) => !readyOnly || item.readyNow);

if (json) {
  console.log(JSON.stringify({
    currentBranch: branch,
    readyOnly,
    items,
  }, null, 2));
  process.exit(0);
}

if (items.length === 0) {
  console.log('[orch:list] no work items');
  process.exit(0);
}

console.log('work_id\tstatus\tsurface\tagent\tbranch\tready_now\topen_dependencies');
for (const item of items) {
  console.log([
    item.workId,
    item.status,
    item.surface || '-',
    item.agent || '-',
    item.branch || '-',
    item.readyNow ? 'yes' : 'no',
    item.openDependencies.join(',') || '-',
  ].join('\t'));
}
