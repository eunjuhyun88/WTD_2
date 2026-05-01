// Wallet modal GTM tracking utilities
export type WalletFunnelStep = 'modal_open' | 'connect' | 'sign' | 'auth' | 'disconnect';
export type WalletFunnelStatus = 'view' | 'success' | 'error';

interface GTMWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
}

export function gtmEvent(event: string, payload: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  const w = window as GTMWindow;
  if (!Array.isArray(w.dataLayer)) return;
  w.dataLayer.push({ event, area: 'wallet_modal', ...payload });
}

export function trackWalletFunnel(
  stepName: WalletFunnelStep,
  status: WalletFunnelStatus,
  authMode: 'signup' | 'login',
  payload: Record<string, unknown> = {}
): void {
  gtmEvent('wallet_funnel', {
    step: stepName,
    status,
    mode: authMode,
    ...payload,
  });
}

export function toErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (!message) return 'unknown';
  if (message.includes('reject') || message.includes('denied')) return 'user_rejected';
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('network')) return 'network';
  if (message.includes('wallet')) return 'wallet';
  if (message.includes('signature') || message.includes('sign')) return 'signature';
  if (message.includes('email') || message.includes('nickname')) return 'form_validation';
  return 'unexpected';
}
