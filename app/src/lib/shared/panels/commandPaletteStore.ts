import { writable } from 'svelte/store';

/** Global open/close state for the CommandPalette (⌘K). */
export const commandPaletteOpen = writable(false);
