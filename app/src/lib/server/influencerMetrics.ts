import type {
  InfluencerMetricBinding,
  InfluencerMetricsPayload,
  InfluencerMetricsReport,
  InfluencerProviderState,
  InfluencerProviderStatus,
} from '$lib/contracts/influencerMetrics';
import { fetchTotalTvl } from '$lib/api/defillama';
import { fetchCoinMetricsData } from '$lib/server/coinmetrics';
import {
  fetchActiveAddresses,
  fetchDexVolume24hUsd,
  fetchWhaleActivity,
  hasDuneKey,
} from '$lib/server/dune';
import { fetchFearGreed } from '$lib/server/feargreed';
import { fetchTopicSocial, hasLunarCrushKey } from '$lib/server/lunarcrush';
import { getCached, setCache } from '$lib/server/providers/cache';

const CACHE_TTL_MS = 5 * 60_000;
const SYMBOL_SUFFIX_RE = /(USDT|USDC|USD|PERP)$/;
const REPORT_AS_OF_DATE = '2026-04-22';
const REPORT_SAMPLE_WINDOW = '2026-03-01..2026-04-22';

type SupportedOnChainAsset = 'btc' | 'eth';

interface InfluencerResearchReportInput {
  baseAsset: string;
  coinMetricsSupported: boolean;
  duneEnabled: boolean;
  lunarEnabled: boolean;
  onchain: InfluencerMetricsPayload['onchain'];
  defi: InfluencerMetricsPayload['defi'];
  sentiment: InfluencerMetricsPayload['sentiment'];
}

function normalizeBaseAsset(symbol: string): string {
  return symbol.replace(SYMBOL_SUFFIX_RE, '').toUpperCase();
}

function toCoinMetricsAsset(baseAsset: string): SupportedOnChainAsset | null {
  if (baseAsset === 'BTC') return 'btc';
  if (baseAsset === 'ETH') return 'eth';
  return null;
}

function sectionStatus(available: number, total: number, fallback: InfluencerProviderStatus): InfluencerProviderStatus {
  if (available <= 0) return fallback;
  if (available >= total) return 'live';
  return 'partial';
}

function providerState(
  provider: string,
  available: number,
  total: number,
  fallback: InfluencerProviderStatus,
  detail?: string,
): InfluencerProviderState {
  return {
    provider,
    status: sectionStatus(available, total, fallback),
    detail,
  };
}

function countPresent(values: Array<number | null>): number {
  return values.filter((value) => value != null && Number.isFinite(value)).length;
}

function hasMetric(value: number | null): boolean {
  return value != null && Number.isFinite(value);
}

function binding(
  label: string,
  status: InfluencerMetricBinding['status'],
  note: string,
  extra: Omit<InfluencerMetricBinding, 'label' | 'status' | 'note'> = {},
): InfluencerMetricBinding {
  return {
    label,
    status,
    note,
    ...extra,
  };
}

