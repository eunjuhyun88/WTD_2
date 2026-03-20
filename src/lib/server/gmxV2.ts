// ═══════════════════════════════════════════════════════════════
// Stockclaw — GMX V2 Server Module (Arbitrum)
// ═══════════════════════════════════════════════════════════════
// Server-side GMX V2 interactions:
//   - Market data reading (prices, positions)
//   - Calldata construction for orders (sent by wallet in browser)
//   - Balance / allowance queries
//
// Architecture: Server builds calldata → Frontend sends tx via wallet
// Private keys NEVER touch the server.

import { createPublicClient, http, encodeFunctionData, parseAbi, formatUnits, type Hex } from 'viem';
import { arbitrum } from 'viem/chains';

// ═══ Constants ═══════════════════════════════════════════════

export const ARBITRUM_CHAIN_ID = 42161;

// GMX V2 Core Contracts (Arbitrum)
export const GMX_CONTRACTS = {
  ExchangeRouter:   '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41' as const,
  SyntheticsRouter: '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6' as const,
  OrderVault:       '0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5' as const,
  DataStore:        '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8' as const,
  Reader:           '0x470fbC46bcC0f16532691Df360A07d8Bf5ee0789' as const,
} as const;

// Tokens (Arbitrum)
export const TOKENS = {
  USDC:  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const, // Native USDC
  WETH:  '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const,
  WBTC:  '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const,
  USDT:  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as const,
  ARB:   '0x912CE59144191C1204E64559FE8253a0e49E6548' as const,
} as const;

// GMX V2 Markets (Arbitrum)
export const GMX_MARKETS = {
  'ETH/USD': {
    address: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' as const,
    indexToken: TOKENS.WETH,
    longToken: TOKENS.WETH,
    shortToken: TOKENS.USDC,
    label: 'ETH/USD',
    maxLeverage: 100,
  },
  'BTC/USD': {
    address: '0x47c031236e19d024b42f8AE6780E44A573170703' as const,
    indexToken: '0x47904963fc8b2340414262125aF798B9655E58Cd' as const, // BTC index token
    longToken: TOKENS.WBTC,
    shortToken: TOKENS.USDC,
    label: 'BTC/USD',
    maxLeverage: 100,
  },
} as const;

export type GmxMarketKey = keyof typeof GMX_MARKETS;

// GMX Order Types
export const OrderType = {
  MarketSwap: 0,
  LimitSwap: 1,
  MarketIncrease: 2,
  LimitIncrease: 3,
  MarketDecrease: 4,
  LimitDecrease: 5,
  StopLossDecrease: 6,
  Liquidation: 7,
} as const;

// Decrease swap types
export const DecreasePositionSwapType = {
  NoSwap: 0,
  SwapPnlTokenToCollateralToken: 1,
} as const;

// 30-decimal precision (GMX uses this for USD values)
const USD_DECIMALS = 30;
const USDC_DECIMALS = 6;

// Zero address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

// ═══ ABI Fragments ═══════════════════════════════════════════

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]);

const EXCHANGE_ROUTER_ABI = parseAbi([
  'function multicall(bytes[] calldata data) external payable returns (bytes[] memory)',
  'function sendWnt(address receiver, uint256 amount) external payable',
  'function sendTokens(address token, address receiver, uint256 amount) external payable',
  'function createOrder(((address receiver, address cancellationReceiver, address callbackContract, address uiFeeReceiver, address market, address initialCollateralToken, address[] swapPath), (uint256 sizeDeltaUsd, uint256 initialCollateralDeltaAmount, uint256 triggerPrice, uint256 acceptablePrice, uint256 executionFee, uint256 callbackGasLimit, uint256 minOutputAmount, uint256 validFromTime), uint8 orderType, uint8 decreasePositionSwapType, bool isLong, bool shouldUnwrapNativeToken, bool autoCancel, bytes32 referralCode, bytes32[] dataList) params) external payable returns (bytes32)',
]);

// ═══ Viem Client (Server-Side RPC) ══════════════════════════

const RPC_URL = 'https://arb1.arbitrum.io/rpc';

