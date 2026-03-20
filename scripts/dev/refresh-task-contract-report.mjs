#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { collectContracts, renderTaskContractReport, repoRoot } from './task-contract-lib.mjs';

const rootDir = repoRoot();
const { paths } = collectContracts(rootDir);
const next = renderTaskContractReport(rootDir);
const checkMode = process.argv.includes('--check');

if (checkMode) {
  const current = fs.existsSync(paths.reportPath) ? fs.readFileSync(paths.reportPath, 'utf8') : '';
  if (current !== next) {
    process.stderr.write('[task-contract-report] stale report; run npm run contract:report or npm run docs:refresh\n');
    process.exit(1);
  }
  process.exit(0);
}

fs.mkdirSync(path.dirname(paths.reportPath), { recursive: true });
fs.writeFileSync(paths.reportPath, next);
process.stdout.write(`[task-contract-report] wrote ${paths.reportPath}\n`);
