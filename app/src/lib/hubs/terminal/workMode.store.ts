import { writable } from 'svelte/store';
import { trackWorkmodeSwitch } from './telemetry';

export type WorkMode = 'TRADE' | 'TRAIN' | 'FLYWHEEL';

const STORAGE_KEY = 'cogochi.workMode';

function createWorkModeStore() {
  const initial: WorkMode =
    (typeof localStorage !== 'undefined'
      ? (localStorage.getItem(STORAGE_KEY) as WorkMode | null)
      : null) ?? 'TRADE';

  const { subscribe, set, update: _update } = writable<WorkMode>(initial);
  let _current: WorkMode = initial;
  subscribe(v => { _current = v; });

  return {
    subscribe,
    set: (mode: WorkMode) => {
      const prev = _current;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, mode);
      }
      set(mode);
      if (prev !== mode) {
        trackWorkmodeSwitch(prev, mode);
      }
    },
  };
}

export const workMode = createWorkModeStore();
