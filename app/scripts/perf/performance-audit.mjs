import fs from 'fs/promises';
import path from 'path';

function parseArgs(argv) {
  const parsed = {
    strict: false,
    json: false,
    profile: '',
    summaryPaths: [],
    budgetPath: path.resolve('scripts/perf/perf-budget.json'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--strict') {
      parsed.strict = true;
      continue;
    }
    if (token === '--json') {
      parsed.json = true;
      continue;
    }
    if (token === '--profile') {
      parsed.profile = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (token === '--summary') {
      parsed.summaryPaths.push(path.resolve(argv[index + 1] ?? ''));
      index += 1;
      continue;
    }
    if (token === '--budget') {
      parsed.budgetPath = path.resolve(argv[index + 1] ?? parsed.budgetPath);
      index += 1;
    }
  }

  const envSummaries = (process.env.PERFORMANCE_AUDIT_SUMMARIES ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
  parsed.summaryPaths.push(...envSummaries);
  parsed.summaryPaths = Array.from(new Set(parsed.summaryPaths));
  return parsed;
}

function isProductionRuntime() {
  const environment = (process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
  return environment === 'production' || Boolean((process.env.VERCEL ?? process.env.K_SERVICE ?? '').trim());
}

function printLines(lines) {
  for (const line of lines) {
    console.log(line);
  }
}

function readMetricValue(summary, metricKey) {
  const [metricName, statName] = metricKey.split('.');
  const metric = summary?.metrics?.[metricName];
  if (!metric || typeof metric !== 'object') return null;
  const values = metric.values;
  if (!values || typeof values !== 'object') return null;
  const value = values[statName];
  return Number.isFinite(value) ? Number(value) : null;
}

function detectObservedVus(summary) {
  const direct =
    summary?.state?.vus?.max ??
    summary?.options?.vus ??
    summary?.options?.scenarios?.default?.vus ??
    summary?.options?.scenarios?.auth_and_snapshot?.stages?.reduce?.((max, stage) => Math.max(max, Number(stage.target ?? 0)), 0);
  return Number.isFinite(direct) ? Number(direct) : null;
}

function evaluateSummary(profileName, profileBudget, summary, summaryPath, findings) {
  for (const [metricKey, rule] of Object.entries(profileBudget.metrics ?? {})) {
    const value = readMetricValue(summary, metricKey);
    if (value == null) {
      findings.push({
        severity: 'medium',
        code: 'perf.metric_missing',
        profile: profileName,
        summary: summaryPath,
        message: `${metricKey} is missing from ${path.basename(summaryPath)}.`,
      });
      continue;
    }
    if (rule.max != null && value > Number(rule.max)) {
      findings.push({
        severity: rule.severity ?? 'high',
        code: 'perf.metric_budget_exceeded',
        profile: profileName,
        summary: summaryPath,
        message: `${metricKey}=${value} exceeded max budget ${rule.max} for ${profileName}.`,
      });
    }
    if (rule.min != null && value < Number(rule.min)) {
      findings.push({
        severity: rule.severity ?? 'high',
        code: 'perf.metric_budget_missed',
        profile: profileName,
        summary: summaryPath,
        message: `${metricKey}=${value} was below minimum budget ${rule.min} for ${profileName}.`,
      });
    }
  }

  if (profileBudget.targetVus != null) {
    const observedVus = detectObservedVus(summary);
    if (observedVus == null) {
      findings.push({
        severity: 'medium',
        code: 'perf.target_vus_unknown',
        profile: profileName,
        summary: summaryPath,
        message: `Could not verify observed VUs for ${profileName}; expected at least ${profileBudget.targetVus}.`,
      });
    } else if (observedVus < Number(profileBudget.targetVus)) {
      findings.push({
        severity: 'high',
        code: 'perf.target_vus_not_reached',
        profile: profileName,
        summary: summaryPath,
        message: `Observed VUs ${observedVus} did not reach the ${profileBudget.targetVus} target for ${profileName}.`,
      });
    }
  }
}

function evaluateRuntimePosture(budget, findings) {
  if (!isProductionRuntime()) return;
  for (const rule of budget?.runtime?.production?.findings ?? []) {
    let triggered = false;

    if (Array.isArray(rule.envAny) && rule.envAny.length > 0) {
      triggered = !rule.envAny.some((name) => (process.env[name] ?? '').trim());
    }
    if (!triggered && rule.envEquals && typeof rule.envEquals === 'object') {
      triggered = Object.entries(rule.envEquals).every(
        ([name, expected]) => (process.env[name] ?? '').trim().toLowerCase() === String(expected).trim().toLowerCase(),
      );
    }

    if (triggered) {
      findings.push({
        severity: rule.severity ?? 'high',
        code: rule.code,
        message: rule.message,
      });
    }
  }
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const budget = await loadJson(args.budgetPath);
  const profiles = budget.profiles ?? {};
  const selectedProfile = args.profile.trim();
  const findings = [];
  const summaries = [];

  evaluateRuntimePosture(budget, findings);

  if (selectedProfile) {
    const profileBudget = profiles[selectedProfile];
    if (!profileBudget) {
      throw new Error(`Unknown profile "${selectedProfile}"`);
    }
    if (profileBudget.requireSummary && args.summaryPaths.length === 0) {
      findings.push({
        severity: args.strict ? 'high' : 'medium',
        code: 'perf.summary_missing',
        profile: selectedProfile,
        message: `Profile ${selectedProfile} requires at least one k6 summary export.`,
      });
    }
    for (const summaryPath of args.summaryPaths) {
      const summary = await loadJson(summaryPath);
      summaries.push({ path: summaryPath, summary });
      evaluateSummary(selectedProfile, profileBudget, summary, summaryPath, findings);
    }
  }

  const report = {
    profile: selectedProfile || null,
    productionRuntime: isProductionRuntime(),
    summaries: summaries.map((entry) => entry.path),
    findings,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const lines = [
      `Profile: ${report.profile ?? 'runtime-posture-only'}`,
      `Production runtime: ${report.productionRuntime ? 'yes' : 'no'}`,
      `Summaries: ${report.summaries.length}`,
      `Findings: ${report.findings.length}`,
    ];
    printLines(lines);
    if (findings.length > 0) {
      console.log('');
      for (const finding of findings) {
        const profileLabel = finding.profile ? ` [${finding.profile}]` : '';
        const summaryLabel = finding.summary ? ` (${path.basename(finding.summary)})` : '';
        console.log(`- ${finding.severity.toUpperCase()} ${finding.code}${profileLabel}${summaryLabel}: ${finding.message}`);
      }
    }
  }

  const failingFindings = findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high');
  if (args.strict && failingFindings.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`[performance-audit] ${error.message}`);
  process.exitCode = 1;
});
