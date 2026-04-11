import {
  abbreviateMiddle,
  buildWalletIntelDataset,
} from '$lib/wallet-intel/walletIntelController';
import type {
  WalletActionKind,
  WalletBehavior,
  WalletCluster,
  WalletEvidenceRow,
  WalletFlowLayer,
  WalletGraphEdge,
  WalletGraphNode,
  WalletIntelDataset,
  WalletMarketEvent,
  WalletMarketToken,
  WalletModeInput,
  WalletSummaryClaim,
  WalletTone,
} from '$lib/wallet-intel/walletIntelTypes';
import {
  fetchNormalTxList,
  fetchTokenTxList,
  type EtherscanNormalTx,
  type EtherscanTokenTx,
} from './etherscan';

type KnownCounterparty = {
  label: string;
  type: Exclude<WalletGraphNode['type'], 'token' | 'cluster'>;
  tone: WalletTone;
  tags: string[];
};

type NormalizedActivity = {
  id: string;
  kind: 'normal' | 'token';
  hash: string;
  timestamp: number;
  from: string;
  to: string;
  direction: 'in' | 'out';
  tokenSymbol: string;
  tokenAddress?: string;
  decimals: number;
  rawValue: string;
  amount: number;
  usdValue: number | null;
  counterparty: string;
  counterpartyMeta: KnownCounterparty | null;
  isContractInteraction: boolean;
};

type DerivedStats = {
  total: number;
  normalCount: number;
  tokenCount: number;
  inboundCount: number;
  outboundCount: number;
  uniqueCounterparties: number;
  uniqueTokens: number;
  cexTouches: number;
  bridgeTouches: number;
  contractTouches: number;
  firstTimestamp: number;
  lastTimestamp: number;
  topTokens: Array<{ symbol: string; txCount: number; usdValue: number | null; totalAmount: number }>;
  topCounterparties: Array<{
    address: string;
    label: string;
    type: WalletGraphNode['type'];
    tone: WalletTone;
    txCount: number;
    usdValue: number | null;
    tags: string[];
    directionBias: 'in' | 'out' | 'mixed';
  }>;
  latestActivity: NormalizedActivity;
};

const TOKEN_PRICE_USD: Record<string, number> = {
  ETH: 3284,
  WETH: 3284,
  BERA: 0.737,
  AERO: 1.42,
  ONDO: 1.09,
  PEPE: 0.0000124,
  WIF: 2.48,
  SKYAI: 0.052,
  ENA: 1.14,
  USDT: 1,
  USDC: 1,
  DAI: 1,
  WBTC: 73038,
};

const KNOWN_COUNTERPARTIES: Record<string, KnownCounterparty> = {
  '0x28c6c06298d514db089934071355e5743bf21d60': {
    label: 'Binance deposit cluster',
    type: 'cex',
    tone: 'bear',
    tags: ['cex', 'binance'],
  },
  '0x21a31ee1afc51d94c2efcca2092ad1028285549': {
    label: 'Binance hot wallet',
    type: 'cex',
    tone: 'bear',
    tags: ['cex', 'binance'],
  },
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': {
    label: 'Binance relay',
    type: 'cex',
    tone: 'bear',
    tags: ['cex', 'binance'],
  },
  '0xe592427a0aece92de3edee1f18e0157c05861564': {
    label: 'Uniswap V3 Router',
    type: 'contract',
    tone: 'warn',
    tags: ['dex', 'router'],
  },
  '0x111111125421ca6dc452d289314280a0f8842a65': {
    label: '1inch Router',
    type: 'contract',
    tone: 'warn',
    tags: ['dex', 'router'],
  },
  '0x5c7be9d7d5f72d2f0ed8b7dcb36b85f0cf4f9f17': {
    label: 'Across bridge relay',
    type: 'bridge',
    tone: 'cyan',
    tags: ['bridge', 'across'],
  },
  '0x8731d54e9d02c286767d56ac03e8037c07e01e98': {
    label: 'Stargate Router',
    type: 'bridge',
    tone: 'cyan',
    tags: ['bridge', 'stargate'],
  },
};

