export interface SimulatedWalletConnection {
  address: string;
  shortAddr: string;
  balance: number;
  chain: string;
  provider: string;
}

function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function createSimulatedAddress(addressOverride?: string): string {
  if (addressOverride && addressOverride.trim()) return addressOverride.trim();
  return `0x${randomHex(40)}`;
}

export function createSimulatedSignature(signatureOverride?: string): string {
  if (signatureOverride && signatureOverride.trim()) return signatureOverride.trim();
  return `0x${randomHex(130)}`;
}

export function createSimulatedWalletConnection(
  provider: string = 'MetaMask',
  addressOverride?: string,
  chain: string = 'ARB'
): SimulatedWalletConnection {
  const address = createSimulatedAddress(addressOverride);
  return {
    address,
    shortAddr: `${address.slice(0, 6)}...${address.slice(-4)}`,
    balance: +(Math.random() * 10000 + 500).toFixed(2),
    chain,
    provider,
  };
}
