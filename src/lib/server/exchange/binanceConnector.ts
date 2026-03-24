// ═══════════════════════════════════════════════════════════════
// COGOCHI — Binance Futures Trade Importer
// Fetches user trade history via Binance Futures API
// Design: Cogochi_SystemDesign § 3 (Builder path Step 2)
// ═══════════════════════════════════════════════════════════════

import { query } from '$lib/server/db.js';
import crypto from 'node:crypto';

// ─── Types ─────────────────────────────────────────────────────

export interface ExchangeConnection {
  id: string;
  userId: string;
  exchange: string;
  apiKeyEncrypted: string;
  apiSecretEncrypted: string;
  permissions: string[];
  label?: string;
  status: string;
}

export interface NormalizedTrade {
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  quoteQuantity: number;
  fee: number;
  feeAsset: string;
  realizedPnl: number;
  tradeTime: Date;
  externalId: string;
}

interface BinanceFuturesTrade {
  symbol: string;
  id: number;
  orderId: number;
  side: string;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  realizedPnl: string;
  time: number;
  buyer: boolean;
  maker: boolean;
}

// ─── API Key encryption (simple AES-256-GCM) ──────────────────

const ENCRYPTION_KEY = process.env.EXCHANGE_ENCRYPTION_KEY ?? 'default-dev-key-change-in-production!!';

export function encryptApiKey(plaintext: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'cogochi-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptApiKey(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'cogochi-salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── Save exchange connection ──────────────────────────────────

export async function saveConnection(
  userId: string,
  exchange: string,
  apiKey: string,
  apiSecret: string,
  label?: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const result = await query<{ id: string }>(
      `INSERT INTO exchange_connections (user_id, exchange, api_key_encrypted, api_secret_encrypted, label)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, exchange, encryptApiKey(apiKey), encryptApiKey(apiSecret), label ?? null],
    );
    return { success: true, id: result.rows[0]?.id };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

// ─── Fetch trades from Binance Futures ─────────────────────────

export async function fetchBinanceTrades(
  apiKey: string,
  apiSecret: string,
  symbol: string = 'BTCUSDT',
  startTime?: number,
  limit: number = 1000,
): Promise<{ trades: NormalizedTrade[]; error?: string }> {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({
      symbol,
      limit: String(limit),
      timestamp: String(timestamp),
      recvWindow: '10000',
    });
    if (startTime) params.set('startTime', String(startTime));

    // Sign request
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(params.toString())
      .digest('hex');
    params.set('signature', signature);

    const url = `https://fapi.binance.com/fapi/v1/userTrades?${params}`;
    const res = await fetch(url, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { trades: [], error: `Binance API error ${res.status}: ${errBody}` };
    }

    const rawTrades: BinanceFuturesTrade[] = await res.json();

    const trades = rawTrades.map(t => normalizeBinanceTrade(t));
    return { trades };
  } catch (err: any) {
    return { trades: [], error: err?.message };
  }
}

// ─── Save imported trades to DB ────────────────────────────────

export async function saveImportedTrades(
  userId: string,
  connectionId: string,
  trades: NormalizedTrade[],
  source: string = 'binance_api',
): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;

  for (const trade of trades) {
    try {
      await query(
        `INSERT INTO imported_trades (
          user_id, connection_id, source, symbol, side, price, quantity,
          quote_quantity, fee, fee_asset, realized_pnl, trade_time, external_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (user_id, source, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
        [
          userId, connectionId, source, trade.symbol, trade.side,
          trade.price, trade.quantity, trade.quoteQuantity,
          trade.fee, trade.feeAsset, trade.realizedPnl,
          trade.tradeTime, trade.externalId,
        ],
      );
      saved++;
    } catch {
      skipped++;
    }
  }

  // Update last synced
  await query(
    `UPDATE exchange_connections SET last_synced_at = NOW() WHERE id = $1`,
    [connectionId],
  ).catch(() => {});

  return { saved, skipped };
}

// ─── Normalize ─────────────────────────────────────────────────

function normalizeBinanceTrade(raw: BinanceFuturesTrade): NormalizedTrade {
  return {
    symbol: raw.symbol,
    side: raw.side as 'BUY' | 'SELL',
    price: parseFloat(raw.price),
    quantity: parseFloat(raw.qty),
    quoteQuantity: parseFloat(raw.quoteQty),
    fee: parseFloat(raw.commission),
    feeAsset: raw.commissionAsset,
    realizedPnl: parseFloat(raw.realizedPnl),
    tradeTime: new Date(raw.time),
    externalId: String(raw.id),
  };
}