export async function buildWalletIntelServerDataset(
  input: WalletModeInput
): Promise<WalletIntelDataset> {
  const base = buildWalletIntelDataset(input);
  if (input.chain.toLowerCase() !== 'eth') return base;

  const [normalTxs, tokenTxs] = await Promise.all([
    fetchNormalTxList(input.address),
    fetchTokenTxList(input.address),
  ]);

  const merged = mergeEtherscanBackfill(base, input, normalTxs ?? [], tokenTxs ?? []);
  return merged ?? base;
}

function mergeEtherscanBackfill(
  base: WalletIntelDataset,
  input: WalletModeInput,
  normalTxs: EtherscanNormalTx[],
  tokenTxs: EtherscanTokenTx[]
): WalletIntelDataset | null {
  const activity = normalizeActivity(input.address, normalTxs, tokenTxs);
  if (!activity.length) return null;

  const stats = deriveStats(activity);
  const behavior = buildBehaviorFromStats(stats);
  const evidence = buildEvidenceFromActivity(activity);
  const identity = buildIdentityFromStats(base, input, stats, behavior);
  const flowLayers = buildFlowLayersFromStats(base.flowLayers, stats);
  const graph = buildGraphFromStats(input.address, identity.label, stats);
  const clusters = buildClustersFromStats(stats, behavior);
  const summary = buildSummaryFromStats(identity.label, stats, behavior, evidence);
  const marketTokens = remapMarketTokens(base.market.tokens, stats, evidence);
  const actionPlan = buildActionPlanFromStats(stats, behavior, marketTokens[0]?.symbol ?? 'ETH');

  return {
    ...base,
    identity,
    behavior,
    flowLayers,
    graph,
    clusters,
    summary,
    market: {
      ...base.market,
      tokens: marketTokens,
    },
    evidence,
    actionPlan,
  };
}

function normalizeActivity(
  rootAddress: string,
  normalTxs: EtherscanNormalTx[],
  tokenTxs: EtherscanTokenTx[]
): NormalizedActivity[] {
  const root = rootAddress.toLowerCase();
  const normal = normalTxs
    .map((tx, index) => normalizeNormalTx(tx, index, root))
    .filter((tx): tx is NormalizedActivity => tx !== null);
  const token = tokenTxs
    .map((tx, index) => normalizeTokenTx(tx, index, root))
    .filter((tx): tx is NormalizedActivity => tx !== null);

  return [...normal, ...token]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 64);
}

function normalizeNormalTx(
  tx: EtherscanNormalTx,
  index: number,
  root: string
): NormalizedActivity | null {
  const from = (tx.from || '').toLowerCase();
  const to = (tx.to || '').toLowerCase();
  if (from !== root && to !== root) return null;

  const counterparty = from === root ? to : from;
  const meta = KNOWN_COUNTERPARTIES[counterparty] ?? null;
  const amount = formatUnits(tx.value, 18);
  return {
    id: `normal-${tx.hash}-${index}`,
    kind: 'normal',
    hash: tx.hash,
    timestamp: Number(tx.timeStamp || '0') * 1000,
    from,
    to,
    direction: from === root ? 'out' : 'in',
    tokenSymbol: 'ETH',
    decimals: 18,
    rawValue: tx.value,
    amount,
    usdValue: Number.isFinite(amount) ? amount * TOKEN_PRICE_USD.ETH : null,
    counterparty,
    counterpartyMeta: meta,
    isContractInteraction: (tx.input || '') !== '0x',
  };
}

