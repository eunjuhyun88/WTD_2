export type MarketReferenceSourceCategory =
	| 'macro'
	| 'cycle'
	| 'venture'
	| 'derivatives'
	| 'defi'
	| 'onchain'
	| 'tokenomics'
	| 'smart_money'
	| 'airdrops'
	| 'price';

export interface MarketReferenceSource {
	id: string;
	name: string;
	category: MarketReferenceSourceCategory;
	url: string;
	pipelineRole: string;
	notes: string;
	ingestion: 'reference_only';
}

const MARKET_REFERENCE_SOURCES: MarketReferenceSource[] = [
	{
		id: 'macromicro',
		name: 'MacroMicro',
		category: 'macro',
		url: 'https://en.macromicro.me',
		pipelineRole: 'macro regime context',
		notes: 'CPI, rates, employment, and liquidity backdrop for crypto risk timing.',
		ingestion: 'reference_only',
	},
	{
		id: 'fuckbtc',
		name: 'fuckbtc.com',
		category: 'cycle',
		url: 'https://fuckbtc.com',
		pipelineRole: 'btc cycle monitor',
		notes: 'Halving, miner cost, and fear/greed context for Bitcoin cycle framing.',
		ingestion: 'reference_only',
	},
	{
		id: 'rootdata',
		name: 'RootData',
		category: 'venture',
		url: 'https://rootdata.com',
		pipelineRole: 'venture and funding map',
		notes: 'Project fundraising, investor overlap, and ecosystem capital flow checks.',
		ingestion: 'reference_only',
	},
	{
		id: 'coinglass',
		name: 'CoinGlass',
		category: 'derivatives',
		url: 'https://coinglass.com',
		pipelineRole: 'derivatives crowding check',
		notes: 'Funding, long/short ratio, and liquidation map benchmark.',
		ingestion: 'reference_only',
	},
	{
		id: 'defillama',
		name: 'DeFiLlama',
		category: 'defi',
		url: 'https://defillama.com',
		pipelineRole: 'defi liquidity baseline',
		notes: 'TVL, protocol ranking, stablecoin, and yield context.',
		ingestion: 'reference_only',
	},
	{
		id: 'dune',
		name: 'Dune Analytics',
		category: 'onchain',
		url: 'https://dune.com',
		pipelineRole: 'custom onchain queries',
		notes: 'Operator fallback for wallet, flow, and custom SQL dashboards.',
		ingestion: 'reference_only',
	},
	{
		id: 'tokenomist',
		name: 'Tokenomist',
		category: 'tokenomics',
		url: 'https://tokenomist.ai',
		pipelineRole: 'unlock schedule monitor',
		notes: 'Token unlock timing and supply-release risk checks.',
		ingestion: 'reference_only',
	},
	{
		id: 'arkham-intel',
		name: 'Arkham Intel',
		category: 'smart_money',
		url: 'https://intel.arkm.com',
		pipelineRole: 'smart money tracker',
		notes: 'Entity and whale wallet monitoring for exchange and institution flow.',
		ingestion: 'reference_only',
	},
	{
		id: 'airdrops-io',
		name: 'Airdrops.io',
		category: 'airdrops',
		url: 'https://airdrops.io',
		pipelineRole: 'airdrop opportunity feed',
		notes: 'Airdrop campaign discovery and watchlist inputs.',
		ingestion: 'reference_only',
	},
	{
		id: 'coingecko',
		name: 'CoinGecko',
		category: 'price',
		url: 'https://coingecko.com',
		pipelineRole: 'market cap and baseline pricing',
		notes: 'Price, market cap, category, and project metadata baseline.',
		ingestion: 'reference_only',
	},
];

export function getMarketReferenceSources(): MarketReferenceSource[] {
	return MARKET_REFERENCE_SOURCES.map((source) => ({ ...source }));
}
