#!/usr/bin/env node
import { currentBranch } from './coordination-lib.mjs';
import { collectContracts, repoRoot, shouldRequireContract } from './task-contract-lib.mjs';

function parseArgs(argv) {
  const output = { mode: 'default' };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--mode') output.mode = argv[++index] ?? 'default';
    else if (current === '-h' || current === '--help') {
      process.stdout.write('Usage: node scripts/dev/check-task-contracts.mjs [--mode stop]\n');
      process.exit(0);
    } else {
      throw new Error(`[task-contract-check] unknown option: ${current}`);
    }
  }
  return output;
}

const { mode } = parseArgs(process.argv.slice(2));
const allowIncomplete = process.env.CTX_ALLOW_INCOMPLETE_CONTRACT === '1';
const rootDir = repoRoot();
const branch = currentBranch(rootDir);
const { contracts, active } = collectContracts(rootDir);
const branchContracts = active.filter((item) => item.branch === branch);
const issues = [];

if (shouldRequireContract(rootDir) && branchContracts.length === 0) {
  issues.push(`feature branch \`${branch}\` has no active task contract`);
}

for (const contract of branchContracts) {
  if (contract.warnings.length > 0) {
    issues.push(`contract \`${contract.relPath}\` is incomplete as a spec: ${contract.warnings.join('; ')}`);
  }
  if (mode === 'stop' && contracts.blockStopOnIncomplete && !allowIncomplete && !contract.complete) {
    issues.push(`contract \`${contract.relPath}\` is not complete (${contract.finishDone}/${contract.finishTotal} finish items checked)`);
  }
}

if (issues.length > 0) {
  for (const issue of issues) {
    process.stderr.write(`[task-contract-check] ${issue}\n`);
  }
  process.exit(1);
}

process.stdout.write(`[task-contract-check] ok for branch ${branch}\n`);