function normalizeTokenTx(
  tx: EtherscanTokenTx,
  index: number,
  root: string
): NormalizedActivity | null {
  const from = (tx.from || '').toLowerCase();
  const to = (tx.to || '').toLowerCase();
  if (from !== root && to !== root) return null;

  const decimals = Number(tx.tokenDecimal || '18');
  const symbol = (tx.tokenSymbol || 'TOKEN').trim().toUpperCase();
  const amount = formatUnits(tx.value, decimals);
  const counterparty = from === root ? to : from;
  const meta = KNOWN_COUNTERPARTIES[counterparty] ?? null;
  const usdPrice = TOKEN_PRICE_USD[symbol];

  return {
    id: `token-${tx.hash}-${index}`,
    kind: 'token',
    hash: tx.hash,
    timestamp: Number(tx.timeStamp || '0') * 1000,
    from,
    to,
    direction: from === root ? 'out' : 'in',
    tokenSymbol: symbol,
    tokenAddress: tx.contractAddress,
    decimals,
    rawValue: tx.value,
    amount,
    usdValue: Number.isFinite(amount) && usdPrice ? amount * usdPrice : null,
    counterparty,
    counterpartyMeta: meta,
    isContractInteraction: true,
  };
}

function deriveStats(activity: NormalizedActivity[]): DerivedStats {
  const tokenAgg = new Map<string, { txCount: number; usdValue: number | null; totalAmount: number }>();
  const counterpartyAgg = new Map<
    string,
    {
      label: string;
      type: WalletGraphNode['type'];
      tone: WalletTone;
      txCount: number;
      usdValue: number | null;
      tags: string[];
      inCount: number;
      outCount: number;
    }
  >();

  let inboundCount = 0;
  let outboundCount = 0;
  let cexTouches = 0;
  let bridgeTouches = 0;
  let contractTouches = 0;
  let normalCount = 0;
  let tokenCount = 0;

  for (const row of activity) {
    if (row.kind === 'normal') {
      normalCount += 1;
    } else {
      tokenCount += 1;
    }

    if (row.direction === 'in') inboundCount += 1;
    if (row.direction === 'out') outboundCount += 1;

    if (row.counterpartyMeta?.type === 'cex' && row.direction === 'out') cexTouches += 1;
    if (row.counterpartyMeta?.type === 'bridge') bridgeTouches += 1;
    if (row.counterpartyMeta?.type === 'contract' || row.isContractInteraction) contractTouches += 1;

    const tokenEntry = tokenAgg.get(row.tokenSymbol) ?? {
      txCount: 0,
      usdValue: 0,
      totalAmount: 0,
    };
    tokenEntry.txCount += 1;
    tokenEntry.totalAmount += row.amount;
    tokenEntry.usdValue =
      tokenEntry.usdValue === null
        ? row.usdValue
        : row.usdValue === null
          ? tokenEntry.usdValue
          : tokenEntry.usdValue + row.usdValue;
    tokenAgg.set(row.tokenSymbol, tokenEntry);

    const label = row.counterpartyMeta?.label ?? abbreviateMiddle(row.counterparty);
    const type = row.counterpartyMeta?.type ?? (row.isContractInteraction ? 'contract' : 'wallet');
    const tone = row.counterpartyMeta?.tone ?? (row.direction === 'out' ? 'warn' : 'neutral');
    const counterpartyEntry = counterpartyAgg.get(row.counterparty) ?? {
      label,
      type,
      tone,
      txCount: 0,
      usdValue: 0,
      tags: row.counterpartyMeta?.tags ?? [],
      inCount: 0,
      outCount: 0,
    };
    counterpartyEntry.txCount += 1;
    counterpartyEntry.usdValue =
      counterpartyEntry.usdValue === null
        ? row.usdValue
        : row.usdValue === null
          ? counterpartyEntry.usdValue
          : counterpartyEntry.usdValue + row.usdValue;
    if (row.direction === 'in') counterpartyEntry.inCount += 1;
    if (row.direction === 'out') counterpartyEntry.outCount += 1;
    counterpartyAgg.set(row.counterparty, counterpartyEntry);
  }

  const firstTimestamp = activity[activity.length - 1]?.timestamp ?? Date.now();
  const lastTimestamp = activity[0]?.timestamp ?? Date.now();

  return {
    total: activity.length,
    normalCount,
    tokenCount,
    inboundCount,
    outboundCount,
    uniqueCounterparties: counterpartyAgg.size,
    uniqueTokens: tokenAgg.size,
    cexTouches,
    bridgeTouches,
    contractTouches,
    firstTimestamp,
    lastTimestamp,
    topTokens: [...tokenAgg.entries()]
      .map(([symbol, entry]) => ({ symbol, ...entry }))
      .sort((a, b) => {
        const usdA = a.usdValue ?? -1;
        const usdB = b.usdValue ?? -1;
        if (usdA !== usdB) return usdB - usdA;
        return b.txCount - a.txCount;
      })
      .slice(0, 4),
    topCounterparties: [...counterpartyAgg.entries()]
      .map(([address, entry]) => ({
        address,
        label: entry.label,
        type: entry.type,
        tone: entry.tone,
        txCount: entry.txCount,
        usdValue: entry.usdValue,
        tags: entry.tags,
        directionBias: (entry.inCount && entry.outCount
          ? 'mixed'
          : entry.outCount > 0
            ? 'out'
            : 'in') as 'mixed' | 'in' | 'out',
      }))
      .sort((a, b) => b.txCount - a.txCount)
      .slice(0, 4),
    latestActivity: activity[0],
  };
}

