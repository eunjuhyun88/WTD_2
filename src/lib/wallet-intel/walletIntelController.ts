import type {
  WalletActionKind,
  WalletBehavior,
  WalletChartBar,
  WalletCluster,
  WalletCommandResult,
  WalletEvidenceRow,
  WalletFlowLayer,
  WalletGraphEdge,
  WalletGraphNode,
  WalletIntelDataset,
  WalletIntelTab,
  WalletMarketEvent,
  WalletMarketToken,
  WalletModeInput,
  WalletSummaryClaim,
  WalletTone,
} from '$lib/wallet-intel/walletIntelTypes';

const TOKEN_LIBRARY = [
  { symbol: 'ETH', price: 3284, role: 'core rotation' },
  { symbol: 'BERA', price: 0.737, role: 'beta momentum' },
  { symbol: 'AERO', price: 1.42, role: 'exchange beta' },
  { symbol: 'ONDO', price: 1.09, role: 'rwa rotation' },
  { symbol: 'PEPE', price: 0.0000124, role: 'high vol meme' },
  { symbol: 'WIF', price: 2.48, role: 'speculative rotation' },
  { symbol: 'SKYAI', price: 0.052, role: 'airdrop echo' },
  { symbol: 'ENA', price: 1.14, role: 'derivatives beta' },
];

const ENTITY_LABELS = [
  'distribution hub',
  'smart-money candidate',
  'accumulation wallet',
  'bridge relay',
  'cex proxy',
  'airdrop farmer cluster',
];

const HORIZONS = ['intraday', 'swing', 'position'];
const REGIMES = ['trend-up', 'range-compression', 'distribution-test', 'squeeze-release'];

export function isWalletIdentifierLike(raw: string): boolean {
  const value = raw.trim();
  return /^0x[a-fA-F0-9]{8,40}$/.test(value) || /^[a-zA-Z0-9-]+\.eth$/.test(value) || /^[a-zA-Z0-9-]+\.base\.eth$/.test(value);
}

export function normalizeWalletModeInput(raw: string, chainHint = 'eth'): WalletModeInput {
  const identifier = raw.trim();
  if (/^0x[a-fA-F0-9]{8,40}$/.test(identifier)) {
    return {
      chain: chainHint,
      identifier,
      address: identifier.toLowerCase(),
    };
  }

  return {
    chain: 'eth',
    identifier,
    address: pseudoAddressFromString(identifier),
  };
}

export function buildWalletIntelDataset(input: WalletModeInput): WalletIntelDataset {
  const seed = hashString(`${input.chain}:${input.address}:${input.identifier}`);
  const random = mulberry32(seed);
  const selectedTokens = pickTokens(random);
  const behavior = buildBehavior(random);
  const identity = buildIdentity(input, behavior, random);
  const flowLayers = buildFlowLayers(identity, behavior, selectedTokens, random);
  const graphNodes = buildGraphNodes(identity, selectedTokens, random);
  const graphEdges = buildGraphEdges(graphNodes, random);
  const clusters = buildClusters(identity, behavior, selectedTokens, random);
  const evidence = buildEvidence(selectedTokens, flowLayers, random);
  const marketTokens = selectedTokens.map((token, index) =>
    buildMarketToken(token.symbol, token.price, token.role, behavior, seed + index * 97)
  );
  const summaryClaims = buildClaims(behavior, flowLayers, evidence);
  const summaryHeadline = buildHeadline(identity.label, behavior);

  return {
    identity,
    summary: {
      headline: summaryHeadline,
      confidence: identity.confidence,
      claims: summaryClaims,
      followUps: [
        'flow map으로 분산 → 재집결 순서를 확인',
        'bubble 탭에서 어떤 토큰과 가장 강하게 엮였는지 보기',
        'selected token 차트에서 wallet event와 CVD가 같이 움직였는지 비교',
      ],
    },
    behavior,
    flowLayers,
    graph: { nodes: graphNodes, edges: graphEdges },
    clusters,
    market: {
      timeframe: '4h',
      tokens: marketTokens,
    },
    evidence,
    actionPlan: buildActionPlan(behavior, selectedTokens[0].symbol),
  };
}

