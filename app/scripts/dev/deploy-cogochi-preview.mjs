#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

function usage() {
  console.log(
    [
      'Usage: node app/scripts/dev/deploy-cogochi-preview.mjs [options]',
      '',
      'Options:',
      '  --repo-root <path>   Git worktree root to deploy (default: current git root)',
      '  --deployment-url <url>  Reuse an existing ready preview deployment instead of creating one',
      '  --alias <domain>     Alias the ready preview deployment to a custom domain',
      '  --allowed-hosts <csv>  Override SECURITY_ALLOWED_HOSTS for the preview deployment',
      '  --engine-service <name>  Cloud Run service used to resolve engine runtime secrets (default: cogotchi)',
      '  --engine-region <region> Cloud Run region used to resolve engine runtime secrets (default: us-east4)',
      '  --force              Force a fresh Vercel preview deployment',
      '  --keep-stage         Keep the staged deploy directory after success',
      '  --dry-run            Stage files and print the deploy plan without calling Vercel',
    ].join('\n'),
  );
}

function fail(message) {
  console.error(`[deploy:cogochi] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'pipe',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function ensureOk(result, context) {
  if (result.status === 0) return;
  const stderr = result.stderr?.trim();
  const stdout = result.stdout?.trim();
  if (stderr) process.stderr.write(`${stderr}\n`);
  if (stdout) process.stdout.write(`${stdout}\n`);
  fail(`${context} failed with exit code ${result.status ?? 1}`);
}

function parseJsonOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split('\n').reverse();
    for (const line of lines) {
      const candidate = line.trim();
      if (!candidate.startsWith('{')) continue;
      try {
        return JSON.parse(candidate);
      } catch {
        continue;
      }
    }
    return null;
  }
}

function removeStage(stageRoot) {
  fs.rmSync(stageRoot, { recursive: true, force: true });
}

function parseEnvFile(filePath) {
  const envLike = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    envLike[key] = value;
  }
  return envLike;
}

function pullBranchPreviewEnv(cwd, branch) {
  const tempFile = path.join(os.tmpdir(), `wtd-vercel-preview-${process.pid}-${Date.now()}.env`);
  try {
    const pullResult = run(
      'vercel',
      ['env', 'pull', tempFile, '--environment=preview', `--git-branch=${branch}`, '--yes'],
      { cwd },
    );
    ensureOk(pullResult, `vercel env pull preview --git-branch=${branch}`);
    return parseEnvFile(tempFile);
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
}

function normalizeHost(raw) {
  if (!raw) return '';
  let value = raw.trim();
  if (!value) return '';
  if (value.includes('://')) {
    try {
      value = new URL(value).host;
    } catch {
      // ignore parse error and keep the raw host-like value
    }
  }
  return value.replace(/:\d+$/, '').replace(/\.$/, '').toLowerCase();
}

function mergeAllowedHosts(...sources) {
  const merged = new Set();
  for (const source of sources) {
    if (!source) continue;
    for (const part of source.split(',')) {
      const host = normalizeHost(part);
      if (host) merged.add(host);
    }
  }
  return Array.from(merged).join(',');
}

function tryDescribeCloudRunService(cwd, service, region) {
  const result = run(
    'gcloud',
    ['run', 'services', 'describe', service, `--region=${region}`, '--format=json'],
    { cwd },
  );
  if (result.status !== 0) {
    return null;
  }
  try {
    const payload = JSON.parse(result.stdout ?? '{}');
    const envEntries = payload?.spec?.template?.spec?.containers?.[0]?.env ?? [];
    const envMap = Object.fromEntries(
      envEntries
        .filter((entry) => typeof entry?.name === 'string' && typeof entry?.value === 'string')
        .map((entry) => [entry.name, entry.value]),
    );
    return {
      engineUrl: payload?.status?.url?.trim?.() || '',
      engineInternalSecret: envMap.ENGINE_INTERNAL_SECRET?.trim?.() || '',
    };
  } catch {
    return null;
  }
}

function resolveRuntimeEnv({
  aliasDomain,
  allowedHostsOverride,
  cloudRunRuntime,
  previewEnv,
}) {
  const engineUrl =
    process.env.ENGINE_URL?.trim() ||
    previewEnv.ENGINE_URL?.trim() ||
    cloudRunRuntime?.engineUrl ||
    '';
  const engineInternalSecret =
    process.env.ENGINE_INTERNAL_SECRET?.trim() ||
    cloudRunRuntime?.engineInternalSecret ||
    '';
  const allowedHosts = mergeAllowedHosts(
    process.env.SECURITY_ALLOWED_HOSTS?.trim() || '',
    allowedHostsOverride,
    previewEnv.SECURITY_ALLOWED_HOSTS?.trim() || '',
    aliasDomain,
  );

  return {
    ENGINE_URL: engineUrl,
    ENGINE_INTERNAL_SECRET: engineInternalSecret,
    SECURITY_ALLOWED_HOSTS: allowedHosts,
  };
}

function extractDeploymentUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.url === 'string' && payload.url) return payload.url;
  if (payload.deployment && typeof payload.deployment === 'object' && typeof payload.deployment.url === 'string') {
    return payload.deployment.url;
  }
  return '';
}

function main() {
  const args = process.argv.slice(2);
  let aliasDomain = '';
  let allowedHostsOverride = '';
  let existingDeploymentUrl = '';
  let explicitRepoRoot = '';
  let engineRegion = 'us-east4';
  let engineService = 'cogotchi';
  let force = false;
  let keepStage = false;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];
    if (current === '--alias') {
      aliasDomain = next ?? '';
      index += 1;
      continue;
    }
    if (current === '--repo-root') {
      explicitRepoRoot = next ?? '';
      index += 1;
      continue;
    }
    if (current === '--allowed-hosts') {
      allowedHostsOverride = next ?? '';
      index += 1;
      continue;
    }
    if (current === '--engine-region') {
      engineRegion = next ?? '';
      index += 1;
      continue;
    }
    if (current === '--engine-service') {
      engineService = next ?? '';
      index += 1;
      continue;
    }
    if (current === '--deployment-url') {
      existingDeploymentUrl = next ?? '';
      index += 1;
      continue;
    }
    if (current === '--force') {
      force = true;
      continue;
    }
    if (current === '--keep-stage') {
      keepStage = true;
      continue;
    }
    if (current === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (current === '-h' || current === '--help') {
      usage();
      process.exit(0);
    }
    fail(`unknown option: ${current}`);
  }

  const defaultRepoRoot = run('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
  });
  ensureOk(defaultRepoRoot, 'git rev-parse --show-toplevel');

  const repoRoot = explicitRepoRoot
    ? path.resolve(explicitRepoRoot)
    : defaultRepoRoot.stdout.trim();
  const appRoot = path.join(repoRoot, 'app');
  const linkedProjectPath = path.join(appRoot, '.vercel', 'project.json');

  if (!fs.existsSync(linkedProjectPath)) {
    fail(`missing linked Vercel project file: ${linkedProjectPath}`);
  }
  if (!fs.existsSync(path.join(appRoot, 'vercel.json'))) {
    fail(`missing app/vercel.json under ${repoRoot}`);
  }

  const branchResult = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoRoot,
  });
  ensureOk(branchResult, 'git rev-parse --abbrev-ref HEAD');
  const branch = branchResult.stdout.trim();

  const stageRoot = path.join(repoRoot, '.tmp', 'vercel-cogochi2-preview');
  const stagedAppRoot = path.join(stageRoot, 'app');
  console.log(`[deploy:cogochi] repo root: ${repoRoot}`);
  console.log(`[deploy:cogochi] branch: ${branch}`);
  let deploymentUrl = existingDeploymentUrl.trim();

  if (!deploymentUrl) {
    removeStage(stageRoot);
    fs.mkdirSync(path.join(stageRoot, '.vercel'), { recursive: true });

    fs.copyFileSync(linkedProjectPath, path.join(stageRoot, '.vercel', 'project.json'));

    const rsyncArgs = [
      '-a',
      '--delete',
      '--exclude',
      '.vercel',
      '--exclude',
      'node_modules',
      '--exclude',
      '.svelte-kit',
      '--exclude',
      '.vercel/output',
      '--exclude',
      'build',
      '--exclude',
      '.env',
      '--exclude',
      '.env.*',
      `${appRoot}/`,
      `${stagedAppRoot}/`,
    ];
    const rsyncResult = run('rsync', rsyncArgs, { cwd: repoRoot });
    ensureOk(rsyncResult, 'rsync app/ -> stageRoot/app');

    console.log(`[deploy:cogochi] stage root: ${stageRoot}`);

    if (dryRun) {
      console.log('[deploy:cogochi] dry run complete');
      if (!keepStage) {
        removeStage(stageRoot);
      }
      return;
    }

    const deployArgs = ['deploy', '--yes', '--target', 'preview', '--archive=tgz', '--format=json'];
    if (force) {
      deployArgs.push('--force');
    }

    const previewEnv = pullBranchPreviewEnv(stageRoot, branch);
    const cloudRunRuntime = tryDescribeCloudRunService(repoRoot, engineService, engineRegion);
    const runtimeEnv = resolveRuntimeEnv({
      aliasDomain,
      allowedHostsOverride,
      cloudRunRuntime,
      previewEnv,
    });

    console.log(
      `[deploy:cogochi] runtime env sources: ENGINE_URL=${
        process.env.ENGINE_URL?.trim()
          ? 'process'
          : previewEnv.ENGINE_URL?.trim()
            ? 'preview-env'
            : cloudRunRuntime?.engineUrl
              ? 'cloud-run'
              : 'missing'
      }, ENGINE_INTERNAL_SECRET=${
        process.env.ENGINE_INTERNAL_SECRET?.trim()
          ? 'process'
          : cloudRunRuntime?.engineInternalSecret
            ? 'cloud-run'
            : 'missing'
      }, SECURITY_ALLOWED_HOSTS=${
        process.env.SECURITY_ALLOWED_HOSTS?.trim()
          ? 'process'
          : allowedHostsOverride
            ? 'flag'
            : previewEnv.SECURITY_ALLOWED_HOSTS?.trim()
              ? 'preview-env'
              : aliasDomain
                ? 'alias'
                : 'missing'
      }`,
    );

    for (const key of ['ENGINE_URL', 'ENGINE_INTERNAL_SECRET', 'SECURITY_ALLOWED_HOSTS']) {
      const value = runtimeEnv[key]?.trim() ?? '';
      if (!value) {
        console.error(`[deploy:cogochi] missing required preview env: ${key}`);
        console.error(`[deploy:cogochi] stage root kept for debugging: ${stageRoot}`);
        fail(`cannot deploy without ${key}`);
      }
      deployArgs.push('-e', `${key}=${value}`);
    }

    const deployResult = run('vercel', deployArgs, { cwd: stageRoot });
    const deployJson = parseJsonOutput(deployResult.stdout ?? '');
    deploymentUrl = extractDeploymentUrl(deployJson);
    if (deployResult.status !== 0 || !deploymentUrl) {
      if (deployResult.stderr?.trim()) process.stderr.write(`${deployResult.stderr.trim()}\n`);
      if (deployResult.stdout?.trim()) process.stdout.write(`${deployResult.stdout.trim()}\n`);
      console.error(`[deploy:cogochi] stage root kept for debugging: ${stageRoot}`);
      fail('vercel preview deploy did not return a deployment URL');
    }
  } else {
    console.log('[deploy:cogochi] reusing existing deployment URL');
  }

  deploymentUrl = deploymentUrl.replace(/^https?:\/\//, '');
  console.log(`[deploy:cogochi] preview url: https://${deploymentUrl}`);

  if (aliasDomain) {
    const aliasResult = run('vercel', ['alias', 'set', deploymentUrl, aliasDomain], {
      cwd: fs.existsSync(stageRoot) ? stageRoot : repoRoot,
    });
    ensureOk(aliasResult, `vercel alias set ${deploymentUrl} ${aliasDomain}`);
    if (aliasResult.stdout?.trim()) {
      process.stdout.write(`${aliasResult.stdout.trim()}\n`);
    }
  }

  if (!keepStage) {
    removeStage(stageRoot);
  }
}

main();