function buildBehaviorFromStats(stats: DerivedStats): WalletBehavior {
  const totalDirectional = Math.max(1, stats.inboundCount + stats.outboundCount);
  const spanDays = Math.max(0, (stats.lastTimestamp - stats.firstTimestamp) / 86_400_000);
  const accumulation = clamp(
    Math.round(28 + (stats.inboundCount / totalDirectional) * 44 + Math.min(stats.uniqueTokens, 5) * 4 - stats.cexTouches * 5),
    12,
    94
  );
  const distribution = clamp(
    Math.round(24 + (stats.outboundCount / totalDirectional) * 46 + stats.cexTouches * 11),
    10,
    96
  );
  const cexDeposit = clamp(
    Math.round((stats.cexTouches / Math.max(1, stats.outboundCount)) * 100 + (stats.cexTouches > 0 ? 18 : 0)),
    8,
    95
  );
  const bridgeScore = clamp(
    Math.round((stats.bridgeTouches / Math.max(1, stats.total)) * 100 + (stats.bridgeTouches > 0 ? 20 : 0)),
    6,
    92
  );
  const marketRelevance = clamp(
    Math.round(34 + Math.min(stats.total, 30) * 1.4 + stats.uniqueCounterparties * 2 + stats.uniqueTokens * 5),
    28,
    95
  );

  return {
    accumulation,
    distribution,
    cexDeposit,
    bridgeScore,
    marketRelevance,
    holdingHorizon: spanDays >= 30 ? 'position' : spanDays >= 3 ? 'swing' : 'intraday',
  };
}

function buildIdentityFromStats(
  base: WalletIntelDataset,
  input: WalletModeInput,
  stats: DerivedStats,
  behavior: WalletBehavior
): WalletIntelDataset['identity'] {
  const label =
    stats.cexTouches >= 2
      ? 'distribution hub'
      : stats.contractTouches >= Math.ceil(stats.total / 2)
        ? 'execution wallet'
        : behavior.accumulation >= behavior.distribution
          ? 'accumulation wallet'
          : base.identity.label;

  const confidence = clamp(
    Math.round(58 + Math.min(stats.total, 24) + Math.min(stats.uniqueCounterparties, 8)),
    62,
    96
  );

  const tags = [
    `etherscan-backed`,
    `${stats.normalCount} normal tx`,
    `${stats.tokenCount} token transfers`,
    behavior.cexDeposit >= 55 ? 'cex-adjacent' : 'off-cex bias',
    behavior.bridgeScore >= 45 ? 'bridge active' : 'single-domain bias',
  ];

  const topToken = stats.topTokens[0]?.symbol ?? 'ETH';
  const latestCounterparty = stats.latestActivity.counterpartyMeta?.label ?? abbreviateMiddle(stats.latestActivity.counterparty);

  return {
    ...base.identity,
    chain: input.chain.toUpperCase(),
    label,
    confidence,
    firstSeen: formatDate(stats.firstTimestamp),
    lastActive: formatRelativeAge(stats.lastTimestamp),
    tags,
    aliases: [
      `cp:${stats.uniqueCounterparties}`,
      `tokens:${stats.uniqueTokens}`,
      `top:${topToken}`,
    ],
    narrative:
      behavior.cexDeposit >= 60
        ? `실제 주소 activity 기준으로 ${latestCounterparty} 방향 출금이 반복되어 exit routing 성격이 강합니다.`
        : behavior.accumulation >= behavior.distribution
          ? `실제 tx 기준 ${topToken} 중심 수령/보관 activity가 더 우세하고, 즉시 CEX 이동은 강하지 않습니다.`
          : `실제 tx 기준 outbound activity가 더 많아 분산 또는 inventory rotation 성격을 먼저 봐야 합니다.`,
  };
}

