import { fetchNews, type NewsRecord } from '$lib/server/marketFeedService';
import { getMarketReferenceSources } from '$lib/server/marketReferenceSources';
import { fetchTopicPosts, hasLunarCrushKey, type LunarCrushPost } from '$lib/server/lunarcrush';

const TOPIC_MAP: Record<string, string> = {
	BTC: 'bitcoin',
	ETH: 'ethereum',
	SOL: 'solana',
	DOGE: 'dogecoin',
	XRP: 'ripple',
	BNB: 'bnb',
	ADA: 'cardano',
	AVAX: 'avalanche',
	DOT: 'polkadot',
	MATIC: 'polygon',
	LINK: 'chainlink',
	UNI: 'uniswap',
};

export interface UnifiedNewsItem {
	id: string;
	source: string;
	title: string;
	summary: string;
	link: string;
	publishedAt: number;
	sentiment: 'bullish' | 'bearish' | 'neutral';
	interactions: number;
	importance: number;
	network: string;
	creator: string;
}

export interface MarketNewsData {
	records: UnifiedNewsItem[];
	total: number;
	offset: number;
	limit: number;
	hasMore: boolean;
	sources: {
		rss: number;
		social: number;
	};
	referenceSources: ReturnType<typeof getMarketReferenceSources>;
}

function lcSentimentToTag(s: number): 'bullish' | 'bearish' | 'neutral' {
	if (s >= 4) return 'bullish';
	if (s <= 2) return 'bearish';
	return 'neutral';
}

function computeImportance(item: {
	interactions: number;
	publishedAt: number;
	creatorFollowers?: number;
}): number {
	const engScore = Math.min(50, Math.log10(Math.max(item.interactions, 1) + 1) * 12);
	const ageHours = Math.max(0, (Date.now() - item.publishedAt) / 3_600_000);
	const recencyScore = Math.max(0, 30 - ageHours * 0.3);
	const followers = item.creatorFollowers ?? 0;
	const influenceScore = Math.min(20, Math.log10(Math.max(followers, 1) + 1) * 4);
	return Math.round(engScore + recencyScore + influenceScore);
}

export async function loadMarketNews(args: {
	limit: number;
	offset: number;
	token: string;
	interval: string;
	sortBy: 'importance' | 'time';
}): Promise<MarketNewsData> {
	const topic = TOPIC_MAP[args.token] ?? args.token.toLowerCase();
	const [rssRecords, lcPosts] = await Promise.allSettled([
		fetchNews(50),
		hasLunarCrushKey() ? fetchTopicPosts(topic, args.interval, 50) : Promise.resolve([]),
	]);

	const rss = rssRecords.status === 'fulfilled' ? rssRecords.value : [];
	const social = lcPosts.status === 'fulfilled' ? lcPosts.value : [];

	const rssItems: UnifiedNewsItem[] = rss.map((r: NewsRecord) => ({
		id: r.id,
		source: r.source,
		title: r.title,
		summary: r.summary,
		link: r.link,
		publishedAt: r.publishedAt,
		sentiment: r.sentiment,
		interactions: 0,
		importance: computeImportance({ interactions: 0, publishedAt: r.publishedAt }),
		network: 'rss',
		creator: r.source,
	}));

	const socialItems: UnifiedNewsItem[] = social.map((p: LunarCrushPost) => ({
		id: `lc-${p.id}`,
		source: `LunarCrush:${p.network}`,
		title: p.title || p.body.slice(0, 120),
		summary: p.body,
		link: p.link,
		publishedAt: p.publishedAt,
		sentiment: lcSentimentToTag(p.sentiment),
		interactions: p.interactions,
		importance: computeImportance({
			interactions: p.interactions,
			publishedAt: p.publishedAt,
			creatorFollowers: p.creatorFollowers,
		}),
		network: p.network,
		creator: p.creator,
	}));

	const seen = new Set<string>();
	const deduplicated = [...rssItems, ...socialItems].filter((item) => {
		const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	if (args.sortBy === 'importance') {
		deduplicated.sort((a, b) => b.importance - a.importance);
	} else {
		deduplicated.sort((a, b) => b.publishedAt - a.publishedAt);
	}

	const records = deduplicated.slice(args.offset, args.offset + args.limit);

	return {
		records,
		total: deduplicated.length,
		offset: args.offset,
		limit: args.limit,
		hasMore: args.offset + args.limit < deduplicated.length,
		sources: {
			rss: rss.length,
			social: social.length,
		},
		referenceSources: getMarketReferenceSources(),
	};
}
