// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Token Registry (Binance Supported Pairs)
// ═══════════════════════════════════════════════════════════════

export interface TokenDef {
  symbol: string;       // e.g. 'BTC'
  name: string;
  icon: string;
  color: string;
  binanceSymbol: string; // e.g. 'BTCUSDT'
  decimals: number;      // price display decimals
}

export const TOKENS: TokenDef[] = [
  // ── Major ──
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿', color: '#f7931a', binanceSymbol: 'BTCUSDT', decimals: 2 },
  { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ', color: '#627eea', binanceSymbol: 'ETHUSDT', decimals: 2 },
  { symbol: 'SOL', name: 'Solana', icon: '◎', color: '#14f195', binanceSymbol: 'SOLUSDT', decimals: 2 },
  { symbol: 'BNB', name: 'BNB', icon: '⬡', color: '#f3ba2f', binanceSymbol: 'BNBUSDT', decimals: 2 },
  { symbol: 'XRP', name: 'XRP', icon: '✕', color: '#23292f', binanceSymbol: 'XRPUSDT', decimals: 4 },
  { symbol: 'ADA', name: 'Cardano', icon: '₳', color: '#0033ad', binanceSymbol: 'ADAUSDT', decimals: 4 },

  // ── L1 / L2 ──
  { symbol: 'AVAX', name: 'Avalanche', icon: 'A', color: '#e84142', binanceSymbol: 'AVAXUSDT', decimals: 2 },
  { symbol: 'DOT', name: 'Polkadot', icon: '●', color: '#e6007a', binanceSymbol: 'DOTUSDT', decimals: 3 },
  { symbol: 'MATIC', name: 'Polygon', icon: '⬠', color: '#8247e5', binanceSymbol: 'MATICUSDT', decimals: 4 },
  { symbol: 'NEAR', name: 'NEAR', icon: 'N', color: '#00ec97', binanceSymbol: 'NEARUSDT', decimals: 3 },
  { symbol: 'ARB', name: 'Arbitrum', icon: 'A', color: '#28a0f0', binanceSymbol: 'ARBUSDT', decimals: 4 },
  { symbol: 'OP', name: 'Optimism', icon: 'O', color: '#ff0420', binanceSymbol: 'OPUSDT', decimals: 4 },
  { symbol: 'SUI', name: 'Sui', icon: 'S', color: '#6fbcf0', binanceSymbol: 'SUIUSDT', decimals: 4 },
  { symbol: 'APT', name: 'Aptos', icon: 'A', color: '#2dd8a3', binanceSymbol: 'APTUSDT', decimals: 3 },
  { symbol: 'ATOM', name: 'Cosmos', icon: '⚛', color: '#2e3148', binanceSymbol: 'ATOMUSDT', decimals: 3 },
  { symbol: 'SEI', name: 'Sei', icon: 'S', color: '#9b1c2e', binanceSymbol: 'SEIUSDT', decimals: 4 },
  { symbol: 'INJ', name: 'Injective', icon: 'I', color: '#00f2fe', binanceSymbol: 'INJUSDT', decimals: 3 },
  { symbol: 'TIA', name: 'Celestia', icon: 'T', color: '#7b2bf9', binanceSymbol: 'TIAUSDT', decimals: 3 },
  { symbol: 'FTM', name: 'Fantom', icon: 'F', color: '#1969ff', binanceSymbol: 'FTMUSDT', decimals: 4 },

  // ── DeFi ──
  { symbol: 'LINK', name: 'Chainlink', icon: '⬡', color: '#375bd2', binanceSymbol: 'LINKUSDT', decimals: 3 },
  { symbol: 'UNI', name: 'Uniswap', icon: '🦄', color: '#ff007a', binanceSymbol: 'UNIUSDT', decimals: 3 },
  { symbol: 'AAVE', name: 'Aave', icon: '👻', color: '#b6509e', binanceSymbol: 'AAVEUSDT', decimals: 2 },
  { symbol: 'MKR', name: 'Maker', icon: 'M', color: '#1aab9b', binanceSymbol: 'MKRUSDT', decimals: 2 },
  { symbol: 'CRV', name: 'Curve', icon: 'C', color: '#0066ff', binanceSymbol: 'CRVUSDT', decimals: 4 },
  { symbol: 'SNX', name: 'Synthetix', icon: 'S', color: '#00d1ff', binanceSymbol: 'SNXUSDT', decimals: 3 },
  { symbol: 'LDO', name: 'Lido', icon: 'L', color: '#00a3ff', binanceSymbol: 'LDOUSDT', decimals: 4 },
  { symbol: 'PENDLE', name: 'Pendle', icon: 'P', color: '#3bbbef', binanceSymbol: 'PENDLEUSDT', decimals: 4 },
  { symbol: 'DYDX', name: 'dYdX', icon: 'D', color: '#6966ff', binanceSymbol: 'DYDXUSDT', decimals: 4 },
  { symbol: 'COMP', name: 'Compound', icon: 'C', color: '#00d395', binanceSymbol: 'COMPUSDT', decimals: 3 },

  // ── Meme ──
  { symbol: 'DOGE', name: 'Dogecoin', icon: 'Ð', color: '#c2a633', binanceSymbol: 'DOGEUSDT', decimals: 5 },
  { symbol: 'SHIB', name: 'Shiba Inu', icon: 'S', color: '#ffa409', binanceSymbol: 'SHIBUSDT', decimals: 8 },
  { symbol: 'PEPE', name: 'Pepe', icon: '🐸', color: '#479f53', binanceSymbol: 'PEPEUSDT', decimals: 8 },
  { symbol: 'BONK', name: 'Bonk', icon: 'B', color: '#f8a426', binanceSymbol: 'BONKUSDT', decimals: 8 },
  { symbol: 'WIF', name: 'dogwifhat', icon: 'W', color: '#8b6914', binanceSymbol: 'WIFUSDT', decimals: 4 },
  { symbol: 'FLOKI', name: 'Floki', icon: 'F', color: '#d89e2a', binanceSymbol: 'FLOKIUSDT', decimals: 8 },

  // ── AI / Gaming / Other ──
  { symbol: 'FET', name: 'Fetch.ai', icon: 'F', color: '#1b2a4a', binanceSymbol: 'FETUSDT', decimals: 4 },
  { symbol: 'RNDR', name: 'Render', icon: 'R', color: '#000', binanceSymbol: 'RNDRUSDT', decimals: 3 },
  { symbol: 'GRT', name: 'The Graph', icon: 'G', color: '#6747ed', binanceSymbol: 'GRTUSDT', decimals: 4 },
  { symbol: 'IMX', name: 'Immutable', icon: 'I', color: '#02a4ff', binanceSymbol: 'IMXUSDT', decimals: 4 },
  { symbol: 'GALA', name: 'Gala', icon: 'G', color: '#000', binanceSymbol: 'GALAUSDT', decimals: 5 },
  { symbol: 'AXS', name: 'Axie', icon: 'A', color: '#0055d5', binanceSymbol: 'AXSUSDT', decimals: 3 },
  { symbol: 'SAND', name: 'Sandbox', icon: 'S', color: '#00adef', binanceSymbol: 'SANDUSDT', decimals: 4 },
  { symbol: 'MANA', name: 'Decentra', icon: 'M', color: '#ff2d55', binanceSymbol: 'MANAUSDT', decimals: 4 },

  // ── Infra / Storage / Misc ──
  { symbol: 'FIL', name: 'Filecoin', icon: 'F', color: '#0090ff', binanceSymbol: 'FILUSDT', decimals: 3 },
  { symbol: 'AR', name: 'Arweave', icon: 'A', color: '#222', binanceSymbol: 'ARUSDT', decimals: 3 },
  { symbol: 'STX', name: 'Stacks', icon: 'S', color: '#5546ff', binanceSymbol: 'STXUSDT', decimals: 4 },
  { symbol: 'ALGO', name: 'Algorand', icon: 'A', color: '#000', binanceSymbol: 'ALGOUSDT', decimals: 4 },
  { symbol: 'VET', name: 'VeChain', icon: 'V', color: '#15bdff', binanceSymbol: 'VETUSDT', decimals: 5 },
  { symbol: 'HBAR', name: 'Hedera', icon: 'H', color: '#000', binanceSymbol: 'HBARUSDT', decimals: 5 },
  { symbol: 'ICP', name: 'Internet Computer', icon: 'I', color: '#29abe2', binanceSymbol: 'ICPUSDT', decimals: 3 },
  { symbol: 'TRX', name: 'TRON', icon: 'T', color: '#ef0027', binanceSymbol: 'TRXUSDT', decimals: 5 },
  { symbol: 'LTC', name: 'Litecoin', icon: 'Ł', color: '#345d9d', binanceSymbol: 'LTCUSDT', decimals: 2 },
  { symbol: 'BCH', name: 'Bitcoin Cash', icon: 'B', color: '#0ac18e', binanceSymbol: 'BCHUSDT', decimals: 2 },
  { symbol: 'ETC', name: 'Ethereum Classic', icon: 'E', color: '#328332', binanceSymbol: 'ETCUSDT', decimals: 3 },
  { symbol: 'RUNE', name: 'THORChain', icon: 'R', color: '#33ff99', binanceSymbol: 'RUNEUSDT', decimals: 3 },
  { symbol: 'ENS', name: 'ENS', icon: 'E', color: '#5298ff', binanceSymbol: 'ENSUSDT', decimals: 3 },
  { symbol: 'JUP', name: 'Jupiter', icon: 'J', color: '#c7f284', binanceSymbol: 'JUPUSDT', decimals: 4 },
  { symbol: 'PYTH', name: 'Pyth', icon: 'P', color: '#e6dafe', binanceSymbol: 'PYTHUSDT', decimals: 4 },
  { symbol: 'WLD', name: 'Worldcoin', icon: 'W', color: '#000', binanceSymbol: 'WLDUSDT', decimals: 4 },
  { symbol: 'BLUR', name: 'Blur', icon: 'B', color: '#ff6600', binanceSymbol: 'BLURUSDT', decimals: 4 },
  { symbol: 'ORDI', name: 'ORDI', icon: 'O', color: '#f5f5f5', binanceSymbol: 'ORDIUSDT', decimals: 3 },
  { symbol: '1000SATS', name: '1000SATS', icon: 'S', color: '#f7931a', binanceSymbol: '1000SATSUSDT', decimals: 7 },
];

// Quick lookup
export const TOKEN_MAP = new Map(TOKENS.map(t => [t.symbol, t]));
export const BINANCE_MAP = new Map(TOKENS.map(t => [t.binanceSymbol, t]));

// Get all binance symbols
export function getAllBinanceSymbols(): string[] {
  return TOKENS.map(t => t.binanceSymbol);
}

// Chart-tradeable pairs (all tokens as USDT pairs)
export function getChartPairs(): string[] {
  return TOKENS.map(t => `${t.symbol}/USDT`);
}

// Categories
export const TOKEN_CATEGORIES = {
  major: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA'],
  l1l2: ['AVAX', 'DOT', 'MATIC', 'NEAR', 'ARB', 'OP', 'SUI', 'APT', 'ATOM', 'SEI', 'INJ', 'TIA', 'FTM'],
  defi: ['LINK', 'UNI', 'AAVE', 'MKR', 'CRV', 'SNX', 'LDO', 'PENDLE', 'DYDX', 'COMP'],
  meme: ['DOGE', 'SHIB', 'PEPE', 'BONK', 'WIF', 'FLOKI'],
  ai_gaming: ['FET', 'RNDR', 'GRT', 'IMX', 'GALA', 'AXS', 'SAND', 'MANA'],
  infra: ['FIL', 'AR', 'STX', 'ALGO', 'VET', 'HBAR', 'ICP', 'TRX', 'LTC', 'BCH', 'ETC', 'RUNE', 'ENS', 'JUP', 'PYTH', 'WLD', 'BLUR', 'ORDI', '1000SATS'],
};