function buildFlowLayersFromStats(
  baseLayers: WalletFlowLayer[],
  stats: DerivedStats
): WalletFlowLayer[] {
  const topToken = stats.topTokens[0]?.symbol ?? 'ETH';
  const latestCounterparty = stats.latestActivity.counterpartyMeta?.label ?? abbreviateMiddle(stats.latestActivity.counterparty);
  const lastDirection = stats.latestActivity.direction === 'out' ? 'outbound' : 'inbound';

  return [
    {
      ...baseLayers[0],
      stamp: formatRelativeAge(stats.firstTimestamp),
      headline: `${stats.total} raw tx observed`,
      detail: `First traced activity begins on ${formatDate(stats.firstTimestamp)} with ${stats.normalCount} normal tx and ${stats.tokenCount} token transfers.`,
      amountLabel: `${stats.total} tx`,
      tone: 'warn',
    },
    {
      ...baseLayers[1],
      stamp: `${stats.uniqueCounterparties} cp`,
      headline: `${stats.uniqueCounterparties} counterparties`,
      detail: `Inbound ${stats.inboundCount} vs outbound ${stats.outboundCount} flow currently defines the wallet's routing shape.`,
      amountLabel: `${stats.inboundCount}/${stats.outboundCount}`,
      tone: stats.outboundCount > stats.inboundCount ? 'bear' : 'neutral',
    },
    {
      ...baseLayers[2],
      stamp: `${stats.uniqueTokens} tok`,
      headline: `${topToken} + ${Math.max(0, stats.uniqueTokens - 1)} token exposures`,
      detail: `Token transfer history shows ${topToken} as the dominant touchpoint by notional or frequency.`,
      amountLabel: `${stats.uniqueTokens} tokens`,
      tone: 'cyan',
    },
    {
      ...baseLayers[3],
      stamp: formatRelativeAge(stats.lastTimestamp),
      headline: `${lastDirection} focus`,
      detail: `Latest observed activity touched ${latestCounterparty}, which now anchors the most recent visible flow state.`,
      amountLabel: latestCounterparty,
      tone: stats.cexTouches > 0 ? 'bear' : 'bull',
    },
  ];
}

