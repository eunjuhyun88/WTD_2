import type {
  SupportedChainEntry,
  SupportedChainFamily,
  SupportedChainQueryFamily,
  SupportedChainRegistrySource,
  SupportedChainSearchResult,
} from '$lib/contracts/supportedChains';
import { getCached, setCache } from './providers/cache';

const ETHERSCAN_CHAINLIST_URL = 'https://api.etherscan.io/v2/chainlist';
const CHAINLIST_CACHE_KEY = 'etherscan:chainlist:v2';
const CHAINLIST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FREE_TIER_BLOCKED_CHAIN_IDS = new Set([
  '10',
  '56',
  '97',
  '8453',
  '84532',
  '43113',
  '43114',
  '11155420',
]);

interface EtherscanChainRow {
  chainname: string;
  chainid: string;
  blockexplorer: string;
  apiurl: string;
  status: number | string;
  comment?: string;
}

interface EtherscanChainlistResponse {
  result?: EtherscanChainRow[];
}

interface BaseChainMeta {
  slug: string;
  label: string;
  nativeSymbol: string | null;
  aliases: string[];
}

interface SearchSupportedChainsOptions {
  q?: string;
  family?: SupportedChainQueryFamily;
  includeTestnets?: boolean;
  limit?: number;
}

const BASE_CHAIN_META_OVERRIDES: Record<string, BaseChainMeta> = {
  Ethereum: { slug: 'ethereum', label: 'Ethereum', nativeSymbol: 'ETH', aliases: ['eth', 'evm', 'mainnet'] },
  'BNB Smart Chain': { slug: 'bsc', label: 'BNB Smart Chain', nativeSymbol: 'BNB', aliases: ['bnb', 'binance'] },
  Polygon: { slug: 'polygon', label: 'Polygon', nativeSymbol: 'POL', aliases: ['matic'] },
  Base: { slug: 'base', label: 'Base', nativeSymbol: 'ETH', aliases: [] },
  'Arbitrum One': { slug: 'arbitrum', label: 'Arbitrum', nativeSymbol: 'ETH', aliases: ['arb'] },
  Arbitrum: { slug: 'arbitrum', label: 'Arbitrum', nativeSymbol: 'ETH', aliases: ['arb'] },
  Linea: { slug: 'linea', label: 'Linea', nativeSymbol: 'ETH', aliases: [] },
  Blast: { slug: 'blast', label: 'Blast', nativeSymbol: 'ETH', aliases: [] },
  OP: { slug: 'optimism', label: 'Optimism', nativeSymbol: 'ETH', aliases: ['op'] },
  'Avalanche C-Chain': { slug: 'avalanche', label: 'Avalanche', nativeSymbol: 'AVAX', aliases: ['avax'] },
  'BitTorrent Chain': { slug: 'bttc', label: 'BitTorrent Chain', nativeSymbol: null, aliases: ['bittorrent'] },
  Celo: { slug: 'celo', label: 'Celo', nativeSymbol: 'CELO', aliases: [] },
  Fraxtal: { slug: 'fraxtal', label: 'Fraxtal', nativeSymbol: null, aliases: [] },
  Gnosis: { slug: 'gnosis', label: 'Gnosis', nativeSymbol: 'xDAI', aliases: ['xdai'] },
  Mantle: { slug: 'mantle', label: 'Mantle', nativeSymbol: 'MNT', aliases: [] },
  Memecore: { slug: 'memecore', label: 'Memecore', nativeSymbol: null, aliases: [] },
  Moonbeam: { slug: 'moonbeam', label: 'Moonbeam', nativeSymbol: 'GLMR', aliases: [] },
  Moonriver: { slug: 'moonriver', label: 'Moonriver', nativeSymbol: 'MOVR', aliases: [] },
  opBNB: { slug: 'opbnb', label: 'opBNB', nativeSymbol: 'BNB', aliases: [] },
  Scroll: { slug: 'scroll', label: 'Scroll', nativeSymbol: 'ETH', aliases: [] },
  Taiko: { slug: 'taiko', label: 'Taiko', nativeSymbol: 'ETH', aliases: [] },
  XDC: { slug: 'xdc', label: 'XDC', nativeSymbol: 'XDC', aliases: [] },
  ApeChain: { slug: 'apechain', label: 'ApeChain', nativeSymbol: null, aliases: ['ape'] },
  World: { slug: 'world', label: 'World', nativeSymbol: 'ETH', aliases: ['worldchain'] },
  Sonic: { slug: 'sonic', label: 'Sonic', nativeSymbol: 'S', aliases: [] },
  Unichain: { slug: 'unichain', label: 'Unichain', nativeSymbol: 'ETH', aliases: [] },
  Abstract: { slug: 'abstract', label: 'Abstract', nativeSymbol: 'ETH', aliases: [] },
  Berachain: { slug: 'berachain', label: 'Berachain', nativeSymbol: 'BERA', aliases: ['bera'] },
  Monad: { slug: 'monad', label: 'Monad', nativeSymbol: null, aliases: [] },
  HyperEVM: { slug: 'hyperevm', label: 'HyperEVM', nativeSymbol: 'HYPE', aliases: ['hyper'] },
  Katana: { slug: 'katana', label: 'Katana', nativeSymbol: 'ETH', aliases: [] },
  Sei: { slug: 'sei', label: 'Sei', nativeSymbol: 'SEI', aliases: [] },
  Stable: { slug: 'stable', label: 'Stable', nativeSymbol: null, aliases: [] },
  Plasma: { slug: 'plasma', label: 'Plasma', nativeSymbol: null, aliases: [] },
  MegaETH: { slug: 'megaeth', label: 'MegaETH', nativeSymbol: 'ETH', aliases: [] },
};

