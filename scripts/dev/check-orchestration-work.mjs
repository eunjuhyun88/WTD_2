#!/usr/bin/env node
import { loadConfig, readClaims, resolveRootDir } from './coordination-lib.mjs';
import {
  collectOrchestrationIssues,
  orchestrationConfig,
  readWorkItems,
  renderOrchestrationArtifacts,
} from './orchestration-lib.mjs';

const rootDir = resolveRootDir();
const config = loadConfig(rootDir);
const orchestration = orchestrationConfig(config);
if (!orchestration.enabled) {
  console.log('[orch:check] orchestration disabled in context-kit.json');
  process.exit(0);
}

const items = readWorkItems(rootDir, config);
const claims = readClaims(rootDir);
const artifacts = renderOrchestrationArtifacts(rootDir, config);
const { failures, warnings } = collectOrchestrationIssues({
  items,
  claims,
  orchestration,
});

for (const warning of warnings) {
  console.log(`[orch:check] warn: ${warning}`);
}

if (failures.length > 0) {
  console.error('[orch:check] failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`[orch:check] ok: ${items.length} work items`);
if (artifacts?.boardPath) {
  console.log(`[orch:check] board: ${artifacts.boardPath.replace(`${rootDir}/`, '')}`);
}
if (artifacts?.summaryPath) {
  console.log(`[orch:check] summary: ${artifacts.summaryPath.replace(`${rootDir}/`, '')}`);
}
