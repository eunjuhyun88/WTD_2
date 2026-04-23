export type SupportedChainFamily = 'solana' | 'tron' | 'evm';
export type SupportedChainQueryFamily = SupportedChainFamily | 'all';
export type SupportedChainRegistrySource = 'manual' | 'etherscan_chainlist' | 'etherscan_snapshot' | 'composite';

export interface SupportedChainEntry {
  family: SupportedChainFamily;
  chainId: string | null;
  slug: string;
  label: string;
  displayName: string;
  nativeSymbol: string | null;
  blockExplorerUrl: string | null;
  apiUrl: string | null;
  isTestnet: boolean;
  freeTierAvailable: boolean | null;
  paidTierAvailable: boolean | null;
  status: number | null;
  comment: string | null;
  aliases: string[];
  source: SupportedChainRegistrySource;
}

export interface SupportedChainSearchResult {
  q: string;
  family: SupportedChainQueryFamily;
  total: number;
  source: SupportedChainRegistrySource;
  chains: SupportedChainEntry[];
}