const TESTNET_SUFFIX_PATTERNS = [
  { suffix: ' Sepolia Testnet', slug: 'sepolia', label: 'Sepolia' },
  { suffix: ' Hoodi Testnet', slug: 'hoodi', label: 'Hoodi' },
  { suffix: ' Fuji Testnet', slug: 'fuji', label: 'Fuji' },
  { suffix: ' Amoy Testnet', slug: 'amoy', label: 'Amoy' },
  { suffix: ' Alpha Testnet', slug: 'alpha', label: 'Alpha' },
  { suffix: ' Apothem Testnet', slug: 'apothem', label: 'Apothem' },
  { suffix: ' Curtis Testnet', slug: 'curtis', label: 'Curtis' },
  { suffix: ' Bepolia Testnet', slug: 'bepolia', label: 'Bepolia' },
  { suffix: ' Insectarium Testnet', slug: 'insectarium', label: 'Insectarium' },
  { suffix: ' Testnet', slug: 'testnet', label: 'Testnet' },
  { suffix: ' Hoodi', slug: 'hoodi', label: 'Hoodi' },
  { suffix: ' Bokuto', slug: 'bokuto', label: 'Bokuto' },
];

const MANUAL_SUPPORTED_CHAINS: SupportedChainEntry[] = [
  {
    family: 'solana',
    chainId: null,
    slug: 'solana',
    label: 'Solana',
    displayName: 'Solana',
    nativeSymbol: 'SOL',
    blockExplorerUrl: 'https://solscan.io/',
    apiUrl: 'https://docs.etherscan.io/solscan-openapi.json',
    isTestnet: false,
    freeTierAvailable: null,
    paidTierAvailable: null,
    status: 1,
    comment: 'Solana is served by Solscan APIs, separate from Etherscan V2.',
    aliases: ['sol', 'solana'],
    source: 'manual',
  },
  {
    family: 'tron',
    chainId: null,
    slug: 'tron',
    label: 'TRON',
    displayName: 'TRON',
    nativeSymbol: 'TRX',
    blockExplorerUrl: 'https://tronscan.org/',
    apiUrl: 'https://apilist.tronscanapi.com/api',
    isTestnet: false,
    freeTierAvailable: null,
    paidTierAvailable: null,
    status: 1,
    comment: 'TRON is served by TRONSCAN, separate from Etherscan V2.',
    aliases: ['tron', 'trx'],
    source: 'manual',
  },
];

