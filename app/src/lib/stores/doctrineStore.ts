// ═══════════════════════════════════════════════════════════════
// CHATBATTLE — Doctrine CRUD Store
// ═══════════════════════════════════════════════════════════════
//
// Manages doctrine weight configuration per agent.
// Doctrine = 6 factor weights that define an agent's trading personality.
// Persisted to localStorage, synced to server when API is available.

import { writable, derived } from 'svelte/store';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';

// ─── Types ───────────────────────────────────────────────────

export interface DoctrineWeights {
  cvd: number;       // CVD Divergence (0-100)
  mvrv: number;      // MVRV Zone (0-100)
  funding: number;   // Funding Flip (0-100)
  volume: number;    // Volume Spike (0-100)
  bb: number;        // BB Squeeze (0-100)
  oi: number;        // OI Surge (0-100)
}

export interface DoctrineVersion {
  version: number;
  weights: DoctrineWeights;
  timestamp: number;
  winRate: number | null;     // null = not yet tested
  pnl: number | null;
  label: string;              // e.g. "CVD Reversal v3"
}

export interface AgentDoctrine {
  agentId: string;
  current: DoctrineWeights;
  versions: DoctrineVersion[];
  style: string;              // e.g. "역추세 + 변동성 필터"
  rrMinimum: number;          // R:R minimum (default 1.5)
  maxPosition: number;        // max position % (default 3)
}

export const FACTOR_LABELS: Record<keyof DoctrineWeights, { name: string; nameKR: string; icon: string }> = {
  cvd: { name: 'CVD Divergence', nameKR: 'CVD 다이버전스', icon: 'C' },
  mvrv: { name: 'MVRV Zone', nameKR: 'MVRV 존', icon: 'M' },
  funding: { name: 'Funding Flip', nameKR: '펀딩 플립', icon: 'F' },
  volume: { name: 'Volume Spike', nameKR: '거래량 스파이크', icon: 'V' },
  bb: { name: 'BB Squeeze', nameKR: 'BB 스퀴즈', icon: 'B' },
  oi: { name: 'OI Surge', nameKR: 'OI 서지', icon: 'O' },
};

export const DEFAULT_WEIGHTS: DoctrineWeights = {
  cvd: 72,
  mvrv: 58,
  funding: 45,
  volume: 90,
  bb: 82,
  oi: 65,
};

// ─── Archetype presets ───────────────────────────────────────

export const ARCHETYPE_PRESETS: Record<string, { weights: DoctrineWeights; style: string }> = {
  oracle: {
    weights: { cvd: 85, mvrv: 70, funding: 60, volume: 40, bb: 50, oi: 45 },
    style: '역추세 + 온체인 기반',
  },
  crusher: {
    weights: { cvd: 30, mvrv: 25, funding: 50, volume: 95, bb: 75, oi: 90 },
    style: '모멘텀 + 거래량/OI 기반',
  },
  guardian: {
    weights: { cvd: 55, mvrv: 80, funding: 70, volume: 60, bb: 90, oi: 55 },
    style: '리스크 관리 + 변동성 필터',
  },
};

// ─── Store ────────────────────────────────────────────────────

const STORAGE_KEY = 'sc_doctrines';

function createDefaultDoctrines(): Record<string, AgentDoctrine> {
  return {};
}

function loadDoctrines(): Record<string, AgentDoctrine> {
  const saved = loadFromStorage<Record<string, AgentDoctrine> | null>(STORAGE_KEY, null);
  if (saved) return saved;
  return createDefaultDoctrines();
}

export const doctrineStore = writable<Record<string, AgentDoctrine>>(loadDoctrines());

// localStorage persistence
autoSave(doctrineStore, STORAGE_KEY, undefined, 500);

// ─── Actions ──────────────────────────────────────────────────

export function getOrCreateDoctrine(agentId: string, archetype?: string): AgentDoctrine {
  let doctrine: AgentDoctrine | undefined;

  doctrineStore.update(store => {
    if (store[agentId]) {
      doctrine = store[agentId];
      return store;
    }

    const preset = archetype ? ARCHETYPE_PRESETS[archetype] : undefined;
    const weights = preset?.weights ?? { ...DEFAULT_WEIGHTS };
    const style = preset?.style ?? '커스텀';

    const newDoctrine: AgentDoctrine = {
      agentId,
      current: weights,
      versions: [{
        version: 1,
        weights: { ...weights },
        timestamp: Date.now(),
        winRate: null,
        pnl: null,
        label: `Doctrine v1`,
      }],
      style,
      rrMinimum: 1.5,
      maxPosition: 3,
    };

    doctrine = newDoctrine;
    return { ...store, [agentId]: newDoctrine };
  });

  return doctrine!;
}

export function updateWeights(agentId: string, weights: Partial<DoctrineWeights>): void {
  doctrineStore.update(store => {
    const doc = store[agentId];
    if (!doc) return store;
    doc.current = { ...doc.current, ...weights };
    return { ...store };
  });
}

export function updateSettings(agentId: string, settings: { style?: string; rrMinimum?: number; maxPosition?: number }): void {
  doctrineStore.update(store => {
    const doc = store[agentId];
    if (!doc) return store;
    if (settings.style !== undefined) doc.style = settings.style;
    if (settings.rrMinimum !== undefined) doc.rrMinimum = settings.rrMinimum;
    if (settings.maxPosition !== undefined) doc.maxPosition = settings.maxPosition;
    return { ...store };
  });
}

export function saveDoctrine(agentId: string, label?: string): DoctrineVersion | null {
  let version: DoctrineVersion | null = null;

  doctrineStore.update(store => {
    const doc = store[agentId];
    if (!doc) return store;

    const nextVersion = doc.versions.length + 1;
    const newVersion: DoctrineVersion = {
      version: nextVersion,
      weights: { ...doc.current },
      timestamp: Date.now(),
      winRate: null,
      pnl: null,
      label: label ?? `Doctrine v${nextVersion}`,
    };

    doc.versions.push(newVersion);
    version = newVersion;
    return { ...store };
  });

  return version;
}

export function revertToVersion(agentId: string, versionNum: number): void {
  doctrineStore.update(store => {
    const doc = store[agentId];
    if (!doc) return store;

    const target = doc.versions.find(v => v.version === versionNum);
    if (!target) return store;

    doc.current = { ...target.weights };
    return { ...store };
  });
}

// ─── Derived ──────────────────────────────────────────────────

export const allDoctrines = derived(doctrineStore, $store => $store);