function buildGraphFromStats(
  rootAddress: string,
  rootLabel: string,
  stats: DerivedStats
): { nodes: WalletGraphNode[]; edges: WalletGraphEdge[] } {
  const nodes: WalletGraphNode[] = [
    {
      id: 'wallet-root',
      type: 'wallet',
      label: rootLabel,
      shortLabel: abbreviateMiddle(rootAddress),
      address: rootAddress,
      size: 96,
      valueLabel: `${stats.total} tx`,
      tone: 'cyan',
      note: `${stats.uniqueCounterparties} counterparties and ${stats.uniqueTokens} token touchpoints were observed from raw explorer data.`,
      tags: ['root', 'etherscan-backed'],
    },
  ];

  const edges: WalletGraphEdge[] = [];

  for (const token of stats.topTokens) {
    nodes.push({
      id: `token-${token.symbol}`,
      type: 'token',
      label: `${token.symbol} exposure`,
      shortLabel: token.symbol,
      tokenSymbol: token.symbol,
      size: clamp(58 + token.txCount * 6, 58, 92),
      valueLabel: token.usdValue ? formatUsdCompact(token.usdValue) : `${token.txCount} tx`,
      tone: token.txCount >= 3 ? 'bull' : 'neutral',
      note: `${token.symbol} appeared in ${token.txCount} traced events.`,
      tags: ['token activity'],
    });
    edges.push({
      id: `edge-wallet-token-${token.symbol}`,
      source: 'wallet-root',
      target: `token-${token.symbol}`,
      type: 'transfer',
      txCount: token.txCount,
      valueLabel: token.usdValue ? formatUsdCompact(token.usdValue) : `${token.totalAmount.toFixed(2)} ${token.symbol}`,
    });
  }

  for (const cp of stats.topCounterparties) {
    nodes.push({
      id: `cp-${cp.address}`,
      type: cp.type,
      label: cp.label,
      shortLabel: cp.label.length > 18 ? cp.label.slice(0, 18) : cp.label,
      address: cp.address,
      size: clamp(56 + cp.txCount * 5, 56, 90),
      valueLabel: cp.usdValue ? formatUsdCompact(cp.usdValue) : `${cp.txCount} tx`,
      tone: cp.tone,
      note: `${cp.directionBias} bias across ${cp.txCount} traced interactions.`,
      tags: cp.tags.length ? cp.tags : [cp.directionBias],
    });
    edges.push({
      id: `edge-wallet-cp-${cp.address}`,
      source: 'wallet-root',
      target: `cp-${cp.address}`,
      type: cp.type === 'cex' ? 'deposit_to_cex' : cp.type === 'bridge' ? 'bridge' : cp.type === 'contract' ? 'swap' : 'transfer',
      txCount: cp.txCount,
      valueLabel: cp.usdValue ? formatUsdCompact(cp.usdValue) : `${cp.txCount} interactions`,
    });
  }

  return { nodes, edges };
}

function buildClustersFromStats(
  stats: DerivedStats,
  behavior: WalletBehavior
): WalletCluster[] {
  const topToken = stats.topTokens[0]?.symbol ?? 'ETH';
  return [
    {
      id: 'cluster-activity',
      label: 'Activity cluster',
      role: 'recent routing',
      members: stats.uniqueCounterparties,
      valueLabel: `${stats.total} tx`,
      tone: 'neutral',
      note: `Recent raw activity fans out across ${stats.uniqueCounterparties} counterparties.`,
      tags: ['etherscan', 'recent'],
    },
    {
      id: 'cluster-token',
      label: `${topToken} focus`,
      role: 'token concentration',
      members: stats.uniqueTokens,
      valueLabel: `${stats.topTokens[0]?.txCount ?? 0} touches`,
      tone: behavior.accumulation >= behavior.distribution ? 'bull' : 'warn',
      note: `${topToken} currently anchors the strongest observable token relationship.`,
      tags: ['token-led', behavior.holdingHorizon],
    },
    {
      id: 'cluster-exit',
      label: 'Exit proximity',
      role: 'cex / bridge',
      members: stats.cexTouches + stats.bridgeTouches,
      valueLabel: `${stats.cexTouches} cex / ${stats.bridgeTouches} bridge`,
      tone: stats.cexTouches > 0 ? 'bear' : 'cyan',
      note:
        stats.cexTouches > 0
          ? 'CEX-adjacent outflows were observed in recent explorer data.'
          : 'Bridge/CEX signatures are limited, so exit routing is not yet dominant.',
      tags: ['routing risk'],
    },
  ];
}

