import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type TerminalMode = 'observe' | 'analyze' | 'execute';

const STORAGE_KEY = 'wtd_terminal_mode';

function createTerminalModeStore() {
  const initial: TerminalMode = browser
    ? (() => {
        const params = new URLSearchParams(window.location.search);
        const p = params.get('mode') as TerminalMode | null;
        if (p && ['observe', 'analyze', 'execute'].includes(p)) return p;
        return (localStorage.getItem(STORAGE_KEY) as TerminalMode | null) ?? 'analyze';
      })()
    : 'analyze';

  const { subscribe, set, update } = writable<TerminalMode>(initial);

  return {
    subscribe,
    set: (mode: TerminalMode) => {
      if (browser) {
        localStorage.setItem(STORAGE_KEY, mode);
        const url = new URL(window.location.href);
        url.searchParams.set('mode', mode);
        window.history.replaceState({}, '', url);
      }
      set(mode);
    },
    update,
  };
}

export const terminalMode = createTerminalModeStore();
