/**
 * telemetry/exchange.ts — Exchange API key 등록/삭제 이벤트 추적
 *
 * 규칙:
 * - api_key, secret 절대 미포함
 * - user_id 절대 미포함 (PostHog 자체 anonymous ID 사용)
 * - exchange 이름만 포함
 */
import { track } from '$lib/analytics';

export type ExchangeEventCode =
  | 'read_only_ok'
  | 'trading_enabled'
  | 'invalid_key'
  | 'network_error';

/** API Key 등록 성공 */
export function trackExchangeKeyRegistered(exchange: string, ipRestrict: boolean): void {
  track('exchange_key_registered', {
    exchange,
    ip_restrict: ipRestrict,
  });
}

/** API Key 삭제 */
export function trackExchangeKeyDeleted(exchange: string): void {
  track('exchange_key_deleted', { exchange });
}

/** API Key 검증 실패 */
export function trackExchangeKeyValidationFailed(
  exchange: string,
  code: ExchangeEventCode,
): void {
  track('exchange_key_validation_failed', { exchange, code });
}

/** 가이드 accordion 열기 */
export function trackExchangeGuideViewed(exchange: string): void {
  track('exchange_guide_viewed', { exchange });
}
