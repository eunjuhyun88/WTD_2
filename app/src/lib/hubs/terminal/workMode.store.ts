import { writable } from 'svelte/store';

export type WorkMode = 'TRADE' | 'TRAIN' | 'FLYWHEEL';

const STORAGE_KEY = 'cogochi.workMode';

function createWorkModeStore() {
  const initial: WorkMode =
    (typeof localStorage !== 'undefined'
      ? (localStorage.getItem(STORAGE_KEY) as WorkMode | null)
      : null) ?? 'TRADE';

  const { subscribe, set } = writable<WorkMode>(initial);

  return {
    subscribe,
    set: (mode: WorkMode) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, mode);
      }
      set(mode);
    },
  };
}

export const workMode = createWorkModeStore();
