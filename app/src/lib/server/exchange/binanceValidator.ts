import crypto from 'node:crypto';

export interface ApiPermissions {
  enableReading: boolean;
  enableSpotAndMarginTrading: boolean;
  enableWithdrawals: boolean;
  enableFutures: boolean;
  enableMargin: boolean;
  ipRestrict: boolean;
}

export interface ValidationResult {
  ok: boolean;
  permissions?: ApiPermissions;
  error?: string;
  code?: 'trading_enabled' | 'invalid_key' | 'network_error' | 'read_only_ok';
}

export async function validateBinanceReadOnly(
  apiKey: string,
  apiSecret: string,
): Promise<ValidationResult> {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({ timestamp: String(timestamp), recvWindow: '5000' });
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(params.toString())
      .digest('hex');
    params.set('signature', signature);

    const url = `https://api.binance.com/sapi/v1/account/apiRestrictions?${params}`;
    const res = await fetch(url, {
      headers: { 'X-MBX-APIKEY': apiKey },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const isInvalidKey = res.status === 401 || body.includes('-2014') || body.includes('-1002');
      return {
        ok: false,
        error: isInvalidKey ? '유효하지 않은 API Key입니다.' : `Binance 오류 ${res.status}`,
        code: isInvalidKey ? 'invalid_key' : 'network_error',
      };
    }

    const data = await res.json() as ApiPermissions;

    // Block trading-capable keys
    if (data.enableSpotAndMarginTrading || data.enableWithdrawals || data.enableFutures) {
      return {
        ok: false,
        permissions: data,
        error: 'Trading 권한이 활성화된 키는 허용되지 않습니다. Read-Only 키만 등록 가능합니다.',
        code: 'trading_enabled',
      };
    }

    if (!data.enableReading) {
      return {
        ok: false,
        permissions: data,
        error: 'Read 권한이 비활성화된 키입니다.',
        code: 'invalid_key',
      };
    }

    return { ok: true, permissions: data, code: 'read_only_ok' };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '네트워크 오류',
      code: 'network_error',
    };
  }
}