function buildSummaryFromStats(
  label: string,
  stats: DerivedStats,
  behavior: WalletBehavior,
  evidence: WalletEvidenceRow[]
): WalletIntelDataset['summary'] {
  const topToken = stats.topTokens[0]?.symbol ?? 'ETH';
  const latestAction = evidence[0]?.action ?? 'recent transfer';
  const latestCounterparty = stats.latestActivity.counterpartyMeta?.label ?? abbreviateMiddle(stats.latestActivity.counterparty);
  const headline =
    behavior.cexDeposit >= 60
      ? `이 주소는 ${label} 성격이 강하고, 최근 실거래 기준 ${latestCounterparty} 방향 CEX-adjacent outflow가 확인됩니다.`
      : behavior.accumulation >= behavior.distribution
        ? `이 주소는 ${label}로 보이며, 최근 raw activity 기준 ${topToken} 수령/보관 잔향이 더 우세합니다.`
        : `이 주소는 ${label}로 보이며, 최근 raw activity는 outbound rotation 쪽 해석이 더 강합니다.`;

  const claims: WalletSummaryClaim[] = [
    {
      id: 'who',
      title: 'Who',
      detail: `Etherscan 기준 최근 ${stats.total}건의 주소 activity에서 ${stats.uniqueCounterparties}개 counterparty와 ${stats.uniqueTokens}개 token touchpoint가 관찰됐습니다.`,
      tone: 'cyan',
    },
    {
      id: 'what',
      title: 'What',
      detail: `가장 최근 activity는 ${latestCounterparty}와의 ${latestAction}이며, 현재는 ${topToken} 노출이 가장 두드러집니다.`,
      tone: behavior.accumulation >= behavior.distribution ? 'bull' : 'warn',
    },
    {
      id: 'why',
      title: 'Why It Matters',
      detail:
        stats.cexTouches > 0
          ? `CEX-adjacent outflow가 ${stats.cexTouches}회 관측돼 follow보다 fade/watch 해석 비중이 높아졌습니다.`
          : `즉시 CEX 출구 신호는 약해 flow와 market confirmation을 같이 보는 편이 더 적절합니다.`,
      tone: stats.cexTouches > 0 ? 'bear' : 'neutral',
    },
  ];

  return {
    headline,
    confidence: clamp(
      Math.round(60 + Math.min(stats.total, 18) + Math.min(stats.uniqueCounterparties, 10)),
      62,
      95
    ),
    claims,
    followUps: [
      'flow map에서 최근 counterparty 집중 구간 확인',
      'bubble 탭에서 token / contract / cex 노드 클릭',
      'market overlay에서 실제 evidence marker와 차트 컨텍스트 비교',
    ],
  };
}

function remapMarketTokens(
  marketTokens: WalletMarketToken[],
  stats: DerivedStats,
  evidence: WalletEvidenceRow[]
): WalletMarketToken[] {
  const bySymbol = new Map(marketTokens.map((token) => [token.symbol, token]));
  const reordered: WalletMarketToken[] = [];

  for (const symbol of stats.topTokens.map((token) => token.symbol)) {
    const marketToken = bySymbol.get(symbol);
    if (!marketToken) continue;
    reordered.push({
      ...marketToken,
      thesis:
        symbol === stats.topTokens[0]?.symbol
          ? `${symbol} is the strongest observed token touchpoint from raw address activity.`
          : marketToken.thesis,
      eventMarkers: buildMarketEventsForSymbol(evidence, symbol),
    });
    bySymbol.delete(symbol);
  }

  for (const token of bySymbol.values()) {
    reordered.push({
      ...token,
      eventMarkers: buildMarketEventsForSymbol(evidence, token.symbol),
    });
  }

  return reordered;
}

function buildActionPlanFromStats(
  stats: DerivedStats,
  behavior: WalletBehavior,
  symbol: string
) {
  let primary: WalletActionKind = 'watch';
  let rationale = `${symbol}와 실제 tx evidence를 같이 보며 추가 확인이 필요한 상태입니다.`;

  if (behavior.marketRelevance < 45) {
    primary = 'ignore';
    rationale = '실제 주소 activity는 보이지만 현재 시장 relevance는 높지 않습니다.';
  } else if (behavior.cexDeposit >= 60) {
    primary = 'fade';
    rationale = '실제 recent flow에서 CEX-adjacent outflow가 확인돼 추격보다 fade/watch가 더 맞습니다.';
  } else if (behavior.accumulation > behavior.distribution + 8) {
    primary = 'follow';
    rationale = '실제 recent flow에서 순수 수령/보관 성격이 더 강해 follow 후보로 볼 수 있습니다.';
  }

  return {
    primary,
    rationale,
    checklist: [
      `${symbol} overlay에서 evidence marker 직후 가격/CVD 반응 확인`,
      `최근 top counterparty(${stats.topCounterparties[0]?.label ?? 'counterparty'}) 재접촉 여부 추적`,
      `CEX-adjacent outflow가 추가로 늘어나는지 감시`,
    ],
    alerts: [
      `이 주소가 다시 CEX cluster로 유의미한 outflow를 만들면 알림`,
      `${symbol} 관련 raw token transfer가 다시 급증하면 알림`,
    ],
  };
}

