import {
  buildAnalysisContext as buildEngineAnalysisContext,
  buildDouniSystemPrompt as buildEngineDouniSystemPrompt,
} from '$lib/engine/cogochi/douni/douniPersonality';
import type {
  BuildDouniPromptOptions,
  DouniArchetype,
  DouniProfile,
  SignalSnapshot,
} from '$lib/contracts/cogochi';

export function buildDouniSystemPrompt(
  profile: DouniProfile,
  opts: BuildDouniPromptOptions = {},
): string {
  return buildEngineDouniSystemPrompt(profile as never, opts as never);
}

export function buildAnalysisContext(
  snapshot: SignalSnapshot,
  archetype: DouniArchetype,
): string {
  return buildEngineAnalysisContext(snapshot as never, archetype as never);
}
