// ═══════════════════════════════════════════════════════════════
// Stockclaw — Notification & Toast Store
// ═══════════════════════════════════════════════════════════════

import { writable, derived } from 'svelte/store';
import { STORAGE_KEYS } from './storageKeys';
import {
  createNotificationApi,
  deleteNotificationApi,
  fetchNotificationsApi,
  markNotificationsReadApi,
  type ApiNotification,
} from '$lib/api/notificationsApi';

// ── Notification Types ──
export type NotificationType = 'alert' | 'critical' | 'info' | 'success';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  time: Date;
  read: boolean;
  dismissable: boolean;
}

// ── Toast Types ──
export type ToastLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Toast {
  id: string;
  level: ToastLevel;
  title: string;
  score: number;
  time: Date;
}

// ── P0 Override Types ──
export interface P0State {
  active: boolean;
  reason: string;
  triggeredAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION STORE
// ═══════════════════════════════════════════════════════════════

function createNotificationStore() {
  const { subscribe, update, set } = writable<Notification[]>([]);
  let hydrated = false;
  let hydratePromise: Promise<void> | null = null;

  function mapApiNotification(n: ApiNotification): Notification {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      time: new Date(n.createdAt),
      read: Boolean(n.isRead),
      dismissable: Boolean(n.dismissable),
    };
  }

  return {
    subscribe,
    async hydrate(force = false) {
      if (typeof window === 'undefined') return;
      if (hydrated && !force) return;
      if (hydratePromise) return hydratePromise;

      hydratePromise = (async () => {
        const rows = await fetchNotificationsApi({ limit: 100, offset: 0 });
        if (!rows) return;
        hydrated = true;
        set(rows.map(mapApiNotification));
      })();

      try {
        await hydratePromise;
      } finally {
        hydratePromise = null;
      }
    },
    addNotification(n: Omit<Notification, 'id' | 'time' | 'read'>) {
      const tempId = crypto.randomUUID ? crypto.randomUUID() : `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const notification: Notification = {
        ...n,
        id: `tmp-${tempId}`,
        time: new Date(),
        read: false,
      };
      update(list => [notification, ...list].slice(0, 50)); // cap at 50
      void (async () => {
        const saved = await createNotificationApi({
          type: n.type,
          title: n.title,
          body: n.body,
          dismissable: n.dismissable,
        });
        if (!saved) return;

        update((list) =>
          list.map((item) =>
            item.id === notification.id
              ? {
                  id: saved.id,
                  type: saved.type,
                  title: saved.title,
                  body: saved.body,
                  time: new Date(saved.createdAt),
                  read: Boolean(saved.isRead),
                  dismissable: Boolean(saved.dismissable),
                }
              : item
          )
        );
      })();
      return notification.id;
    },
    markRead(id: string) {
      update(list => list.map(n => n.id === id ? { ...n, read: true } : n));
      if (!id.startsWith('tmp-')) {
        void markNotificationsReadApi([id]);
      }
    },
    markAllRead() {
      update(list => list.map(n => ({ ...n, read: true })));
      void markNotificationsReadApi();
    },
    clearAll() {
      let ids: string[] = [];
      update((list) => {
        ids = list.filter((n) => !n.id.startsWith('tmp-')).map((n) => n.id);
        return [];
      });
      void Promise.all(ids.map((id) => deleteNotificationApi(id)));
    },
    remove(id: string) {
      update(list => list.filter(n => n.id !== id));
      if (!id.startsWith('tmp-')) {
        void deleteNotificationApi(id);
      }
    },
  };
}

export const notifications = createNotificationStore();
export const unreadCount = derived<typeof notifications, number>(notifications, $n => $n.filter(n => !n.read).length);

// ═══════════════════════════════════════════════════════════════
// TOAST STORE
// ═══════════════════════════════════════════════════════════════

function createToastStore() {
  const { subscribe, update, set } = writable<Toast[]>([]);

  return {
    subscribe,
    addToast(t: Omit<Toast, 'id' | 'time'>) {
      // LOW level = no toast
      if (t.level === 'low') return null;
      const toast: Toast = {
        ...t,
        id: crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: new Date(),
      };
      update(list => [...list, toast].slice(-5)); // cap at 5 visible
      return toast.id;
    },
    dismiss(id: string) {
      update(list => list.filter(t => t.id !== id));
    },
    clearAll() {
      set([]);
    },
  };
}

export const toasts = createToastStore();

// ═══════════════════════════════════════════════════════════════
// P0 OVERRIDE STORE
// ═══════════════════════════════════════════════════════════════

function createP0Store() {
  const { subscribe, set } = writable<P0State>({
    active: false,
    reason: '',
    triggeredAt: null,
  });

  return {
    subscribe,
    trigger(reason: string) {
      set({ active: true, reason, triggeredAt: new Date() });
      // Also add a critical notification
      notifications.addNotification({
        type: 'critical',
        title: 'P0 OVERRIDE TRIGGERED',
        body: reason,
        dismissable: false,
      });
    },
    clear() {
      set({ active: false, reason: '', triggeredAt: null });
      notifications.addNotification({
        type: 'success',
        title: 'P0 OVERRIDE CLEARED',
        body: 'Guardian conditions normalized. Trading resumed.',
        dismissable: true,
      });
    },
  };
}

export const p0Override = createP0Store();

// ═══════════════════════════════════════════════════════════════
// EVENT-BASED NOTIFICATION HELPERS
// ═══════════════════════════════════════════════════════════════

/** Fire when a QuickTrade PnL crosses a threshold */
export function notifyTradePnL(pair: string, dir: string, pnl: number) {
  if (Math.abs(pnl) < 5) return; // Only fire for ±5%+
  const up = pnl > 0;
  notifications.addNotification({
    type: up ? 'success' : 'alert',
    title: `${dir} ${pair}: ${up ? '+' : ''}${pnl.toFixed(1)}%`,
    body: up
      ? `Your ${dir} position is up ${pnl.toFixed(1)}%. Consider taking profit.`
      : `Your ${dir} position is down ${Math.abs(pnl).toFixed(1)}%. Check your stop loss.`,
    dismissable: true,
  });
}

/** Fire when a tracked signal is about to expire */
export function notifySignalExpiring(pair: string, source: string, hoursLeft: number) {
  if (hoursLeft > 1) return; // Only fire within 1h
  notifications.addNotification({
    type: 'alert',
    title: `Signal expiring: ${pair}`,
    body: `Tracked signal from ${source} expires in ${Math.floor(hoursLeft * 60)}min. Convert to trade or let it expire.`,
    dismissable: true,
  });
}

/** Fire when an Arena match completes */
export function notifyMatchComplete(matchN: number, win: boolean, lp: number) {
  notifications.addNotification({
    type: win ? 'success' : 'info',
    title: `Match #${matchN}: ${win ? 'WIN' : 'LOSS'}`,
    body: `${win ? 'Victory!' : 'Defeated.'} ${lp >= 0 ? '+' : ''}${lp} LP earned.`,
    dismissable: true,
  });
}