export function findWalletMarketToken(dataset: WalletIntelDataset, symbol?: string): WalletMarketToken {
  return dataset.market.tokens.find((token) => token.symbol === symbol) ?? dataset.market.tokens[0];
}

export function interpretWalletCommand(
  raw: string,
  dataset: WalletIntelDataset
): WalletCommandResult {
  const text = raw.trim();
  if (!text) return { note: '새 주소를 넣거나 flow / bubble / cluster / token 심볼로 바로 이동할 수 있습니다.' };

  if (isWalletIdentifierLike(text)) {
    return {
      note: '새 주소로 investigation context를 전환합니다.',
      nextInput: normalizeWalletModeInput(text),
    };
  }

  const lowered = text.toLowerCase();
  if (lowered.includes('exit') || lowered.includes('back') || lowered.includes('terminal')) {
    return { note: '표준 terminal 모드로 돌아갑니다.', exit: true };
  }

  if (lowered.includes('flow')) {
    return { note: 'Flow Map으로 전환했습니다.', tab: 'flow' };
  }
  if (lowered.includes('bubble') || lowered.includes('token')) {
    return { note: 'Token Bubble Graph로 전환했습니다.', tab: 'bubble' };
  }
  if (lowered.includes('cluster')) {
    return { note: 'Cluster View로 전환했습니다.', tab: 'cluster' };
  }

  const token = dataset.market.tokens.find((item) => lowered.includes(item.symbol.toLowerCase()));
  if (token) {
    return {
      note: `${token.symbol} market overlay로 전환했습니다.`,
      tokenSymbol: token.symbol,
    };
  }

  return {
    note: '이 모드에서는 새 주소, 토큰 심볼, flow / bubble / cluster 명령을 바로 해석합니다.',
  };
}

export function walletDeepLink(input: WalletModeInput): string {
  const params = new URLSearchParams({
    mode: 'wallet',
    chain: input.chain,
    address: input.identifier,
  });
  return `/terminal?${params.toString()}`;
}

export function walletIntelApiPath(input: Pick<WalletModeInput, 'chain' | 'identifier'>): string {
  const params = new URLSearchParams({
    chain: input.chain,
    address: input.identifier,
  });
  return `/api/wallet/intel?${params.toString()}`;
}

