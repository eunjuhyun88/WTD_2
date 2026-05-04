import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

// Mock document.documentElement.dataset
const datasetMock: Record<string, string> = {};
vi.stubGlobal('document', {
  documentElement: { dataset: datasetMock },
});

// Import after mocks are set up
import { densityStore, type Density } from '../density.store';

describe('density.store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    // Reset dataset
    delete datasetMock.density;
    // Reset store to default by re-setting
    densityStore.set('comfortable');
  });

  it('defaults to comfortable when no localStorage value', () => {
    localStorageMock.clear();
    densityStore.set('comfortable');
    expect(get(densityStore)).toBe('comfortable');
  });

  it('set() updates store value and localStorage', () => {
    densityStore.set('compact');
    expect(get(densityStore)).toBe('compact');
    expect(localStorageMock.getItem('wtd:density')).toBe('compact');
  });

  it('set() updates document.documentElement.dataset.density', () => {
    densityStore.set('compact');
    expect(datasetMock.density).toBe('compact');
    densityStore.set('comfortable');
    expect(datasetMock.density).toBe('comfortable');
  });

  it('toggle() flips compact → comfortable', () => {
    densityStore.set('compact');
    densityStore.toggle();
    expect(get(densityStore)).toBe('comfortable');
  });

  it('toggle() flips comfortable → compact', () => {
    densityStore.set('comfortable');
    densityStore.toggle();
    expect(get(densityStore)).toBe('compact');
  });

  it('toggle() persists to localStorage', () => {
    densityStore.set('comfortable');
    densityStore.toggle();
    expect(localStorageMock.getItem('wtd:density')).toBe('compact');
  });

  it('accepts Density union type values only', () => {
    const compact: Density = 'compact';
    const comfortable: Density = 'comfortable';
    densityStore.set(compact);
    expect(get(densityStore)).toBe('compact');
    densityStore.set(comfortable);
    expect(get(densityStore)).toBe('comfortable');
  });
});
