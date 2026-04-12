// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Copy Trade Builder Store
// War Room signal selection → Copy Trade Modal → Publish to Signal Room
// ═══════════════════════════════════════════════════════════════

import { writable, derived } from 'svelte/store';
import type { AgentSignal } from '$lib/data/warroom';
import { getConsensus } from '$lib/data/warroom';
import { openQuickTrade, replaceQuickTradeId } from './quickTradeStore';
import { replaceTrackedSignalId, trackSignal } from './trackedSignalStore';
import { incrementTrackedSignals } from './userProfileStore';
import { openQuickTradeApi, publishCopyTradeApi, trackSignalApi } from '$lib/api/tradingApi';

export interface CopyTradeDraft {
  pair: string;
  dir: 'LONG' | 'SHORT';
  orderType: 'market' | 'limit';
  entry: number;
  tp: number[];
  sl: number;
  leverage: number;
  sizePercent: number;
  marginMode: 'cross' | 'isolated';
  evidence: { icon: string; name: string; text: string; conf: number; color: string }[];
  note: string;
  source?: string;
}

interface CopyTradeState {
  isOpen: boolean;
  step: 1 | 2 | 3;
  selectedSignalIds: string[];
  draft: CopyTradeDraft;
}

export interface ExternalCopySignal {
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  tp: number;
  sl: number;
  conf: number;
  source?: string;
  reason?: string;
}

const defaultDraft: CopyTradeDraft = {
  pair: 'BTC/USDT',
  dir: 'LONG',
  orderType: 'market',
  entry: 0,
  tp: [0],
  sl: 0,
  leverage: 5,
  sizePercent: 50,
  marginMode: 'isolated',
  evidence: [],
  note: '',
};

/** WarRoom에서 현재 스캔 시그널 등록 (CopyTrade에서 참조) */
let _registeredSignals: AgentSignal[] = [];
export function registerScanSignals(signals: AgentSignal[]) {
  _registeredSignals = signals;
}