function buildEvidenceFromActivity(activity: NormalizedActivity[]): WalletEvidenceRow[] {
  return activity.slice(0, 10).map((row, index) => {
    const action = classifyAction(row);
    const tone = actionTone(action, row.direction);
    const counterparty = row.counterpartyMeta?.label ?? abbreviateMiddle(row.counterparty);
    return {
      id: row.id,
      at: formatDateTime(row.timestamp),
      action,
      token: row.tokenSymbol,
      amountLabel: `${formatAmount(row.amount, row.tokenSymbol)} ${row.tokenSymbol}`,
      usdLabel: row.usdValue ? formatUsdCompact(row.usdValue) : '--',
      counterparty,
      txHash: abbreviateMiddle(row.hash, 8, 6),
      note: `raw ${row.kind} tx · ${row.direction === 'out' ? 'wallet sent to' : 'wallet received from'} ${counterparty}`,
      tone,
    };
  });
}

function buildMarketEventsForSymbol(
  evidence: WalletEvidenceRow[],
  symbol: string
): WalletMarketEvent[] {
  const rows = evidence.filter((row) => row.token === symbol).slice(0, 4);
  if (!rows.length) {
    return evidence.slice(0, 4).map((row, index) => ({
      id: `${symbol}-fallback-${index}`,
      atLabel: row.at.slice(5, 16),
      type: row.action,
      label: row.counterparty,
      usdLabel: row.usdLabel,
      tone: row.tone,
    }));
  }

  return rows.map((row, index) => ({
    id: `${symbol}-event-${index}`,
    atLabel: row.at.slice(5, 16),
    type: row.action,
    label: row.counterparty,
    usdLabel: row.usdLabel,
    tone: row.tone,
  }));
}

function classifyAction(row: NormalizedActivity): string {
  if (row.kind === 'token' && row.from === '0x0000000000000000000000000000000000000000') {
    return 'mint / claim';
  }
  if (row.counterpartyMeta?.type === 'cex' && row.direction === 'out') return 'cex deposit';
  if (row.counterpartyMeta?.type === 'cex' && row.direction === 'in') return 'cex withdraw';
  if (row.counterpartyMeta?.type === 'bridge') return row.direction === 'out' ? 'bridge out' : 'bridge in';
  if (row.counterpartyMeta?.type === 'contract') return row.direction === 'out' ? 'contract route' : 'contract receive';
  if (row.kind === 'token') return row.direction === 'out' ? 'token send' : 'token receive';
  return row.direction === 'out' ? 'eth send' : 'eth receive';
}

function actionTone(action: string, direction: 'in' | 'out'): WalletTone {
  if (action.includes('deposit')) return 'bear';
  if (action.includes('bridge')) return 'cyan';
  if (action.includes('claim') || action.includes('receive')) return 'bull';
  if (action.includes('route')) return 'warn';
  return direction === 'out' ? 'neutral' : 'bull';
}

function formatUnits(rawValue: string, decimals: number): number {
  const value = Number(rawValue || '0');
  if (!Number.isFinite(value)) return 0;
  return value / 10 ** Math.min(Math.max(decimals, 0), 18);
}

function formatAmount(amount: number, symbol: string): string {
  if (amount >= 1000) return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (TOKEN_PRICE_USD[symbol] && TOKEN_PRICE_USD[symbol] < 0.01) {
    return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatUsdCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(timestamp));
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatRelativeAge(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const hours = Math.floor(delta / 3_600_000);
  if (hours < 24) return `${Math.max(1, hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
