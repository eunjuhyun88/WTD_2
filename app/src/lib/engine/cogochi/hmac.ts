// ═══════════════════════════════════════════════════════════════
// COGOCHI — HMAC-SHA256 위변조 서명
// ═══════════════════════════════════════════════════════════════
// 모든 SignalSnapshot에 HMAC 서명을 붙여서
// 클라이언트 측 위변조를 방지한다.
// Market 등록 시 서명 검증 필수.

import { createHmac } from 'node:crypto';
import type { SignalSnapshot } from './types';

// 환경변수에서 키를 가져옴. 없으면 dev 기본키 (프로덕션에서는 반드시 설정)
const HMAC_SECRET = typeof process !== 'undefined'
  ? (process.env?.COGOCHI_HMAC_SECRET ?? 'dev-cogochi-hmac-key-change-in-production')
  : 'dev-cogochi-hmac-key-change-in-production';

/**
 * SignalSnapshot의 핵심 필드를 직렬화하여 HMAC-SHA256 서명 생성.
 * hmac 필드 자체는 제외하고 서명.
 */
export function signSnapshot(snapshot: SignalSnapshot): string {
  const payload = buildPayload(snapshot);
  const hmac = createHmac('sha256', HMAC_SECRET);
  hmac.update(payload);
  return hmac.digest('hex');
}

/**
 * SignalSnapshot + hmac 값을 받아 서명을 검증한다.
 * @returns true면 유효, false면 위변조
 */
export function verifySnapshot(snapshot: SignalSnapshot): boolean {
  const expected = signSnapshot({ ...snapshot, hmac: '' });
  return expected === snapshot.hmac;
}

/**
 * 서명 대상 페이로드 생성.
 * 결정론적(deterministic) JSON 직렬화 — 키 순서 고정.
 */
function buildPayload(snapshot: SignalSnapshot): string {
  // 핵심 불변 필드만 포함 (hmac 제외)
  return JSON.stringify({
    s: snapshot.symbol,
    tf: snapshot.timeframe,
    ts: snapshot.timestamp,
    alpha: snapshot.alphaScore,
    regime: snapshot.regime,
    l1: snapshot.l1.score,
    l2: snapshot.l2.score,
    l3: snapshot.l3.score,
    l4: snapshot.l4.score,
    l5: snapshot.l5.score,
    l6: snapshot.l6.score,
    l7: snapshot.l7.score,
    l8: snapshot.l8.score,
    l9: snapshot.l9.score,
    l10: snapshot.l10.score,
    l11: snapshot.l11.score,
    l12: snapshot.l12.score,
    l13: snapshot.l13.score,
    l14: snapshot.l14.score,
    l15: snapshot.l15.score,
    l18: snapshot.l18.score,
    l19: snapshot.l19.score,
  });
}
