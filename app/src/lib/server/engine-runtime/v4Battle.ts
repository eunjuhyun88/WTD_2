import {
  createDefaultSquad as createLocalDefaultSquad,
  runFullBattle as runLocalFullBattle,
} from './local/v4Battle';
import { assertRemoteImplemented, getEngineRuntimeMode } from './config';

export async function runFullBattle(
  ...args: Parameters<typeof runLocalFullBattle>
): ReturnType<typeof runLocalFullBattle> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return runLocalFullBattle(...args);
    case 'remote':
      return assertRemoteImplemented('v4-battle');
  }
}

export function createDefaultSquad(
  ...args: Parameters<typeof createLocalDefaultSquad>
): ReturnType<typeof createLocalDefaultSquad> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return createLocalDefaultSquad(...args);
    case 'remote':
      return assertRemoteImplemented('v4-battle');
  }
}