/** Fire when a signal is tracked */
export function notifySignalTracked(pair: string, dir: string) {
  toasts.addToast({
    level: 'medium',
    title: `📌 ${dir} ${pair} tracked — check TRACKED tab`,
    score: 0,
  });
}

// ═══════════════════════════════════════════════════════════════
// INITIAL SIMULATED NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

export function seedNotifications() {
  if (typeof window === 'undefined') return;
  const seedKey = STORAGE_KEYS.notificationsSeeded;
  if (sessionStorage.getItem(seedKey) === '1') return;
  sessionStorage.setItem(seedKey, '1');

  notifications.addNotification({
    type: 'info',
    title: 'SESSION STARTED',
    body: 'Stockclaw arena is live. Good luck, trader.',
    dismissable: true,
  });
  notifications.addNotification({
    type: 'alert',
    title: 'FUNDING RATE SPIKE',
    body: 'BTC perpetual funding rate at +0.045% — elevated long positioning detected.',
    dismissable: true,
  });
  notifications.addNotification({
    type: 'success',
    title: 'AGENT SYNC COMPLETE',
    body: 'All 5 agents calibrated and ready for deployment.',
    dismissable: true,
  });
  notifications.addNotification({
    type: 'critical',
    title: 'LIQUIDATION CASCADE',
    body: '$142M in long liquidations over the past hour. High volatility zone.',
    dismissable: true,
  });
  notifications.addNotification({
    type: 'alert',
    title: 'OI DIVERGENCE',
    body: 'Open Interest rising while price drops — potential short squeeze setup.',
    dismissable: true,
  });
}