export function abbreviateMiddle(value: string, prefix = 6, suffix = 4): string {
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

function buildIdentity(input: WalletModeInput, behavior: WalletBehavior, random: () => number) {
  const label = ENTITY_LABELS[Math.floor(random() * ENTITY_LABELS.length)];
  const confidence = 61 + Math.round(random() * 28);
  const firstSeenMonth = 1 + Math.floor(random() * 11);
  const lastHours = 1 + Math.floor(random() * 18);
  const tags = [
    behavior.accumulation > behavior.distribution ? 'accumulation bias' : 'distribution bias',
    behavior.cexDeposit > 60 ? 'cex risk' : 'off-cex',
    behavior.bridgeScore > 55 ? 'bridge active' : 'single-domain',
  ];
  return {
    chain: input.chain.toUpperCase(),
    address: input.address,
    displayAddress: input.identifier.endsWith('.eth') ? `${input.identifier} · ${abbreviateMiddle(input.address)}` : abbreviateMiddle(input.address),
    entityType: 'wallet cluster',
    label,
    confidence,
    firstSeen: `2024-${String(firstSeenMonth).padStart(2, '0')}-14`,
    lastActive: `${lastHours}h ago`,
    tags,
    aliases: [`cluster-${input.address.slice(2, 6)}`, `hub-${input.address.slice(-4)}`],
    narrative:
      behavior.accumulation > behavior.distribution
        ? '분할 수집 이후 아직 대형 CEX 이동보다 보관/회전 비중이 높습니다.'
        : '분산 보관 뒤 재집결 흔적이 보여 출구 준비형 행동 가능성이 있습니다.',
  };
}

function buildBehavior(random: () => number): WalletBehavior {
  const accumulation = 35 + Math.round(random() * 50);
  const distribution = 25 + Math.round(random() * 55);
  const cexDeposit = 18 + Math.round(random() * 60);
  const bridgeScore = 20 + Math.round(random() * 65);
  const marketRelevance = 40 + Math.round(random() * 50);
  return {
    accumulation,
    distribution,
    cexDeposit,
    bridgeScore,
    marketRelevance,
    holdingHorizon: HORIZONS[Math.floor(random() * HORIZONS.length)],
  };
}

function buildFlowLayers(
  identity: WalletIntelDataset['identity'],
  behavior: WalletBehavior,
  tokens: Array<{ symbol: string; price: number; role: string }>,
  random: () => number
): WalletFlowLayer[] {
  const baseToken = tokens[0]?.symbol ?? 'ETH';
  const splitCount = 18 + Math.floor(random() * 64);
  const hubCount = 4 + Math.floor(random() * 16);
  return [
    {
      id: 'source',
      label: 'Source',
      stamp: 'T-12d',
      headline: `${identity.label} seed`,
      detail: `${baseToken} initial claim / receive activity starts here.`,
      amountLabel: `$${Math.round((0.9 + random() * 1.8) * 100)}k`,
      addresses: [identity.address, pseudoAddressFromString(identity.address + 'src')],
      tone: 'warn',
    },
    {
      id: 'split',
      label: 'Split Layer',
      stamp: 'T-11d',
      headline: `${splitCount} dispersal wallets`,
      detail: `Short-interval redistribution reduced per-wallet visibility before holding.`,
      amountLabel: `${splitCount} wallets`,
      addresses: Array.from({ length: 4 }, (_, index) => pseudoAddressFromString(`${identity.address}:split:${index}`)),
      tone: behavior.distribution > behavior.accumulation ? 'bear' : 'neutral',
    },
    {
      id: 'hold',
      label: 'Holding Layer',
      stamp: 'T-6d',
      headline: `${hubCount} holding relays`,
      detail: `Dormant windows and repeat self-sends imply inventory parking rather than active selling.`,
      amountLabel: `${hubCount} hubs`,
      addresses: Array.from({ length: 3 }, (_, index) => pseudoAddressFromString(`${identity.address}:hold:${index}`)),
      tone: 'cyan',
    },
    {
      id: 'hub',
      label: 'Final Hub',
      stamp: 'T-2h',
      headline: `${baseToken} focus hub`,
      detail: `Latest concentration sits in a higher-balance wallet with repeat interactions to route / CEX endpoints.`,
      amountLabel: `$${Math.round((1.2 + random() * 2.4) * 100)}k`,
      addresses: [pseudoAddressFromString(`${identity.address}:hub`)],
      tone: behavior.cexDeposit > 55 ? 'bear' : 'bull',
    },
  ];
}

function buildGraphNodes(
  identity: WalletIntelDataset['identity'],
  tokens: Array<{ symbol: string; price: number; role: string }>,
  random: () => number
): WalletGraphNode[] {
  const nodes: WalletGraphNode[] = [
    {
      id: 'wallet-root',
      type: 'wallet',
      label: identity.label,
      shortLabel: identity.displayAddress,
      address: identity.address,
      size: 96,
      valueLabel: `${identity.confidence}%`,
      tone: 'cyan',
      note: identity.narrative,
      tags: identity.tags,
    },
  ];

  for (const token of tokens) {
    nodes.push({
      id: `token-${token.symbol}`,
      type: 'token',
      label: `${token.symbol} exposure`,
      shortLabel: token.symbol,
      tokenSymbol: token.symbol,
      size: 62 + Math.round(random() * 34),
      valueLabel: `${(0.25 + random() * 1.4).toFixed(2)}M USD`,
      tone: random() > 0.5 ? 'bull' : 'warn',
      note: `${token.symbol} is one of the highest notional touchpoints for this wallet.`,
      tags: [token.role],
    });
  }

  nodes.push(
    {
      id: 'contract-router',
      type: 'contract',
      label: 'Uniswap V3 Router',
      shortLabel: 'UNI V3',
      size: 72,
      valueLabel: `${8 + Math.round(random() * 12)} tx`,
      tone: 'neutral',
      note: 'Most swap-like activity clusters through a router contract.',
      tags: ['swap route'],
    },
    {
      id: 'cex-binance',
      type: 'cex',
      label: 'Binance deposit cluster',
      shortLabel: 'Binance',
      size: 78,
      valueLabel: `$${Math.round((0.4 + random() * 1.8) * 100)}k`,
      tone: 'bear',
      note: 'Label confidence rises when repeated final-hop deposits hit the same cluster.',
      tags: ['cex', 'exit risk'],
    },
    {
      id: 'bridge-across',
      type: 'bridge',
      label: 'Across bridge relay',
      shortLabel: 'Across',
      size: 70,
      valueLabel: `${3 + Math.round(random() * 6)} hops`,
      tone: 'cyan',
      note: 'Bridge usage suggests chain rotation or provenance masking.',
      tags: ['bridge'],
    },
    {
      id: 'cluster-alpha',
      type: 'cluster',
      label: 'Alpha relay cluster',
      shortLabel: 'Cluster',
      size: 82,
      valueLabel: `${12 + Math.round(random() * 22)} wallets`,
      tone: 'warn',
      note: 'Shared behavior pattern across temporally adjacent wallets.',
      tags: ['cluster', 'cohort'],
    }
  );

  return nodes;
}

function buildGraphEdges(nodes: WalletGraphNode[], random: () => number): WalletGraphEdge[] {
  const tokenNodes = nodes.filter((node) => node.type === 'token');
  const edges: WalletGraphEdge[] = [];
  for (const tokenNode of tokenNodes) {
    edges.push({
      id: `edge-root-${tokenNode.id}`,
      source: 'wallet-root',
      target: tokenNode.id,
      type: 'transfer',
      txCount: 3 + Math.floor(random() * 6),
      valueLabel: tokenNode.valueLabel,
    });
  }
  edges.push(
    {
      id: 'edge-root-router',
      source: 'wallet-root',
      target: 'contract-router',
      type: 'swap',
      txCount: 6 + Math.floor(random() * 8),
      valueLabel: `$${Math.round((0.3 + random() * 1.1) * 100)}k`,
    },
    {
      id: 'edge-root-cex',
      source: 'wallet-root',
      target: 'cex-binance',
      type: 'deposit_to_cex',
      txCount: 1 + Math.floor(random() * 4),
      valueLabel: `$${Math.round((0.2 + random() * 0.8) * 100)}k`,
    },
    {
      id: 'edge-root-bridge',
      source: 'wallet-root',
      target: 'bridge-across',
      type: 'bridge',
      txCount: 1 + Math.floor(random() * 5),
      valueLabel: `$${Math.round((0.1 + random() * 0.6) * 100)}k`,
    },
    {
      id: 'edge-root-cluster',
      source: 'wallet-root',
      target: 'cluster-alpha',
      type: 'cluster',
      txCount: 9 + Math.floor(random() * 10),
      valueLabel: `${10 + Math.floor(random() * 12)} shared hops`,
    }
  );
  return edges;
}

function buildClusters(
  identity: WalletIntelDataset['identity'],
  behavior: WalletBehavior,
  tokens: Array<{ symbol: string; price: number; role: string }>,
  random: () => number
): WalletCluster[] {
  return [
    {
      id: 'cluster-alpha',
      label: 'Alpha relay cluster',
      role: 'split + recombine',
      members: 18 + Math.floor(random() * 18),
      valueLabel: `$${Math.round((0.8 + random() * 1.6) * 100)}k`,
      tone: behavior.distribution > 60 ? 'bear' : 'neutral',
      note: `Repeated ${tokens[0].symbol} self-routing suggests inventory preparation before a larger move.`,
      tags: ['short-lived', 'same-hour creation'],
    },
    {
      id: 'cluster-beta',
      label: 'Holding relay',
      role: 'inventory parking',
      members: 6 + Math.floor(random() * 8),
      valueLabel: `${HORIZONS[(Math.floor(random() * HORIZONS.length))]} horizon`,
      tone: 'cyan',
      note: 'Dormant periods and repeating fee patterns imply coordinated custody.',
      tags: ['dormant windows', 'repeat gas pattern'],
    },
    {
      id: 'cluster-gamma',
      label: 'Exit path cluster',
      role: 'bridge / cex proximity',
      members: 4 + Math.floor(random() * 6),
      valueLabel: `$${Math.round((0.3 + random() * 0.9) * 100)}k`,
      tone: behavior.cexDeposit > 55 ? 'warn' : 'neutral',
      note: `${identity.label} has a non-trivial overlap with CEX-adjacent addresses.`,
      tags: ['cex-adjacent', 'bridge overlap'],
    },
  ];
}

function buildEvidence(
  tokens: Array<{ symbol: string; price: number; role: string }>,
  flowLayers: WalletFlowLayer[],
  random: () => number
): WalletEvidenceRow[] {
  const actionTypes = ['claim', 'split transfer', 'swap', 'bridge out', 'cex deposit', 'self route'];
  return Array.from({ length: 9 }, (_, index) => {
    const token = tokens[index % tokens.length];
    const action = actionTypes[index % actionTypes.length];
    const usdValue = 12 + random() * 180;
    return {
      id: `ev-${index}`,
      at: `2026-04-${String(11 - Math.min(index, 8)).padStart(2, '0')} ${String(9 + (index % 7)).padStart(2, '0')}:20`,
      action,
      token: token.symbol,
      amountLabel: `${(usdValue / Math.max(token.price, 0.00001)).toFixed(token.price > 1 ? 1 : 0)} ${token.symbol}`,
      usdLabel: `$${usdValue.toFixed(1)}k`,
      counterparty: flowLayers[index % flowLayers.length].label,
      txHash: `0x${Math.floor(hashString(`${token.symbol}:${index}`)).toString(16).padStart(8, '0')}...${Math.floor(hashString(`${action}:${index}`)).toString(16).slice(0, 4)}`,
      note: `${token.symbol} ${action} activity aligns with the ${flowLayers[index % flowLayers.length].label.toLowerCase()} stage.`,
      tone: action.includes('deposit') ? 'bear' : action.includes('bridge') ? 'cyan' : 'neutral',
    };
  });
}

function buildMarketToken(
  symbol: string,
  basePrice: number,
  role: string,
  behavior: WalletBehavior,
  seed: number
): WalletMarketToken {
  const random = mulberry32(seed);
  const bars = buildChartSeries(basePrice, random);
  const closes = bars.map((bar) => bar.c);
  const ema20 = buildEma(closes, 20);
  const bb = buildBollinger(closes, 20, 2);
  const changePct = ((bars[bars.length - 1].c - bars[0].o) / Math.max(bars[0].o, 0.0001)) * 100;
  const lastPrice = bars[bars.length - 1].c;
  const support = Math.min(...closes.slice(-20));
  const resistance = Math.max(...closes.slice(-20));
  const cvdPositive = behavior.accumulation >= behavior.distribution;
  const events = buildMarketEvents(symbol, random);

  return {
    symbol,
    pair: `${symbol}USDT`,
    role,
    price: lastPrice,
    changePct,
    thesis:
      behavior.cexDeposit > 60
        ? `${symbol} touchpoints now lean exit-sensitive because CEX proximity is rising.`
        : `${symbol} remains the cleanest market confirmation track for this wallet's recent behavior.`,
    chart: bars,
    annotations: [
      { type: 'support', price: support, strength: 4 },
      { type: 'resistance', price: resistance, strength: 5 },
    ],
    indicators: {
      ema20,
      bbUpper: bb.upper,
      bbMiddle: bb.middle,
      bbLower: bb.lower,
    },
    derivatives: {
      funding: Number(((random() - 0.5) * 0.0022).toFixed(6)),
      oi: Math.round((40 + random() * 180) * 1_000_000),
      lsRatio: Number((0.84 + random() * 0.48).toFixed(2)),
    },
    snapshot: {
      alphaScore: Math.round((behavior.accumulation - behavior.distribution) * 0.6 + (random() - 0.5) * 12),
      regime: REGIMES[Math.floor(random() * REGIMES.length)],
      l11: { score: cvdPositive ? 24 : -18, cvd_state: cvdPositive ? 'BULL DIV' : 'BEAR ABSORB' },
      l14: { bb_squeeze: random() > 0.55, bb_width: (1.2 + random() * 4.8).toFixed(2) },
      l15: { atr_pct: (2 + random() * 5).toFixed(2) },
    },
    eventMarkers: events,
  };
}

function buildMarketEvents(symbol: string, random: () => number): WalletMarketEvent[] {
  const eventTypes = ['buy cluster', 'split transfer', 'bridge out', 'cex deposit'];
  return Array.from({ length: 4 }, (_, index) => ({
    id: `${symbol}-event-${index}`,
    atLabel: `T-${12 - index * 3}h`,
    type: eventTypes[index],
    label: `${symbol} ${eventTypes[index]}`,
    usdLabel: `$${Math.round((0.1 + random() * 0.8) * 100)}k`,
    tone: index === 3 ? 'bear' : index === 2 ? 'cyan' : 'bull',
  }));
}

function buildClaims(
  behavior: WalletBehavior,
  flowLayers: WalletFlowLayer[],
  evidence: WalletEvidenceRow[]
): WalletSummaryClaim[] {
  return [
    {
      id: 'who',
      title: 'Who',
      detail: behavior.accumulation > behavior.distribution
        ? '매집 잔향이 남은 relay cluster로 보이며 직접 청산보다 inventory parking 비중이 큽니다.'
        : '분산 후 재집결 흔적이 강해 distribution hub 또는 exit staging wallet 가능성이 있습니다.',
      tone: behavior.accumulation > behavior.distribution ? 'bull' : 'bear',
    },
    {
      id: 'what',
      title: 'What',
      detail: `${flowLayers[1].headline} → ${flowLayers[3].headline} 흐름이 반복되고, 최근 evidence에서는 ${evidence[0].action} / ${evidence[4].action}가 가장 두드러집니다.`,
      tone: 'cyan',
    },
    {
      id: 'why',
      title: 'Why It Matters',
      detail: behavior.cexDeposit > 55
        ? '시장 relevance는 높고 CEX proximity도 올라서 follow보다 fade/watch 해석이 더 적합합니다.'
        : '시장 relevance가 유지되지만 즉시 출구 신호는 약해 flow와 chart confirmation을 같이 보는 편이 낫습니다.',
      tone: behavior.cexDeposit > 55 ? 'warn' : 'neutral',
    },
  ];
}

function buildHeadline(label: string, behavior: WalletBehavior): string {
  if (behavior.cexDeposit > 68) {
    return `이 주소는 ${label} 성격이 강하고, 최근에는 CEX-adjacent behavior가 올라와 출구 준비형 구조에 가깝습니다.`;
  }
  if (behavior.accumulation > behavior.distribution) {
    return `이 주소는 ${label}로 보이며, 분산 보관 뒤에도 아직 순수 매집/보관 잔향이 더 강합니다.`;
  }
  return `이 주소는 ${label}로 보이며, split → hold → hub 재집결 패턴 때문에 분배 준비형 행동을 의심할 수 있습니다.`;
}

function buildActionPlan(behavior: WalletBehavior, symbol: string) {
  let primary: WalletActionKind = 'watch';
  let rationale = `${symbol} 차트와 evidence rail을 같이 보며 추가 확인이 필요한 상태입니다.`;

  if (behavior.marketRelevance < 45) {
    primary = 'ignore';
    rationale = '시장 relevance가 낮아 실시간 추적 우선순위는 높지 않습니다.';
  } else if (behavior.cexDeposit > 68) {
    primary = 'fade';
    rationale = 'CEX proximity와 distribution bias가 모두 높아 추격보다 fade/watch가 더 맞습니다.';
  } else if (behavior.accumulation > 70 && behavior.cexDeposit < 45) {
    primary = 'follow';
    rationale = '매집 우위와 낮은 exit risk가 같이 보여 follow 후보로 볼 수 있습니다.';
  }

  return {
    primary,
    rationale,
    checklist: [
      `${symbol} overlay에서 wallet event 직후 CVD가 same-direction인지 확인`,
      'Final hub → CEX cluster 이동이 다시 발생하는지 추적',
      'Flow Map의 split layer가 재가동되는지 확인',
    ],
    alerts: [
      `Final hub가 다시 CEX cluster로 $300k+ 입금하면 알림`,
      `${symbol} wallet event와 함께 funding / CVD divergence가 확장되면 알림`,
    ],
  };
}

function pickTokens(random: () => number) {
  const bag = [...TOKEN_LIBRARY];
  const chosen: typeof TOKEN_LIBRARY = [];
  while (bag.length && chosen.length < 4) {
    const index = Math.floor(random() * bag.length);
    chosen.push(bag.splice(index, 1)[0]);
  }
  return chosen;
}

function buildChartSeries(basePrice: number, random: () => number): WalletChartBar[] {
  const bars: WalletChartBar[] = [];
  const start = Date.UTC(2026, 3, 7, 0, 0, 0);
  const interval = 4 * 60 * 60 * 1000;
  let price = basePrice * (0.9 + random() * 0.25);

  for (let index = 0; index < 88; index += 1) {
    const drift = (random() - 0.48) * basePrice * 0.02;
    const open = price;
    const close = Math.max(basePrice * 0.35, open + drift);
    const high = Math.max(open, close) + Math.abs(drift) * (0.6 + random() * 1.5);
    const low = Math.min(open, close) - Math.abs(drift) * (0.4 + random() * 1.2);
    const volume = Math.max(1000, basePrice * 2000 * (0.5 + random() * 1.8));
    bars.push({
      t: Math.floor((start + index * interval) / 1000),
      o: roundPrice(open),
      h: roundPrice(high),
      l: roundPrice(Math.max(0.0000001, low)),
      c: roundPrice(close),
      v: Math.round(volume),
    });
    price = close;
  }

  return bars;
}

function buildEma(values: number[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  const result: number[] = [];
  let previous = values[0] ?? 0;
  for (const value of values) {
    previous = previous + (value - previous) * multiplier;
    result.push(roundPrice(previous));
  }
  return result;
}

function buildBollinger(values: number[], period: number, stdevMultiplier: number) {
  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const window = values.slice(Math.max(0, index - period + 1), index + 1);
    const avg = window.reduce((sum, value) => sum + value, 0) / window.length;
    const variance =
      window.reduce((sum, value) => sum + (value - avg) ** 2, 0) / window.length;
    const std = Math.sqrt(variance);
    middle.push(roundPrice(avg));
    upper.push(roundPrice(avg + std * stdevMultiplier));
    lower.push(roundPrice(Math.max(0.0000001, avg - std * stdevMultiplier)));
  }

  return { middle, upper, lower };
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return function next() {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pseudoAddressFromString(input: string) {
  let hex = '';
  let current = hashString(input);
  while (hex.length < 40) {
    current = hashString(`${current}:${input}:${hex.length}`);
    hex += current.toString(16).padStart(8, '0');
  }
  return `0x${hex.slice(0, 40)}`;
}

function roundPrice(value: number) {
  if (value >= 1000) return Number(value.toFixed(1));
  if (value >= 1) return Number(value.toFixed(3));
  return Number(value.toFixed(6));
}
