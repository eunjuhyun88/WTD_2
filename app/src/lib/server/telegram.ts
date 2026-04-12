// ═══════════════════════════════════════════════════════════════
// Telegram Bot API — 알림 전송 유틸리티
// ═══════════════════════════════════════════════════════════════
//
// 환경변수:
//   TELEGRAM_BOT_TOKEN    — BotFather에서 발급
//   TELEGRAM_ALERT_CHAT_ID — 알림 수신 채팅 ID (개인 or 그룹)

import { env } from '$env/dynamic/private';

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Telegram 메시지 전송.
 * 설정 안 된 경우(토큰/채팅ID 없음) 조용히 skip.
 */
export async function sendTelegramMessage(
  text: string,
  chatId?: string,
): Promise<TelegramSendResult> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const target = chatId ?? env.TELEGRAM_ALERT_CHAT_ID;

  if (!token || !target) return { ok: false, error: 'not_configured' };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: target,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return { ok: false, error: `${res.status}: ${err.slice(0, 100)}` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'fetch failed' };
  }
}

/**
 * Alpha Score 임계값 초과 코인 알림 메시지 포맷.
 */
export function formatAlphaAlert(coins: Array<{
  symbol: string;
  alphaScore: number;
  alphaLabel: string;
  verdict: string;
  price: number;
  change24h: number;
  flags: (string | null)[];
}>): string {
  const lines = coins.map(c => {
    const dir = c.alphaScore >= 0 ? '🟢' : '🔴';
    const score = c.alphaScore > 0 ? `+${c.alphaScore}` : `${c.alphaScore}`;
    const chg = c.change24h > 0 ? `+${c.change24h.toFixed(1)}%` : `${c.change24h.toFixed(1)}%`;
    const flags = c.flags.filter(Boolean).join(' ');
    return `${dir} <b>${c.symbol}</b>  α${score}  ${chg}  ${flags}`.trim();
  });

  return [
    `⚡ <b>DOUNI ALPHA ALERT</b>`,
    `${new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })} KST`,
    '',
    ...lines,
  ].join('\n');
}