function buildInfluencerResearchReport(input: InfluencerResearchReportInput): InfluencerMetricsReport {
  const activeAddressesStatus: InfluencerProviderStatus = hasMetric(input.onchain.activeAddresses)
    ? 'live'
    : !input.duneEnabled
      ? 'blocked'
      : input.baseAsset === 'ETH'
        ? 'partial'
        : 'planned';

  const exchangeFlowStatus: InfluencerProviderStatus = hasMetric(input.onchain.exchangeNetflowUsd)
    ? 'live'
    : input.coinMetricsSupported
      ? 'partial'
      : 'planned';

  const mvrvStatus: InfluencerProviderStatus = hasMetric(input.onchain.mvrv)
    ? 'live'
    : input.coinMetricsSupported
      ? 'partial'
      : 'planned';

  const whaleStatus: InfluencerProviderStatus = hasMetric(input.onchain.whaleActivity)
    ? 'live'
    : input.coinMetricsSupported || input.duneEnabled
      ? 'partial'
      : 'planned';

  const tvlStatus: InfluencerProviderStatus = hasMetric(input.defi.totalTvlUsd) ? 'live' : 'partial';
  const dexStatus: InfluencerProviderStatus = hasMetric(input.defi.dexVolume24hUsd)
    ? 'live'
    : input.duneEnabled
      ? 'partial'
      : 'blocked';
  const fearGreedStatus: InfluencerProviderStatus = hasMetric(input.sentiment.fearGreed) ? 'live' : 'partial';
  const socialStatus: InfluencerProviderStatus = hasMetric(input.sentiment.socialPostsActive)
    ? 'live'
    : input.lunarEnabled
      ? 'partial'
      : 'blocked';

  return {
    asOfDate: REPORT_AS_OF_DATE,
    scope: {
      platform: 'X',
      sampleWindow: REPORT_SAMPLE_WINDOW,
      accountSet: [
        '@glassnode',
        '@cryptorover',
        '@coinbureau',
        '@ecxx_Official',
        '@BSCNews',
        '@ChainGainIO',
        '@KongBTC',
      ],
      filters: ['high-influence crypto accounts', 'min_faves >= 30', 'on-chain keywords'],
    },
    methodology: [
      '2026-04-22 operator research brief를 structured report로 정규화했다.',
      '표본 기간은 2026년 3월부터 2026년 4월 22일까지의 X 포스트 요약이다.',
      '숫자 payload와 별도로 metric leaderboard, tool packages, pipeline bindings를 함께 내려준다.',
    ],
    keyTakeaways: [
      '표본 계정들은 가격 차트 단독 해석보다 온체인 지표를 상위 증거로 취급한다.',
      '핵심 일일 스택은 Active Addresses, Exchange Flow, MVRV/Realized Price, TVL이다.',
      'Realized Price와 ETF/기관 자금은 중요하지만 현재 app pipeline에는 canonical live feed가 없다.',
      'LunarCrush social은 보조 sentiment proxy로 남기고, 핵심 판단은 on-chain과 DeFi 쪽에 둔다.',
    ],
    primaryDailyStack: {
      label: 'Influencer Core Four',
      metrics: ['Active Addresses', 'Exchange Flow', 'MVRV/Realized Price', 'TVL'],
      note: '시장 사이클 80%를 읽는 공통 조합으로 구조화했다.',
    },
    toolPackages: [
      {
        id: 'glassnode-core',
        label: 'Glassnode core pack',
        tools: ['Glassnode'],
        metrics: ['Realized Price', 'STH Cost Basis', 'Active Investors Mean', 'MVRV'],
        description: '사이클 밸류에이션과 cost-basis anchor 추적용.',
      },
      {
        id: 'cryptoquant-flow',
        label: 'CryptoQuant flow pack',
        tools: ['CryptoQuant'],
        metrics: ['Exchange Outflows', 'Exchange Reserve', 'Active Addresses'],
        description: '매도 압력과 축적 흐름을 해석하는 기본 툴킷.',
      },
      {
        id: 'defi-llama-dune',
        label: 'DeFi usage pack',
        tools: ['DeFiLlama', 'Dune'],
        metrics: ['TVL', 'DEX Volume', 'Volume/TVL', 'Active Addresses'],
        description: '실사용과 유동성 회전을 함께 보는 DeFi/L2 팩.',
      },
      {
        id: 'macro-sentiment',
        label: 'Macro + sentiment pack',
        tools: ['Fear & Greed', 'MacroMicro'],
        metrics: ['Fear & Greed Index', 'Institutional Flows', 'BTC vs CPI/Oil'],
        description: '단기 감정과 매크로 배경을 보조 레이어로 사용.',
      },
    ],
    metricLeaderboard: [
      {
        id: 'active_addresses',
        rank: 1,
        family: 'OnChain',
        label: 'Active Addresses',
        whyItMatters: '실사용자 증가와 네트워크 모멘텀의 선행 신호로 해석된다.',
        influencerUsage: '바닥/천장 탐지와 네트워크 성장 확인에 사용된다.',
        trackedBy: ['@cryptorover', '@BSCNews'],
        exampleMentions: [
          {
            account: '@cryptorover',
            observedOn: '2026-04-18',
            summary: 'Bitcoin active addresses momentum drops to lowest levels since 2018',
          },
          {
            account: '@BSCNews',
            observedOn: '2026-03',
            summary: 'Ethereum daily active addresses hit roughly 2M, cited from CryptoQuant',
          },
        ],
        bindings: [
          binding(
            'Dune active-address query',
            activeAddressesStatus,
            input.baseAsset === 'ETH'
              ? 'ETH 중심 쿼리를 canonical payload에 연결했다.'
              : '현재 Dune active-address query는 ETH 중심이라 BTC/SOL 등은 후속 확장이 필요하다.',
            {
              indicatorId: 'active_addresses',
              payloadPath: 'onchain.activeAddresses',
              providerKey: 'onchain',
            },
          ),
        ],
      },
      {
        id: 'exchange_flow',
        rank: 2,
        family: 'OnChain',
        label: 'Exchange Inflows / Outflows / Reserve',
        whyItMatters: '대규모 입출금은 매도 압력 또는 축적 신호로 해석된다.',
        influencerUsage: '대형 outflow 이벤트는 스마트머니 축적 근거로 빠르게 확산된다.',
        trackedBy: ['@BSCNews', '@ecxx_Official'],
        exampleMentions: [
          {
            account: '@BSCNews',
            observedOn: '2026-03-06',
            summary: '$3B BTC withdrawn from exchanges, citing Axel Adler Jr / CryptoQuant',
          },
          {
            account: '@ecxx_Official',
            observedOn: '2026-04-17',
            summary: 'Exchange inflows/outflows listed as a top-4 metric',
          },
        ],
        bindings: [
          binding(
            'Coin Metrics exchange reserve proxy',
            exchangeFlowStatus,
            '24h netflow와 7d change를 canonical on-chain flow fields로 연결했다.',
            {
              indicatorId: 'exchange_netflow',
              payloadPath: 'onchain.exchangeNetflowUsd',
              providerKey: 'onchain',
            },
          ),
        ],
      },
      {
        id: 'mvrv',
        rank: 3,
        family: 'OnChain',
        label: 'MVRV Z-Score / Ratio',
        whyItMatters: '사이클 과열과 저평가 구간을 빠르게 판독하는 valuation proxy다.',
        influencerUsage: '저점 누적 구간과 고평가 구간을 구분하는 핵심 ratio로 사용된다.',
        trackedBy: ['@coinbureau', '@glassnode'],
        exampleMentions: [
          {
            account: '@coinbureau',
            observedOn: '2026-03-14',
            summary: 'BTC MVRV around 1.2, true bottoms discussed below 1.0',
          },
        ],
        bindings: [
          binding(
            'Coin Metrics MVRV proxy',
            mvrvStatus,
            'community-grade MVRV를 canonical on-chain valuation field에 연결했다.',
            {
              indicatorId: 'mvrv_ratio',
              payloadPath: 'onchain.mvrv',
              providerKey: 'onchain',
            },
          ),
          binding(
            'Glassnode MVRV reference',
            'reference_only',
            '운영자가 premium source와 대조할 수 있는 reference site.',
            { referenceSite: 'Glassnode' },
          ),
        ],
      },
      {
        id: 'realized_price',
        rank: 4,
        family: 'OnChain',
        label: 'Realized Price / STH Cost Basis / True Market Mean',
        whyItMatters: '가격이 회귀하는 cost-basis anchor로 사용되는 핵심 price model이다.',
        influencerUsage: 'spot과 realized price 간 괴리를 사이클 과열/저평가 판단에 사용한다.',
        trackedBy: ['@glassnode', '@KongBTC'],
        exampleMentions: [
          {
            account: '@glassnode',
            observedOn: '2026-04-10',
            summary: 'STH Cost Basis and Realized Price levels shared as cycle anchors',
          },
          {
            account: '@KongBTC',
            observedOn: '2026-03-22',
            summary: 'Trader realized price cited as a level price gravitates back toward',
          },
        ],
        bindings: [
          binding(
            'Glassnode price-model reference',
            'reference_only',
            '운영자 검증용 reference source이며 아직 app canonical payload에는 live field가 없다.',
            { referenceSite: 'Glassnode' },
          ),
          binding(
            'Canonical price-model producer',
            'planned',
            'Realized Price / STH Cost Basis 전용 free proxy 또는 licensed feed를 후속 slice로 분리해야 한다.',
          ),
        ],
      },
      {
        id: 'whale_activity',
        rank: 5,
        family: 'OnChain',
        label: 'Whale Transactions / Accumulation',
        whyItMatters: '고래와 기관성 자금 이동을 축적/분배 신호로 해석한다.',
        influencerUsage: '대형 트랜잭션과 순유입 방향으로 스마트머니 움직임을 추적한다.',
        trackedBy: ['@ecxx_Official'],
        exampleMentions: [
          {
            account: '@ecxx_Official',
            observedOn: '2026-04',
            summary: 'Whale Transactions were listed among the daily top-4 checks',
          },
        ],
        bindings: [
          binding(
            'Coin Metrics + Dune whale proxy',
            whaleStatus,
            'whale count와 whale netflow proxy를 canonical payload에 연결했다.',
            {
              indicatorId: 'whale_activity',
              payloadPath: 'onchain.whaleActivity',
              providerKey: 'onchain',
            },
          ),
        ],
      },
      {
        id: 'tvl',
        rank: 6,
        family: 'DeFi',
        label: 'TVL',
        whyItMatters: '유동성과 채택도를 동시에 보여주는 가장 직접적인 DeFi usage proxy다.',
        influencerUsage: '프로토콜/체인 이벤트가 실제 자금 이동으로 이어졌는지 확인한다.',
        trackedBy: ['@Optimism', '@chainlink'],
        exampleMentions: [
          {
            account: '@Optimism',
            observedOn: '2026-04-15',
            summary: '$220M TVL migrated in three days around ether.fi activity',
          },
          {
            account: '@chainlink',
            observedOn: '2026-03-10',
            summary: 'Jupiter TVL cited near $2.8B',
          },
        ],
        bindings: [
          binding(
            'DeFiLlama total TVL',
            tvlStatus,
            '전체 TVL과 24h change를 canonical DeFi payload로 연결했다.',
            {
              indicatorId: 'total_value_locked',
              payloadPath: 'defi.totalTvlUsd',
              providerKey: 'defi',
            },
          ),
        ],
      },
      {
        id: 'dex_volume',
        rank: 7,
        family: 'DeFi',
        label: 'DEX Volume / Volume per TVL',
        whyItMatters: 'TVL만으로는 보이지 않는 유동성 회전 효율과 wash-trade 가능성을 분리한다.',
        influencerUsage: 'TVL 이벤트와 같이 묶어 체인의 실사용 강도를 판단한다.',
        trackedBy: ['@DefiLlama', '@Dune'],
        exampleMentions: [
          {
            account: '@DefiLlama',
            observedOn: '2026-03~04',
            summary: 'DEX volume and volume-per-TVL were repeatedly paired with TVL events',
          },
        ],
        bindings: [
          binding(
            'Dune DEX volume query',
            dexStatus,
            '24h DEX volume을 canonical payload로 연결했다.',
            {
              indicatorId: 'dex_volume_24h',
              payloadPath: 'defi.dexVolume24hUsd',
              providerKey: 'defi',
            },
          ),
          binding(
            'Derived volume/TVL ratio',
            hasMetric(input.defi.dexVolumeTvlRatio) ? 'live' : dexStatus,
            'TVL과 DEX volume으로 volume-per-TVL 효율성을 파생 계산한다.',
            {
              indicatorId: 'dex_volume_tvl_ratio',
              payloadPath: 'defi.dexVolumeTvlRatio',
              providerKey: 'defi',
            },
          ),
        ],
      },
      {
        id: 'fear_greed',
        rank: 8,
        family: 'DerivativesMacro',
        label: 'Fear & Greed Index',
        whyItMatters: '단기 레버리지와 감정 극단값을 빠르게 압축해 보여주는 sentiment proxy다.',
        influencerUsage: 'cycle extremes 또는 단기 역추세 후보 구간 체크에 사용된다.',
        trackedBy: ['@ChainGainIO'],
        exampleMentions: [
          {
            account: '@ChainGainIO',
            observedOn: '2026-04-18',
            summary: 'Fear & Greed at cycle extremes listed as the first daily tracker',
          },
        ],
        bindings: [
          binding(
            'Alternative.me Fear & Greed',
            fearGreedStatus,
            'Fear & Greed current value와 recent history를 canonical sentiment payload에 연결했다.',
            {
              indicatorId: 'fear_greed_index',
              payloadPath: 'sentiment.fearGreed',
              providerKey: 'sentiment',
            },
          ),
          binding(
            'LunarCrush social velocity',
            socialStatus,
            'X/Twitter 유사 관심도 보조 proxy로 social posts/dominance를 함께 유지한다.',
            {
              indicatorId: 'social_mention_velocity',
              payloadPath: 'sentiment.socialPostsActive',
              providerKey: 'sentiment',
            },
          ),
        ],
      },
      {
        id: 'institutional_flows',
        rank: 9,
        family: 'DerivativesMacro',
        label: 'Institutional Flows / ETF Inflows',
        whyItMatters: '현물 ETF와 기관 자금 유입은 구조적 수요를 설명하는 매크로 레이어다.',
        influencerUsage: 'BlackRock, Schwab 등 기관 flows를 daily checklist에 포함한다.',
        trackedBy: ['@ChainGainIO'],
        exampleMentions: [
          {
            account: '@ChainGainIO',
            observedOn: '2026-04',
            summary: 'Institutional flows and ETF watchlist disclosed as daily checks',
          },
        ],
        bindings: [
          binding(
            'Institutional flow producer',
            'planned',
            'ETF inflow / 기관자금 canonical feed는 아직 app route로 구현되지 않았다.',
          ),
          binding(
            'MacroMicro reference monitor',
            'reference_only',
            'BTC vs CPI/Oil 같은 macro overlay는 운영자 reference catalog에서 수동 대조 가능하다.',
            { referenceSite: 'MacroMicro' },
          ),
        ],
      },
      {
        id: 'network_growth_rate',
        rank: 10,
        family: 'OnChain',
        label: 'Network Growth Rate',
        whyItMatters: '신규 네트워크 참여 속도는 active addresses를 보완하는 확장 신호다.',
        influencerUsage: '2026년 표본에서 새롭게 top-4 후보로 부상한 보조 지표다.',
        trackedBy: ['@ecxx_Official'],
        exampleMentions: [
          {
            account: '@ecxx_Official',
            observedOn: '2026-04',
            summary: 'Network Growth Rate was highlighted alongside whale transactions',
          },
        ],
        bindings: [
          binding(
            'Network growth producer',
            'planned',
            '신규 주소 성장률은 아직 canonical payload에 별도 field가 없다.',
          ),
        ],
      },
    ],
    trendSummary: [
      '2026년 3~4월 표본에서는 Active Addresses 언급 빈도가 가장 높았고, ETH 활동성 최고치와 BTC 활동성 둔화가 동시에 회자됐다.',
      'Exchange outflow는 대형 이벤트가 발생할 때 즉시 바이럴되며, MVRV보다도 실전 해석에 자주 결합됐다.',
      'Glassnode식 realized-price 모델은 TA 보조선보다 상위 근거로 인용됐고, TVL은 DeFi/L2 채택 증거로 고정 사용됐다.',
    ],
    conclusions: [
      '현재 canonical live stack으로는 Active Addresses, Exchange Flow, MVRV, TVL, DEX volume, Fear & Greed까지 커버 가능하다.',
      'Realized Price/STH Cost Basis와 ETF/기관 유입은 중요하지만 아직 reference_only 또는 planned 상태로 남긴다.',
    ],
  };
}