const ETHERSCAN_CHAINLIST_SNAPSHOT: EtherscanChainRow[] = [
  { chainname: 'Ethereum Mainnet', chainid: '1', blockexplorer: 'https://etherscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=1', status: 1, comment: '' },
  { chainname: 'Sepolia Testnet', chainid: '11155111', blockexplorer: 'https://sepolia.etherscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=11155111', status: 1, comment: '' },
  { chainname: 'Hoodi Testnet', chainid: '560048', blockexplorer: 'https://hoodi.etherscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=560048', status: 1, comment: '' },
  { chainname: 'BNB Smart Chain Mainnet', chainid: '56', blockexplorer: 'https://bscscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=56', status: 1, comment: '' },
  { chainname: 'BNB Smart Chain Testnet', chainid: '97', blockexplorer: 'https://testnet.bscscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=97', status: 1, comment: '' },
  { chainname: 'Polygon Mainnet', chainid: '137', blockexplorer: 'https://polygonscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=137', status: 1, comment: '' },
  { chainname: 'Polygon Amoy Testnet', chainid: '80002', blockexplorer: 'https://amoy.polygonscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=80002', status: 1, comment: '' },
  { chainname: 'Base Mainnet', chainid: '8453', blockexplorer: 'https://basescan.org/', apiurl: 'https://api.etherscan.io/v2/api?chainid=8453', status: 1, comment: '' },
  { chainname: 'Base Sepolia Testnet', chainid: '84532', blockexplorer: 'https://sepolia.basescan.org/', apiurl: 'https://api.etherscan.io/v2/api?chainid=84532', status: 1, comment: '' },
  { chainname: 'Arbitrum One Mainnet', chainid: '42161', blockexplorer: 'https://arbiscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=42161', status: 1, comment: '' },
  { chainname: 'Arbitrum Sepolia Testnet', chainid: '421614', blockexplorer: 'https://sepolia.arbiscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=421614', status: 1, comment: '' },
  { chainname: 'Linea Mainnet', chainid: '59144', blockexplorer: 'https://lineascan.build/', apiurl: 'https://api.etherscan.io/v2/api?chainid=59144', status: 1, comment: '' },
  { chainname: 'Linea Sepolia Testnet', chainid: '59141', blockexplorer: 'https://sepolia.lineascan.build/', apiurl: 'https://api.etherscan.io/v2/api?chainid=59141', status: 1, comment: '' },
  { chainname: 'Blast Mainnet', chainid: '81457', blockexplorer: 'https://blastscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=81457', status: 1, comment: '' },
  { chainname: 'Blast Sepolia Testnet', chainid: '168587773', blockexplorer: 'https://sepolia.blastscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=168587773', status: 1, comment: '' },
  { chainname: 'OP Mainnet', chainid: '10', blockexplorer: 'https://optimistic.etherscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=10', status: 1, comment: '' },
  { chainname: 'OP Sepolia Testnet', chainid: '11155420', blockexplorer: 'https://sepolia-optimism.etherscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=11155420', status: 1, comment: '' },
  { chainname: 'Avalanche C-Chain', chainid: '43114', blockexplorer: 'https://snowscan.xyz/', apiurl: 'https://api.etherscan.io/v2/api?chainid=43114', status: 1, comment: '' },
  { chainname: 'Avalanche Fuji Testnet', chainid: '43113', blockexplorer: 'https://testnet.snowscan.xyz/', apiurl: 'https://api.etherscan.io/v2/api?chainid=43113', status: 1, comment: '' },
  { chainname: 'BitTorrent Chain Mainnet', chainid: '199', blockexplorer: 'https://bttcscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=199', status: 1, comment: '' },
  { chainname: 'BitTorrent Chain Testnet', chainid: '1029', blockexplorer: 'https://testnet.bttcscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=1029', status: 1, comment: '' },
  { chainname: 'Celo Mainnet', chainid: '42220', blockexplorer: 'https://celoscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=42220', status: 1, comment: '' },
  { chainname: 'Celo Sepolia Testnet', chainid: '11142220', blockexplorer: 'https://sepolia.celoscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=11142220', status: 1, comment: '' },
  { chainname: 'Fraxtal Mainnet', chainid: '252', blockexplorer: 'https://fraxscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=252', status: 1, comment: '' },
  { chainname: 'Fraxtal Hoodi Testnet', chainid: '2523', blockexplorer: 'https://hoodi.fraxscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=2523', status: 1, comment: '' },
  { chainname: 'Gnosis', chainid: '100', blockexplorer: 'https://gnosisscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=100', status: 1, comment: '' },
  { chainname: 'Mantle Mainnet', chainid: '5000', blockexplorer: 'https://mantlescan.xyz/', apiurl: 'https://api.etherscan.io/v2/api?chainid=5000', status: 1, comment: '' },
  { chainname: 'Mantle Sepolia Testnet', chainid: '5003', blockexplorer: 'https://sepolia.mantlescan.xyz/', apiurl: 'https://api.etherscan.io/v2/api?chainid=5003', status: 1, comment: '' },
  { chainname: 'Memecore Mainnet', chainid: '4352', blockexplorer: 'https://memecorescan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=4352', status: 1, comment: '' },
  { chainname: 'Memecore Insectarium Testnet', chainid: '43522', blockexplorer: 'https://testnet.memecorescan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=43522', status: 1, comment: '' },
  { chainname: 'Moonbeam Mainnet', chainid: '1284', blockexplorer: 'https://moonbeam.moonscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=1284', status: 1, comment: '' },
  { chainname: 'Moonriver Mainnet', chainid: '1285', blockexplorer: 'https://moonriver.moonscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=1285', status: 1, comment: '' },
  { chainname: 'Moonbase Alpha Testnet', chainid: '1287', blockexplorer: 'https://moonbase.moonscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=1287', status: 1, comment: '' },
  { chainname: 'opBNB Mainnet', chainid: '204', blockexplorer: 'https://opbnb.bscscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=204', status: 1, comment: '' },
  { chainname: 'opBNB Testnet', chainid: '5611', blockexplorer: 'https://opbnb-testnet.bscscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=5611', status: 1, comment: '' },
  { chainname: 'Scroll Mainnet', chainid: '534352', blockexplorer: 'https://scrollscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=534352', status: 1, comment: '' },
  { chainname: 'Scroll Sepolia Testnet', chainid: '534351', blockexplorer: 'https://sepolia.scrollscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=534351', status: 1, comment: '' },
  { chainname: 'Taiko Mainnet', chainid: '167000', blockexplorer: 'https://taikoscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=167000', status: 1, comment: '' },
  { chainname: 'Taiko Hoodi', chainid: '167013', blockexplorer: 'https://hoodi.taikoscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=167013', status: 1, comment: '' },
  { chainname: 'XDC Mainnet', chainid: '50', blockexplorer: 'https://xdcscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=50', status: 1, comment: '' },
  { chainname: 'XDC Apothem Testnet', chainid: '51', blockexplorer: 'https://testnet.xdcscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=51', status: 1, comment: '' },
  { chainname: 'ApeChain Mainnet', chainid: '33139', blockexplorer: 'https://apescan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=33139', status: 1, comment: '' },
  { chainname: 'ApeChain Curtis Testnet', chainid: '33111', blockexplorer: 'https://curtis.apescan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=33111', status: 1, comment: '' },
  { chainname: 'World Mainnet', chainid: '480', blockexplorer: 'https://worldscan.org/', apiurl: 'https://api.etherscan.io/v2/api?chainid=480', status: 1, comment: '' },
  { chainname: 'World Sepolia Testnet', chainid: '4801', blockexplorer: 'https://sepolia.worldscan.org/', apiurl: 'https://api.etherscan.io/v2/api?chainid=4801', status: 1, comment: '' },
  { chainname: 'Sonic Mainnet', chainid: '146', blockexplorer: 'https://sonicscan.org/', apiurl: 'https://api.etherscan.io/v2/api?chainid=146', status: 1, comment: '' },
  { chainname: 'Sonic Testnet', chainid: '14601', blockexplorer: 'https://testnet.sonicscan.org/', apiurl: 'https://api.etherscan.io/v2/api?chainid=14601', status: 1, comment: '' },
  { chainname: 'Unichain Mainnet', chainid: '130', blockexplorer: 'https://uniscan.xyz/', apiurl: 'https://api.etherscan.io/v2/api?chainid=130', status: 1, comment: '' },
  { chainname: 'Unichain Sepolia Testnet', chainid: '1301', blockexplorer: 'https://sepolia.uniscan.xyz/', apiurl: 'https://api.etherscan.io/v2/api?chainid=1301', status: 1, comment: '' },
  { chainname: 'Abstract Mainnet', chainid: '2741', blockexplorer: 'https://abscan.org/', apiurl: 'https://api.etherscan.io/v2/api?chainid=2741', status: 1, comment: '' },
  { chainname: 'Abstract Sepolia Testnet', chainid: '11124', blockexplorer: 'https://sepolia.abscan.org/', apiurl: 'https://api.etherscan.io/v2/api?chainid=11124', status: 1, comment: '' },
  { chainname: 'Berachain Mainnet', chainid: '80094', blockexplorer: 'https://berascan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=80094', status: 1, comment: '' },
  { chainname: 'Berachain Bepolia Testnet', chainid: '80069', blockexplorer: 'https://testnet.berascan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=80069', status: 1, comment: '' },
  { chainname: 'Monad Mainnet', chainid: '143', blockexplorer: 'https://monadscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=143', status: 1, comment: '' },
  { chainname: 'Monad Testnet', chainid: '10143', blockexplorer: 'https://testnet.monadscan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=10143', status: 1, comment: '' },
  { chainname: 'HyperEVM Mainnet', chainid: '999', blockexplorer: 'https://hyperevmscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=999', status: 1, comment: '' },
  { chainname: 'Katana Mainnet', chainid: '747474', blockexplorer: 'https://katanascan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=747474', status: 1, comment: '' },
  { chainname: 'Katana Bokuto', chainid: '737373', blockexplorer: 'https://bokuto.katanascan.com/', apiurl: 'https://api.etherscan.io/v2/api?chainid=737373', status: 1, comment: '' },
  { chainname: 'Sei Mainnet', chainid: '1329', blockexplorer: 'https://seiscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=1329', status: 1, comment: '' },
  { chainname: 'Sei Testnet', chainid: '1328', blockexplorer: 'https://testnet.seiscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=1328', status: 1, comment: '' },
  { chainname: 'Stable Mainnet', chainid: '988', blockexplorer: 'https://stablescan.xyz/', apiurl: 'https://api.etherscan.io/v2/api?chainid=988', status: 1, comment: 'Coming soon' },
  { chainname: 'Stable Testnet', chainid: '2201', blockexplorer: 'https://testnet.stablescan.xyz/', apiurl: 'https://api.etherscan.io/v2/api?chainid=2201', status: 1, comment: '' },
  { chainname: 'Plasma Mainnet', chainid: '9745', blockexplorer: 'https://plasmascan.to/', apiurl: 'https://api.etherscan.io/v2/api?chainid=9745', status: 1, comment: '' },
  { chainname: 'Plasma Testnet', chainid: '9746', blockexplorer: 'https://testnet.plasmascan.to/', apiurl: 'https://api.etherscan.io/v2/api?chainid=9746', status: 1, comment: '' },
  { chainname: 'MegaETH Mainnet', chainid: '4326', blockexplorer: 'https://mega.etherscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=4326', status: 1, comment: '' },
  { chainname: 'MegaETH Testnet', chainid: '6343', blockexplorer: 'https://testnet-mega.etherscan.io/', apiurl: 'https://api.etherscan.io/v2/api?chainid=6343', status: 1, comment: '' },
];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeQuery(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function baseChainMeta(baseName: string): BaseChainMeta {
  const override = BASE_CHAIN_META_OVERRIDES[baseName];
  if (override) return override;
  const slug = slugify(baseName);
  return {
    slug,
    label: baseName,
    nativeSymbol: null,
    aliases: unique([slug.replace(/-/g, '')]),
  };
}

function deriveEntryIdentity(chainName: string): {
  slug: string;
  label: string;
  nativeSymbol: string | null;
  aliases: string[];
  isTestnet: boolean;
} {
  if (chainName === 'Sepolia Testnet') {
    return {
      slug: 'ethereum-sepolia',
      label: 'Ethereum Sepolia',
      nativeSymbol: 'ETH',
      aliases: ['sepolia', 'eth-sepolia', 'ethereum-sepolia'],
      isTestnet: true,
    };
  }
  if (chainName === 'Hoodi Testnet') {
    return {
      slug: 'ethereum-hoodi',
      label: 'Ethereum Hoodi',
      nativeSymbol: 'ETH',
      aliases: ['hoodi', 'eth-hoodi', 'ethereum-hoodi'],
      isTestnet: true,
    };
  }

  for (const pattern of TESTNET_SUFFIX_PATTERNS) {
    if (!chainName.endsWith(pattern.suffix)) continue;
    const baseName = chainName.slice(0, -pattern.suffix.length).trim();
    const base = baseChainMeta(baseName);
    const slug = `${base.slug}-${pattern.slug}`;
    return {
      slug,
      label: `${base.label} ${pattern.label}`,
      nativeSymbol: base.nativeSymbol,
      aliases: unique([
        slug,
        `${base.slug}${pattern.slug}`,
        ...base.aliases.map((alias) => `${alias}-${pattern.slug}`),
        ...base.aliases.map((alias) => `${alias}${pattern.slug}`),
      ]),
      isTestnet: true,
    };
  }

  const baseName = chainName.endsWith(' Mainnet') ? chainName.slice(0, -' Mainnet'.length).trim() : chainName;
  const base = baseChainMeta(baseName);
  return {
    slug: base.slug,
    label: base.label,
    nativeSymbol: base.nativeSymbol,
    aliases: unique([base.slug, ...base.aliases, slugify(chainName), slugify(chainName).replace(/-/g, '')]),
    isTestnet: false,
  };
}

function mapEtherscanRow(
  row: EtherscanChainRow,
  source: Extract<SupportedChainRegistrySource, 'etherscan_chainlist' | 'etherscan_snapshot'>,
): SupportedChainEntry {
  const derived = deriveEntryIdentity(row.chainname);
  const status = typeof row.status === 'number' ? row.status : Number(row.status);
  return {
    family: 'evm',
    chainId: row.chainid,
    slug: derived.slug,
    label: derived.label,
    displayName: row.chainname,
    nativeSymbol: derived.nativeSymbol,
    blockExplorerUrl: row.blockexplorer || null,
    apiUrl: row.apiurl || null,
    isTestnet: derived.isTestnet,
    freeTierAvailable: !FREE_TIER_BLOCKED_CHAIN_IDS.has(row.chainid),
    paidTierAvailable: true,
    status: Number.isFinite(status) ? status : null,
    comment: row.comment?.trim() || null,
    aliases: unique([...derived.aliases, row.chainid]),
    source,
  };
}

async function fetchEtherscanChainlistRows(): Promise<EtherscanChainRow[] | null> {
  try {
    const res = await fetch(ETHERSCAN_CHAINLIST_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as EtherscanChainlistResponse;
    if (!Array.isArray(json.result) || json.result.length === 0) return null;
    return json.result;
  } catch (error) {
    console.error('[supportedChains] chainlist fetch failed:', error);
    return null;
  }
}

async function getEtherscanChains(): Promise<{
  chains: SupportedChainEntry[];
  source: Extract<SupportedChainRegistrySource, 'etherscan_chainlist' | 'etherscan_snapshot'>;
}> {
  const cached = getCached<{
    chains: SupportedChainEntry[];
    source: Extract<SupportedChainRegistrySource, 'etherscan_chainlist' | 'etherscan_snapshot'>;
  }>(CHAINLIST_CACHE_KEY);
  if (cached) return cached;

  const liveRows = await fetchEtherscanChainlistRows();
  if (liveRows) {
    const live = {
      chains: liveRows.map((row) => mapEtherscanRow(row, 'etherscan_chainlist')),
      source: 'etherscan_chainlist' as const,
    };
    setCache(CHAINLIST_CACHE_KEY, live, CHAINLIST_CACHE_TTL_MS);
    return live;
  }

  const fallback = {
    chains: ETHERSCAN_CHAINLIST_SNAPSHOT.map((row) => mapEtherscanRow(row, 'etherscan_snapshot')),
    source: 'etherscan_snapshot' as const,
  };
  setCache(CHAINLIST_CACHE_KEY, fallback, CHAINLIST_CACHE_TTL_MS);
  return fallback;
}

function combinedSource(
  family: SupportedChainQueryFamily,
  evmSource: Extract<SupportedChainRegistrySource, 'etherscan_chainlist' | 'etherscan_snapshot'>,
): SupportedChainRegistrySource {
  if (family === 'evm') return evmSource;
  if (family === 'solana' || family === 'tron') return 'manual';
  return 'composite';
}

function candidateStrings(entry: SupportedChainEntry): string[] {
  return unique([
    entry.slug,
    entry.label,
    entry.displayName,
    entry.chainId,
    ...entry.aliases,
  ]);
}

function searchScore(entry: SupportedChainEntry, query: string): number | null {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return 100;

  let best: number | null = null;
  for (const candidate of candidateStrings(entry)) {
    const normalizedCandidate = normalizeQuery(candidate);
    if (!normalizedCandidate) continue;

    let score: number | null = null;
    if (normalizedCandidate === normalizedQuery) score = 0;
    else if (normalizedCandidate.startsWith(normalizedQuery)) score = 1;
    else if (normalizedCandidate.includes(normalizedQuery)) score = 2;
    else if (normalizedQuery.includes(normalizedCandidate) && normalizedCandidate.length >= 4) score = 3;

    if (score == null) continue;
    if (best == null || score < best) best = score;
  }

  return best;
}

function sortEntries(a: SupportedChainEntry, b: SupportedChainEntry, query = ''): number {
  const scoreA = searchScore(a, query) ?? Number.POSITIVE_INFINITY;
  const scoreB = searchScore(b, query) ?? Number.POSITIVE_INFINITY;
  if (scoreA !== scoreB) return scoreA - scoreB;
  if (a.family !== b.family) {
    const order: Record<SupportedChainFamily, number> = { solana: 0, tron: 1, evm: 2 };
    return order[a.family] - order[b.family];
  }
  if (a.isTestnet !== b.isTestnet) return Number(a.isTestnet) - Number(b.isTestnet);
  if (a.slug.length !== b.slug.length) return a.slug.length - b.slug.length;
  return a.displayName.localeCompare(b.displayName);
}

export async function resolveSupportedEvmChain(
  chain: string,
  chainId?: string | null,
): Promise<SupportedChainEntry | null> {
  const { chains } = await getEtherscanChains();
  const normalizedChainId = chainId?.trim();
  if (normalizedChainId) {
    return chains.find((entry) => entry.chainId === normalizedChainId) ?? null;
  }

  const normalizedChain = chain.trim().toLowerCase();
  const query = normalizedChain === 'evm' ? 'ethereum' : normalizedChain;
  const match = [...chains]
    .map((entry) => ({ entry, score: searchScore(entry, query) }))
    .filter((row): row is { entry: SupportedChainEntry; score: number } => row.score != null)
    .sort((left, right) => sortEntries(left.entry, right.entry, query))
    .at(0);

  return match?.entry ?? null;
}

export async function searchSupportedChains(
  options: SearchSupportedChainsOptions = {},
): Promise<SupportedChainSearchResult> {
  const family = options.family ?? 'all';
  const q = options.q?.trim() ?? '';
  const includeTestnets = options.includeTestnets ?? q.length > 0;
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const { chains: evmChains, source: evmSource } = await getEtherscanChains();
  const pool = family === 'evm'
    ? evmChains
    : family === 'solana'
      ? MANUAL_SUPPORTED_CHAINS.filter((entry) => entry.family === 'solana')
      : family === 'tron'
        ? MANUAL_SUPPORTED_CHAINS.filter((entry) => entry.family === 'tron')
        : [...MANUAL_SUPPORTED_CHAINS, ...evmChains];

  const filtered = pool
    .filter((entry) => includeTestnets || !entry.isTestnet)
    .filter((entry) => !q || searchScore(entry, q) != null)
    .sort((left, right) => sortEntries(left, right, q));

  return {
    q,
    family,
    total: filtered.length,
    source: combinedSource(family, evmSource),
    chains: filtered.slice(0, limit),
  };
}