let _publicClient: ReturnType<typeof createPublicClient> | null = null;

function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(RPC_URL, {
        timeout: 15_000,
        retryCount: 2,
      }),
    });
  }
  return _publicClient;
}

// ═══ Types ═══════════════════════════════════════════════════

export interface GmxMarketInfo {
  address: string;
  label: string;
  indexToken: string;
  longToken: string;
  shortToken: string;
  maxLeverage: number;
  indexPrice?: number;
}

export interface GmxOrderCalldata {
  to: string;
  data: string;
  value: string; // hex ETH value (execution fee)
}

export interface GmxPrepareResult {
  calldata: GmxOrderCalldata;
  orderParams: {
    market: string;
    direction: 'LONG' | 'SHORT';
    collateralUsd: number;
    sizeUsd: number;
    leverage: number;
    acceptablePrice: bigint;
    executionFee: bigint;
  };
}

export interface GmxBalanceInfo {
  usdcBalance: number;
  usdcBalanceRaw: string;
  ethBalance: number;
  ethBalanceRaw: string;
  usdcAllowance: number;
  usdcAllowanceRaw: string;
  needsApproval: boolean;
}

// ═══ Cache Layer ═════════════════════════════════════════════

const cache = new Map<string, { data: unknown; expiresAt: number }>();

function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return Promise.resolve(entry.data as T);

  return fetcher().then(data => {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    // Cleanup old entries
    if (cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (now >= v.expiresAt) cache.delete(k);
      }
    }
    return data;
  });
}

// ═══ Balance & Allowance ════════════════════════════════════

/** Get USDC balance, ETH balance, and USDC allowance for SyntheticsRouter */
export async function getBalanceInfo(walletAddress: string): Promise<GmxBalanceInfo> {
  const client = getPublicClient();
  const addr = walletAddress as Hex;

  const [usdcBalRaw, ethBalRaw, allowanceRaw] = await Promise.all([
    client.readContract({
      address: TOKENS.USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [addr],
    }),
    client.getBalance({ address: addr }),
    client.readContract({
      address: TOKENS.USDC,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [addr, GMX_CONTRACTS.SyntheticsRouter],
    }),
  ]);

  const usdcBalance = Number(formatUnits(usdcBalRaw, USDC_DECIMALS));
  const ethBalance = Number(formatUnits(ethBalRaw, 18));
  const usdcAllowance = Number(formatUnits(allowanceRaw, USDC_DECIMALS));

  return {
    usdcBalance,
    usdcBalanceRaw: usdcBalRaw.toString(),
    ethBalance,
    ethBalanceRaw: ethBalRaw.toString(),
    usdcAllowance,
    usdcAllowanceRaw: allowanceRaw.toString(),
    needsApproval: usdcAllowance < 1_000_000, // less than $1M allowance
  };
}

// ═══ Market Data ════════════════════════════════════════════

/** Get supported markets with basic info */
export function getMarkets(): GmxMarketInfo[] {
  return Object.values(GMX_MARKETS).map(m => ({
    address: m.address,
    label: m.label,
    indexToken: m.indexToken,
    longToken: m.longToken,
    shortToken: m.shortToken,
    maxLeverage: m.maxLeverage,
  }));
}

/** Validate market address */
export function isValidMarket(marketAddress: string): boolean {
  return Object.values(GMX_MARKETS).some(m => m.address.toLowerCase() === marketAddress.toLowerCase());
}

/** Find market by address */
export function findMarket(marketAddress: string) {
  return Object.values(GMX_MARKETS).find(
    m => m.address.toLowerCase() === marketAddress.toLowerCase()
  );
}

// ═══ Execution Fee Estimation ═══════════════════════════════