function createCopyTradeStore() {
  const store = writable<CopyTradeState>({
    isOpen: false,
    step: 1,
    selectedSignalIds: [],
    draft: { ...defaultDraft },
  });

  return {
    subscribe: store.subscribe,

    /** signals를 직접 전달 (실제 스캔 데이터 사용) */
    openModal(selectedIds: string[], signalPool?: AgentSignal[]) {
      const pool = signalPool ?? _registeredSignals;
      const signals = pool.filter(s => selectedIds.includes(s.id));
      if (signals.length === 0) return;

      const consensus = getConsensus(signals);
      const primary = signals[0];

      // Auto-fill draft from selected signals
      const avgEntry = Math.round(signals.reduce((s, sig) => s + sig.entry, 0) / signals.length);
      const tpValues = signals.filter(s => s.vote === consensus.dir.toLowerCase()).map(s => s.tp);
      const slValues = signals.filter(s => s.vote === consensus.dir.toLowerCase()).map(s => s.sl);
      const avgTp = tpValues.length ? Math.round(tpValues.reduce((a, b) => a + b, 0) / tpValues.length) : primary.tp;
      const avgSl = slValues.length ? Math.round(slValues.reduce((a, b) => a + b, 0) / slValues.length) : primary.sl;

      store.set({
        isOpen: true,
        step: 1,
        selectedSignalIds: selectedIds,
        draft: {
          pair: primary.pair,
          dir: consensus.dir === 'NEUTRAL' ? 'LONG' : consensus.dir,
          orderType: 'market',
          entry: avgEntry,
          tp: [avgTp],
          sl: avgSl,
          leverage: 5,
          sizePercent: 50,
          marginMode: 'isolated',
          evidence: signals.map(s => ({ icon: s.icon, name: s.name, text: s.text, conf: s.conf, color: s.color })),
          note: '',
        },
      });
    },

    openFromSignal(signal: ExternalCopySignal) {
      const source = signal.source || 'SIGNAL ROOM';
      const confidence = Number.isFinite(signal.conf) ? Math.max(1, Math.min(100, Math.round(signal.conf))) : 70;

      store.set({
        isOpen: true,
        step: 1,
        selectedSignalIds: [],
        draft: {
          pair: signal.pair,
          dir: signal.dir,
          orderType: 'market',
          entry: Math.round(signal.entry),
          tp: [Math.round(signal.tp)],
          sl: Math.round(signal.sl),
          leverage: 5,
          sizePercent: 50,
          marginMode: 'isolated',
          evidence: [
            {
              icon: '📡',
              name: source,
              text: signal.reason || `${signal.dir} ${signal.pair} signal imported`,
              conf: confidence,
              color: '#ff8c3b',
            },
          ],
          note: signal.reason || '',
        },
      });
    },

    closeModal() {
      store.update(s => ({ ...s, isOpen: false, step: 1, selectedSignalIds: [] }));
    },

    nextStep() {
      store.update(s => ({ ...s, step: Math.min(s.step + 1, 3) as 1 | 2 | 3 }));
    },

    prevStep() {
      store.update(s => ({ ...s, step: Math.max(s.step - 1, 1) as 1 | 2 | 3 }));
    },

    updateDraft(partial: Partial<CopyTradeDraft>) {
      store.update(s => ({ ...s, draft: { ...s.draft, ...partial } }));
    },

    addTpTarget() {
      store.update(s => {
        if (s.draft.tp.length >= 3) return s;
        const lastTp = s.draft.tp[s.draft.tp.length - 1];
        const diff = Math.abs(s.draft.entry - lastTp);
        const newTp = s.draft.dir === 'LONG' ? lastTp + Math.round(diff * 0.5) : lastTp - Math.round(diff * 0.5);
        return { ...s, draft: { ...s.draft, tp: [...s.draft.tp, newTp] } };
      });
    },

    removeTpTarget(index: number) {
      store.update(s => {
        if (s.draft.tp.length <= 1) return s;
        return { ...s, draft: { ...s.draft, tp: s.draft.tp.filter((_, i) => i !== index) } };
      });
    },

    publishSignal(): boolean {
      let success = false;
      let localTradeId: string | null = null;
      let localSignalId: string | null = null;
      let payloadDraft: CopyTradeDraft | null = null;
      let selectedSignalIds: string[] = [];
      let confidence = 70;

      store.update(s => {
        const d = s.draft;
        const evidenceText = d.evidence.map(e => `${e.icon} ${e.name}: ${e.text} (${e.conf}%)`).join('\n');
        const noteText = d.note ? `${d.note}\n\n${evidenceText}` : evidenceText;
        confidence = d.evidence.length
          ? Math.round(d.evidence.reduce((a, e) => a + e.conf, 0) / d.evidence.length)
          : 70;
        selectedSignalIds = [...s.selectedSignalIds];

        // Open a QuickTrade position
        localTradeId = openQuickTrade(d.pair, d.dir, d.entry, d.tp[0], d.sl, 'copy-trade', noteText, false);

        // Track as signal for Signal Room
        localSignalId = trackSignal(d.pair, d.dir, d.entry, 'COPY TRADE', confidence, noteText, false);
        incrementTrackedSignals();
        payloadDraft = { ...d, note: noteText, source: 'copy-trade' };

        success = true;
        return { ...s, isOpen: false, step: 1, selectedSignalIds: [] };
      });

      if (success && typeof window !== 'undefined' && localTradeId && localSignalId && payloadDraft) {
        void publishCopyTradeApi({
          selectedSignalIds,
          draft: payloadDraft,
          confidence,
        }).then((result) => {
          if (!result) {
            void openQuickTradeApi({
              pair: payloadDraft!.pair,
              dir: payloadDraft!.dir,
              entry: payloadDraft!.entry,
              tp: payloadDraft!.tp[0] ?? null,
              sl: payloadDraft!.sl ?? null,
              currentPrice: payloadDraft!.entry,
              source: 'copy-trade',
              note: payloadDraft!.note || '',
            }).then((serverTrade) => {
              if (!serverTrade) return;
              replaceQuickTradeId(localTradeId as string, serverTrade.id, {
                currentPrice: serverTrade.currentPrice,
                pnlPercent: serverTrade.pnlPercent,
                status: serverTrade.status,
                openedAt: serverTrade.openedAt,
              });
            });

            void trackSignalApi({
              pair: payloadDraft!.pair,
              dir: payloadDraft!.dir,
              confidence,
              entryPrice: payloadDraft!.entry,
              currentPrice: payloadDraft!.entry,
              source: 'COPY TRADE',
              note: payloadDraft!.note || '',
              ttlHours: 24,
            }).then((serverSignal) => {
              if (!serverSignal) return;
              replaceTrackedSignalId(localSignalId as string, serverSignal.id, {
                confidence: serverSignal.confidence,
                currentPrice: serverSignal.currentPrice,
                pnlPercent: serverSignal.pnlPercent,
                status: serverSignal.status,
                trackedAt: serverSignal.trackedAt,
                expiresAt: serverSignal.expiresAt,
              });
            });
            return;
          }

          replaceQuickTradeId(localTradeId as string, result.trade.id, {
            currentPrice: result.trade.currentPrice,
            pnlPercent: result.trade.pnlPercent,
            status: result.trade.status,
            openedAt: result.trade.openedAt,
          });

          replaceTrackedSignalId(localSignalId as string, result.signal.id, {
            confidence: result.signal.confidence,
            currentPrice: result.signal.currentPrice,
            pnlPercent: result.signal.pnlPercent,
            status: result.signal.status,
            trackedAt: result.signal.trackedAt,
            expiresAt: result.signal.expiresAt,
          });
        });
      }

      return success;
    },
  };
}

export const copyTradeStore = createCopyTradeStore();

// Derived helpers
export const isCopyTradeOpen = derived({ subscribe: copyTradeStore.subscribe }, $s => $s.isOpen);
export const copyTradeStep = derived({ subscribe: copyTradeStore.subscribe }, $s => $s.step);
export const copyTradeDraft = derived({ subscribe: copyTradeStore.subscribe }, $s => $s.draft);
