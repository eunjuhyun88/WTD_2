import { assertRemoteImplemented, getEngineRuntimeMode } from './config';
import {
  buildAnalysisContext as buildLocalAnalysisContext,
  buildDouniSystemPrompt as buildLocalDouniSystemPrompt,
} from './local/douni';

export function buildDouniSystemPrompt(
  ...args: Parameters<typeof buildLocalDouniSystemPrompt>
): ReturnType<typeof buildLocalDouniSystemPrompt> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return buildLocalDouniSystemPrompt(...args);
    case 'remote':
      return assertRemoteImplemented('douni-personality');
  }
}

export function buildAnalysisContext(
  ...args: Parameters<typeof buildLocalAnalysisContext>
): ReturnType<typeof buildLocalAnalysisContext> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return buildLocalAnalysisContext(...args);
    case 'remote':
      return assertRemoteImplemented('douni-personality');
  }
}