/** Estimate execution fee for GMX order (returns in wei) */
export async function estimateExecutionFee(): Promise<bigint> {
  // GMX execution fees on Arbitrum are typically 0.0001-0.001 ETH
  // For safety, we overestimate and the excess is refunded
  return cached('exec_fee', 30_000, async () => {
    try {
      const client = getPublicClient();
      const gasPrice = await client.getGasPrice();
      // Typical keeper execution: ~1.5M gas, multiply by current gas price, add 50% buffer
      const estimated = gasPrice * 1_500_000n;
      const withBuffer = (estimated * 150n) / 100n;
      // Minimum 0.0001 ETH, maximum 0.01 ETH
      const min = 100_000_000_000_000n; // 0.0001 ETH
      const max = 10_000_000_000_000_000n; // 0.01 ETH
      if (withBuffer < min) return min;
      if (withBuffer > max) return max;
      return withBuffer;
    } catch {
      return 300_000_000_000_000n; // 0.0003 ETH fallback
    }
  });
}

// ═══ Calldata Builders ══════════════════════════════════════

/** Convert USD amount to 30-decimal BigInt */
function toUsd30(amount: number): bigint {
  // amount is in USD (e.g. 1000.50)
  // GMX uses 30 decimal places for USD
  return BigInt(Math.round(amount * 1e6)) * 10n ** 24n;
}

/** Convert USDC amount to 6-decimal BigInt */
function toUsdc6(amount: number): bigint {
  return BigInt(Math.round(amount * 1e6));
}

/**
 * Build approve calldata for USDC → SyntheticsRouter.
 * User sends this tx from browser wallet.
 */
export function buildApproveCalldata(amount?: bigint): GmxOrderCalldata {
  const approveAmount = amount ?? BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [GMX_CONTRACTS.SyntheticsRouter, approveAmount],
  });

  return {
    to: TOKENS.USDC,
    data,
    value: '0x0',
  };
}

/**
 * Build multicall calldata for opening a GMX V2 position.
 * Returns calldata that the user's wallet sends as a transaction.
 */
export async function buildIncreaseOrderCalldata(params: {
  market: string;
  isLong: boolean;
  collateralUsd: number;   // e.g. 100 (USDC)
  leverage: number;         // e.g. 10
  walletAddress: string;
  acceptablePriceUsd?: number; // override acceptable price
  slPrice?: number;
  tpPrice?: number;
}): Promise<GmxPrepareResult> {
  const { market, isLong, collateralUsd, leverage, walletAddress } = params;

  const marketInfo = findMarket(market);
  if (!marketInfo) throw new Error(`Unknown market: ${market}`);

  // Calculate values
  const sizeUsd = collateralUsd * leverage;
  const sizeDeltaUsd = toUsd30(sizeUsd);
  const collateralAmount = toUsdc6(collateralUsd);
  const executionFee = await estimateExecutionFee();

  // Acceptable price: use a generous slippage (0.5%) from a very high/low value
  // In production, you'd read the oracle price. For now, use extreme bounds.
  const acceptablePrice = isLong
    ? toUsd30(params.acceptablePriceUsd ?? 999_999) // max price for long
    : toUsd30(params.acceptablePriceUsd ?? 0.01);  // min price for short

  // Build CreateOrderParams tuple expected by ExchangeRouter ABI.
  const orderParams = [
    {
      receiver: walletAddress as Hex,
      cancellationReceiver: ZERO_ADDRESS,
      callbackContract: ZERO_ADDRESS,
      uiFeeReceiver: ZERO_ADDRESS,
      market: marketInfo.address as Hex,
      initialCollateralToken: TOKENS.USDC as Hex,
      swapPath: [] as readonly Hex[],
    },
    {
      sizeDeltaUsd,
      initialCollateralDeltaAmount: collateralAmount,
      triggerPrice: 0n,
      acceptablePrice,
      executionFee,
      callbackGasLimit: 0n,
      minOutputAmount: 0n,
      validFromTime: 0n,
    },
    OrderType.MarketIncrease,
    DecreasePositionSwapType.NoSwap,
    isLong,
    false,
    false,
    ZERO_BYTES32 as Hex,
    [] as readonly Hex[],
  ] as const;

  // Encode individual function calls for multicall
  const sendWntData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'sendWnt',
    args: [GMX_CONTRACTS.OrderVault, executionFee],
  });

  const sendTokensData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'sendTokens',
    args: [TOKENS.USDC, GMX_CONTRACTS.OrderVault, collateralAmount],
  });

  const createOrderData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'createOrder',
    args: [orderParams],
  });

  // Encode multicall
  const multicallData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'multicall',
    args: [[sendWntData, sendTokensData, createOrderData]],
  });

  return {
    calldata: {
      to: GMX_CONTRACTS.ExchangeRouter,
      data: multicallData,
      value: `0x${executionFee.toString(16)}`,
    },
    orderParams: {
      market: marketInfo.address,
      direction: isLong ? 'LONG' : 'SHORT',
      collateralUsd,
      sizeUsd,
      leverage,
      acceptablePrice,
      executionFee,
    },
  };
}

