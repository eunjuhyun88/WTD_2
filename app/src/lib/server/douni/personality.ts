import {
  buildAnalysisContext as buildRuntimeAnalysisContext,
  buildDouniSystemPrompt as buildRuntimeDouniSystemPrompt,
} from '$lib/server/engine-runtime/douni';
import type {
  BuildDouniPromptOptions,
  DouniArchetype,
  DouniProfile,
  SignalSnapshot,
} from '$lib/contracts/cogochi';

export type { BuildDouniPromptOptions, DouniProfile } from '$lib/contracts/cogochi';

export function buildDouniSystemPrompt(
  profile: DouniProfile,
  opts: BuildDouniPromptOptions = {},
): string {
  return buildRuntimeDouniSystemPrompt(profile, opts);
}

export function buildAnalysisContext(
  snapshot: SignalSnapshot,
  archetype: DouniArchetype,
): string {
  return buildRuntimeAnalysisContext(snapshot, archetype);
}
