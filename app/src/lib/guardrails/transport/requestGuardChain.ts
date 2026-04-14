import type { GuardrailResult } from '$lib/guardrails/core/types';
import { mergeGuardrailResults } from '$lib/guardrails/core/policy';

export interface RequestGuardContext {
  request: Request;
  ip: string;
}

export type RequestGuardStep = (context: RequestGuardContext) => Promise<GuardrailResult> | GuardrailResult;

export async function runRequestGuardChain(
  context: RequestGuardContext,
  steps: RequestGuardStep[],
): Promise<GuardrailResult> {
  const results: GuardrailResult[] = [];

  for (const step of steps) {
    const result = await step(context);
    results.push(result);
    if (result.decision === 'deny') break;
  }

  return mergeGuardrailResults(results);
}