/**
 * Build calldata for closing (decreasing) a GMX V2 position.
 */
export async function buildDecreaseOrderCalldata(params: {
  market: string;
  isLong: boolean;
  sizeUsd: number;         // how much to close (in USD)
  collateralUsd: number;   // collateral to withdraw
  walletAddress: string;
  acceptablePriceUsd?: number;
}): Promise<GmxOrderCalldata> {
  const { market, isLong, sizeUsd, collateralUsd, walletAddress } = params;

  const marketInfo = findMarket(market);
  if (!marketInfo) throw new Error(`Unknown market: ${market}`);

  const sizeDeltaUsd = toUsd30(sizeUsd);
  const collateralDelta = toUsdc6(collateralUsd);
  const executionFee = await estimateExecutionFee();

  // For decrease: Long wants min price, Short wants max price
  const acceptablePrice = isLong
    ? toUsd30(params.acceptablePriceUsd ?? 0.01)
    : toUsd30(params.acceptablePriceUsd ?? 999_999);

  const orderParams = [
    {
      receiver: walletAddress as Hex,
      cancellationReceiver: ZERO_ADDRESS,
      callbackContract: ZERO_ADDRESS,
      uiFeeReceiver: ZERO_ADDRESS,
      market: marketInfo.address as Hex,
      initialCollateralToken: TOKENS.USDC as Hex,
      swapPath: [] as readonly Hex[],
    },
    {
      sizeDeltaUsd,
      initialCollateralDeltaAmount: collateralDelta,
      triggerPrice: 0n,
      acceptablePrice,
      executionFee,
      callbackGasLimit: 0n,
      minOutputAmount: 0n,
      validFromTime: 0n,
    },
    OrderType.MarketDecrease,
    DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
    isLong,
    false,
    false,
    ZERO_BYTES32 as Hex,
    [] as readonly Hex[],
  ] as const;

  const sendWntData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'sendWnt',
    args: [GMX_CONTRACTS.OrderVault, executionFee],
  });

  const createOrderData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'createOrder',
    args: [orderParams],
  });

  const multicallData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'multicall',
    args: [[sendWntData, createOrderData]],
  });

  return {
    to: GMX_CONTRACTS.ExchangeRouter,
    data: multicallData,
    value: `0x${executionFee.toString(16)}`,
  };
}

// ═══ Position Queries ═══════════════════════════════════════

/**
 * Get the GMX position key for a given account/market/direction.
 * positionKey = keccak256(abi.encode(account, market, collateralToken, isLong))
 */
export function getPositionKey(
  account: string,
  market: string,
  collateralToken: string,
  isLong: boolean,
): string {
  // We'll import keccak256 and encode from viem
  const { keccak256, encodeAbiParameters, parseAbiParameters } = require('viem');
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('address, address, address, bool'),
      [account as Hex, market as Hex, collateralToken as Hex, isLong]
    )
  );
}

/**
 * Check if a transaction has been confirmed on-chain.
 * Returns the receipt if mined, null if pending.
 */
export async function getTransactionReceipt(txHash: string) {
  try {
    const client = getPublicClient();
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
    return receipt;
  } catch {
    return null; // Tx not yet mined
  }
}

/**
 * Wait for transaction to be mined (with timeout).
 */
export async function waitForTransaction(txHash: string, timeoutMs = 60_000) {
  const client = getPublicClient();
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash as Hex,
      timeout: timeoutMs,
    });
    return receipt;
  } catch {
    return null;
  }
}