export async function fetchInfluencerMetrics(symbol: string): Promise<InfluencerMetricsPayload> {
  const cacheKey = `influencer-metrics:${symbol}`;
  const cached = getCached<InfluencerMetricsPayload>(cacheKey);
  if (cached) return cached;

  const baseAsset = normalizeBaseAsset(symbol);
  const coinMetricsAsset = toCoinMetricsAsset(baseAsset);
  const duneEnabled = hasDuneKey();
  const lunarEnabled = hasLunarCrushKey();

  const [coinMetrics, fearGreed, social, totalTvl, dexVolume24h, activeAddresses, duneWhaleActivity] =
    await Promise.all([
      coinMetricsAsset ? fetchCoinMetricsData(coinMetricsAsset) : Promise.resolve(null),
      fetchFearGreed(30),
      lunarEnabled ? fetchTopicSocial(baseAsset) : Promise.resolve(null),
      fetchTotalTvl(),
      duneEnabled ? fetchDexVolume24hUsd() : Promise.resolve(null),
      duneEnabled && baseAsset === 'ETH' ? fetchActiveAddresses() : Promise.resolve(null),
      duneEnabled ? fetchWhaleActivity() : Promise.resolve(null),
    ]);

  const mvrv = coinMetrics?.onchainMetrics?.mvrv ?? null;
  const nupl = coinMetrics?.onchainMetrics?.nupl ?? null;
  const exchangeNetflowUsd = coinMetrics?.exchangeReserve?.netflow24h ?? null;
  const exchangeNetflowChange7dPct = coinMetrics?.exchangeReserve?.change7dPct ?? null;
  const whaleActivity = coinMetrics?.whaleData?.whaleCount ?? duneWhaleActivity ?? null;
  const whaleNetflowUsd = coinMetrics?.whaleData?.whaleNetflow ?? null;
  const totalTvlUsd = totalTvl?.tvl ?? null;
  const totalTvlChange24hPct = totalTvl?.change24h ?? null;
  const dexVolumeTvlRatio =
    totalTvlUsd != null && totalTvlUsd > 0 && dexVolume24h != null
      ? dexVolume24h / totalTvlUsd
      : null;

  const onchainAvailable = countPresent([
    mvrv,
    nupl,
    exchangeNetflowUsd,
    exchangeNetflowChange7dPct,
    activeAddresses,
    whaleActivity,
  ]);
  const defiAvailable = countPresent([totalTvlUsd, totalTvlChange24hPct, dexVolume24h, dexVolumeTvlRatio]);
  const sentimentAvailable = countPresent([
    fearGreed.current?.value ?? null,
    social?.postsActive ?? null,
    social?.interactions24h ?? null,
    social?.contributorsActive ?? null,
    social?.socialDominance ?? null,
  ]);

  const onchainDetail = [
    coinMetricsAsset ? 'coinmetrics proxy live' : 'coinmetrics unsupported for this asset',
    duneEnabled
      ? baseAsset === 'ETH'
        ? 'dune active-address coverage live'
        : 'dune active-address query currently eth-centric'
      : 'dune key missing',
  ].join(' · ');

  const defiDetail = [
    totalTvlUsd != null ? 'defillama TVL live' : 'defillama unavailable',
    duneEnabled ? 'dune dex volume live' : 'dune key missing for dex volume',
  ].join(' · ');

  const sentimentDetail = [
    fearGreed.current ? 'fear&greed live' : 'fear&greed unavailable',
    lunarEnabled ? 'lunarcrush social live' : 'lunarcrush key missing',
  ].join(' · ');

  const onchainFallback: InfluencerProviderStatus =
    coinMetricsAsset || (duneEnabled && baseAsset === 'ETH') ? 'partial' : 'planned';

  const onchain: InfluencerMetricsPayload['onchain'] = {
    mvrv,
    nupl,
    exchangeNetflowUsd,
    exchangeNetflowChange7dPct,
    activeAddresses,
    whaleActivity,
    whaleNetflowUsd,
  };

  const defi: InfluencerMetricsPayload['defi'] = {
    totalTvlUsd,
    totalTvlChange24hPct,
    dexVolume24hUsd: dexVolume24h,
    dexVolumeTvlRatio,
  };

  const sentiment: InfluencerMetricsPayload['sentiment'] = {
    fearGreed: fearGreed.current?.value ?? null,
    fearGreedClassification: fearGreed.current?.classification ?? null,
    fearGreedHistory: [...fearGreed.points].reverse().map((point) => point.value).slice(-30),
    socialPostsActive: social?.postsActive ?? null,
    socialInteractions24h: social?.interactions24h ?? null,
    socialContributorsActive: social?.contributorsActive ?? null,
    socialDominancePct: social?.socialDominance ?? null,
  };

  const payload: InfluencerMetricsPayload = {
    symbol,
    baseAsset,
    at: Date.now(),
    providers: {
      onchain: providerState(
        'coinmetrics+dune',
        onchainAvailable,
        6,
        onchainFallback,
        onchainDetail,
      ),
      defi: providerState(
        'defillama+dune',
        defiAvailable,
        4,
        totalTvlUsd != null || duneEnabled ? 'partial' : 'planned',
        defiDetail,
      ),
      sentiment: providerState(
        'alternative_me+lunarcrush',
        sentimentAvailable,
        5,
        fearGreed.current || lunarEnabled ? 'partial' : 'blocked',
        sentimentDetail,
      ),
    },
    onchain,
    defi,
    sentiment,
    report: buildInfluencerResearchReport({
      baseAsset,
      coinMetricsSupported: coinMetricsAsset != null,
      duneEnabled,
      lunarEnabled,
      onchain,
      defi,
      sentiment,
    }),
  };

  setCache(cacheKey, payload, CACHE_TTL_MS);
  return payload;
}

export { buildInfluencerResearchReport };
