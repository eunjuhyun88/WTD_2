// EIP-6963: Multi Injected Provider Discovery
// https://eips.ethereum.org/EIPS/eip-6963

export interface EIP6963ProviderInfo {
  rdns: string;   // e.g. 'io.metamask', 'xyz.rabby'
  name: string;
  icon: string;   // data: URL (PNG/SVG)
  uuid: string;
}

export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export interface DetectedWallet {
  rdns: string;
  name: string;
  icon: string;
  provider: EIP1193Provider;
}

interface EIP6963AnnounceProviderEvent extends Event {
  detail: {
    info: EIP6963ProviderInfo;
    provider: EIP1193Provider;
  };
}

export function detectInjectedWallets(timeoutMs = 300): Promise<DetectedWallet[]> {
  if (typeof window === 'undefined') return Promise.resolve([]);

  return new Promise((resolve) => {
    const found: DetectedWallet[] = [];
    const seen = new Set<string>();

    const handler = (e: Event) => {
      const event = e as EIP6963AnnounceProviderEvent;
      const { info, provider } = event.detail ?? {};
      if (!info?.rdns || seen.has(info.rdns)) return;
      seen.add(info.rdns);
      found.push({ rdns: info.rdns, name: info.name, icon: info.icon, provider });
    };

    window.addEventListener('eip6963:announceProvider', handler);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', handler);
      resolve(found);
    }, timeoutMs);
  });
}

// Known rdns → canonical provider key mapping (for deduplication with static list)
export const RDNS_TO_PROVIDER: Record<string, string> = {
  'io.metamask': 'metamask',
  'app.phantom': 'phantom',
  'com.coinbase.wallet': 'coinbase',
  'io.rabby': 'rabby',
  'io.zerion.wallet': 'zerion',
  'me.rainbow': 'rainbow',
};
