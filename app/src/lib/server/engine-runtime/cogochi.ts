import { assertRemoteImplemented, getEngineRuntimeMode } from './config';
import { computeServerSignalSnapshot as computeLocalSignalSnapshot } from './local/cogochi';

export function computeServerSignalSnapshot(
  ...args: Parameters<typeof computeLocalSignalSnapshot>
): ReturnType<typeof computeLocalSignalSnapshot> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return computeLocalSignalSnapshot(...args);
    case 'remote':
      return assertRemoteImplemented('cogochi-signal-snapshot');
  }
}
