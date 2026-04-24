import { env } from '$env/dynamic/private';
import type { GuardrailEnforcementMode } from '$lib/guardrails/core/types';
import type { ToolPolicyInput } from '$lib/guardrails/runtime/toolPolicy';
import type { ChannelPolicyInput } from '$lib/guardrails/runtime/channelPolicy';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ALLOWLIST = [
  'analyze_market',
  'check_social',
  'scan_market',
  'check_pattern_status',
  'find_similar_patterns',
  'chart_control',
  'save_pattern',
  'submit_feedback',
  'query_memory',
];

const DEFAULT_REQUIRES_APPROVAL = ['save_pattern', 'submit_feedback'];
const DEFAULT_CHANNEL_ALLOWLIST = ['terminal.douni.tools', 'terminal.intel-shadow.execute'];
const DEFAULT_CHANNEL_REQUIRES_APPROVAL: string[] = [];

interface GuardrailPolicyFile {
  version?: number;
  douni?: {
    toolPolicy?: {
      mode?: string;
      allowlist?: string[];
      denylist?: string[];
      requiresApproval?: string[];
    };
    channelPolicy?: {
      allowlist?: string[];
      denylist?: string[];
      requiresApproval?: string[];
    };
  };
}

let cachedPolicy: GuardrailPolicyFile | null = null;

function readPolicyFile(): GuardrailPolicyFile | null {
  if (cachedPolicy) return cachedPolicy;
  try {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const policyPath = resolve(baseDir, '../../../config/guardrailPolicy.json');
    const raw = readFileSync(policyPath, 'utf8');
    const parsed = JSON.parse(raw) as GuardrailPolicyFile;
    cachedPolicy = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function toMode(value: unknown): GuardrailEnforcementMode {
  return String(value ?? '').trim().toLowerCase() === 'enforce' ? 'enforce' : 'shadow';
}

export function getToolGuardrailMode(): GuardrailEnforcementMode {
  const policy = readPolicyFile();
  const policyMode = policy?.douni?.toolPolicy?.mode;
  const raw = String(process.env.DOUNI_TOOL_GUARDRAIL_MODE ?? env.DOUNI_TOOL_GUARDRAIL_MODE ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'enforce' || raw === 'shadow') return raw;
  return toMode(policyMode);
}

export function getDefaultToolPolicyInput(toolName: string): ToolPolicyInput {
  const policy = readPolicyFile();
  const configured = policy?.douni?.toolPolicy;
  return {
    toolName,
    allowlist: Array.isArray(configured?.allowlist) ? configured.allowlist : DEFAULT_ALLOWLIST,
    denylist: Array.isArray(configured?.denylist) ? configured.denylist : [],
    requiresApproval: Array.isArray(configured?.requiresApproval)
      ? configured.requiresApproval
      : DEFAULT_REQUIRES_APPROVAL,
  };
}

export function getDefaultChannelPolicyInput(channelName: string): ChannelPolicyInput {
  const policy = readPolicyFile();
  const configured = policy?.douni?.channelPolicy;
  return {
    channelName,
    allowlist: Array.isArray(configured?.allowlist) ? configured.allowlist : DEFAULT_CHANNEL_ALLOWLIST,
    denylist: Array.isArray(configured?.denylist) ? configured.denylist : [],
    requiresApproval: Array.isArray(configured?.requiresApproval)
      ? configured.requiresApproval
      : DEFAULT_CHANNEL_REQUIRES_APPROVAL,
  };
}
