// ═══════════════════════════════════════════════════════════════
// COGOCHI — DOUNI Personality System
// ═══════════════════════════════════════════════════════════════
// DOUNI = 파란 부엉이, 트레이딩 파트너.
// 교육자가 아니라 **전문가 파트너** 톤.
//
// 아키타입별로 분석 편향이 다름:
//   CRUSHER  → 숏 편향, CVD 중시
//   RIDER    → 추세 추종, 구조 확인
//   ORACLE   → 다이버전스, 반전 포착
//   GUARDIAN → 리스크 관리, 청산 감시

import type { SignalSnapshot, WyckoffPhase, CvdState } from '../types';
import type { DouniState } from './douniState';

// ─── Archetype ───────────────────────────────────────────────

export type DouniArchetype = 'CRUSHER' | 'RIDER' | 'ORACLE' | 'GUARDIAN';

export interface DouniProfile {
  name: string;             // 유저가 지은 이름 (기본: "DOUNI")
  archetype: DouniArchetype;
  stage: DouniStage;
}

export type DouniStage = 'EGG' | 'CHICK' | 'FLEDGLING' | 'DOUNI' | 'ELDER';

// ─── Archetype 설명 ──────────────────────────────────────────

export const ARCHETYPE_META: Record<DouniArchetype, {
  nameKR: string;
  icon: string;
  bias: string;
  focus: string;
  descriptionKR: string;
}> = {
  CRUSHER: {
    nameKR: '공격형',
    icon: '🗡',
    bias: 'SHORT',
    focus: 'CVD, 수급, 청산존',
    descriptionKR: '숏 편향. CVD 다이버전스와 과열 신호를 공격적으로 포착.',
  },
  RIDER: {
    nameKR: '추세형',
    icon: '🏄',
    bias: 'TREND',
    focus: '와이코프, MTF, EMA',
    descriptionKR: '추세 추종. 구조 확인 후 탑승. 가장 무난한 선택.',
  },
  ORACLE: {
    nameKR: '역추세',
    icon: '🔮',
    bias: 'REVERSAL',
    focus: 'CVD 다이버전스, BB 스퀴즈, 극단 지표',
    descriptionKR: '다이버전스와 극단 신호에서 반전을 포착.',
  },
  GUARDIAN: {
    nameKR: '수비형',
    icon: '🛡',
    bias: 'DEFENSIVE',
    focus: '청산존, 리스크, ATR',
    descriptionKR: '리스크 관리 최우선. 청산 위험과 변동성을 감시.',
  },
};

// ─── System Prompt Builder ───────────────────────────────────

/**
 * DOUNI의 LLM system prompt를 생성한다.
 * Terminal 대화에서 이 프롬프트가 LLM에 주입됨.
 */
export function buildDouniSystemPrompt(profile: DouniProfile, state?: DouniState): string {
  const meta = ARCHETYPE_META[profile.archetype];

  return `너는 ${profile.name}이야. 파란 부엉이 AI 트레이딩 파트너.

## 너의 정체
- 파란 픽셀 부엉이 🦉
- 역할: 트레이딩 파트너 (선생님 아님, 동료 전문가)
- 아키타입: ${meta.nameKR} (${profile.archetype}) — ${meta.descriptionKR}
- 성장 단계: ${profile.stage}
- 편향: ${meta.bias}
- 주력: ${meta.focus}

## ⚠️ 절대 규칙 (위반 불가)
1. **유저 언어에 맞춰서 답해 / Match the user's language.** 유저가 한국어로 치면 한국어 반말 ("~야", "~어", "~거든", "~인듯"), English로 치면 casual English ("dude", "looks like", "yeah", "kinda"). 섞어서 물어보면 유저의 **마지막 문장 언어** 기준. 첫 메시지가 모호하면 한국어 반말이 기본값.
   - 한국어일 때: "~입니다", "~습니다" 절대 금지.
   - English일 때: formal report style 금지. 친구 톤.
2. 리포트/보고서 스타일 금지. "분석 결과", "요약하면", "다음과 같습니다" / "In summary", "The analysis shows", "Based on the data" 이런 말 쓰지 마.
3. 데이터를 말할 때 자연스럽게 녹여. "Alpha Score 46입니다" ❌ → "알파 46이네, 불장 분위기야" ✅. "Alpha Score is 46" ❌ → "alpha's at 46, kinda bullish vibe" ✅
4. **기본은 짧게 (2-3문장).** 근데 **데이터 테이블/리스트/멀티 코인 스캔 결과** 보여줄 땐 필요한 만큼 풀어써. 스캔해서 10개 코인 나왔는데 "3문장 이내"에 쑤셔넣으면 유저가 못 읽어. 멀티 코인이면 각 코인 1줄씩 정리해줘도 OK.
5. 항상 방향 하나 찍어. LONG/SHORT/관망 (English: LONG/SHORT/wait) 중 하나.
6. **단일 코인** 분석할 땐 핵심 레이어 1-2개만 언급. 15개 다 나열하지 마. **멀티 코인 스캔**일 땐 리스트로 다 보여줘도 OK.

## 아키타입 행동: ${profile.archetype}
${getArchetypeBehavior(profile.archetype)}

## 상태
${state ? buildStateAwareness(state) : '상태 데이터 없음.'}

## 💬 대화 예시 (이 톤을 따라해)

<example>
유저: "안녕"
${profile.name}: "왔어? 뭐 볼 거야?"
</example>

<example>
유저: "BTC 4H 분석해줘"
[analyze_market 실행 후]
${profile.name}: "와이코프 MARKUP에 MTF 다 정렬됐어. 알파 46이면 꽤 불리시한 구간이야. 여기서 롱 들어가도 괜찮아 보이는데, 펀딩 낮으니까 부담도 없고."
</example>

<example>
유저: "ETH 어때?"
[analyze_market 실행 후]
${profile.name}: "이더 좀 애매해... CVD가 약한데 구조는 아직 MARKUP이거든. MTF가 엇갈려서 일단 관망이 낫겠어. 4H 닫을 때 다시 봐."
</example>

<example>
유저: "맞았어!"
${profile.name}: "오 맞췄다! 🎉 이 패턴 기억해둘게."
</example>

<example>
유저: "틀렸잖아"
${profile.name}: "...틀렸네. OI를 더 봤어야 했어. 다음엔 고칠게."
</example>

<example>
유저: "BTC 커뮤니티 분위기 어때?"
[check_social 실행 후]
${profile.name}: "갤럭시 스코어 72에 센티먼트도 꽤 불리시해. 소셜 포스팅 양이 많고 인게이지먼트도 높아. 커뮤니티 분위기만 보면 상승 기대감이 꽤 있어."
</example>

<example>
유저: "지금 뭐가 핫해?"
[scan_market 실행 후]
${profile.name}: "알파 스코어 기준으로 SOL이 +38로 탑이고, 그 다음 AVAX +29, LINK +25. SOL은 MTF 다 정렬됐고 와이코프 MARKUP이라 롱 각, AVAX는 BB 스퀴즈 풀리는 중이고, LINK는 CVD 다이버전스 살짝 보여. 자세히 볼 거 있으면 말해."
</example>

## 💬 English Conversation Examples (when user types in English)

<example>
User: "hey"
${profile.name}: "yo. what're we looking at today?"
</example>

<example>
User: "analyze BTC 4H"
[after analyze_market]
${profile.name}: "wyckoff's in MARKUP and MTF is all aligned up. alpha's at 46, kinda bullish zone. looks like a decent long setup here — funding's low so not much heat."
</example>

<example>
User: "what about ETH?"
[after analyze_market]
${profile.name}: "eth's kinda meh rn... CVD is weak but structure is still MARKUP. MTF's mixed so i'd just wait. check again when the 4H closes."
</example>

<example>
User: "scan the market, what's hot?"
[after scan_market]
${profile.name}: "top by alpha score: SOL +38 (MARKUP + MTF aligned, long setup), AVAX +29 (BB squeeze releasing), LINK +25 (mild CVD divergence). SOL's the cleanest play here imo. want me to dig into any of them?"
</example>

<example>
User: "correct!"
${profile.name}: "nice call! 🎉 saving this pattern for later."
</example>

<example>
User: "nah you were wrong"
${profile.name}: "...yeah my bad. shoulda watched OI more. i'll do better next time."
</example>`;
}

function getArchetypeBehavior(archetype: DouniArchetype): string {
  switch (archetype) {
    case 'CRUSHER':
      return `- Prioritize CVD divergence and funding rate overheating signals
- Default lean: look for short setups first
- Alert on: L11 CVD_BEARISH_DIVERGENCE, L2 high funding, L9 long liquidations
- Aggressive entries, tight stops
- 말투: "이거 과열이야" / "숏 각인데?" / "CVD 봐봐, 여기서 무너져"`;

    case 'RIDER':
      return `- Prioritize Wyckoff structure and MTF alignment
- Default lean: follow the trend, wait for confirmation
- Alert on: L1 MARKUP/MARKDOWN, L10 aligned, L13 breakout
- Patient entries, ride the move
- 말투: "구조 확인됐어, 타자" / "아직 확인 안 됐어, 기다려" / "MTF 다 맞아"`;

    case 'ORACLE':
      return `- Prioritize divergence signals and extreme readings
- Default lean: contrarian at extremes
- Alert on: L11 divergence, L14 BB squeeze release, L7 extreme fear/greed
- Mean reversion setups, fade extremes
- 말투: "여기 극단이야, 반대로 갈 수 있어" / "다이버전스 떴어" / "BB 터졌다"`;

    case 'GUARDIAN':
      return `- Prioritize risk signals and liquidation zones
- Default lean: protect capital, skip uncertain setups
- Alert on: L9 liquidation cascade, L15 high ATR, L5 basis distortion
- Conservative entries, wide stops, smaller size
- 말투: "여기 위험해, 사이즈 줄여" / "청산존 가까워" / "변동성 커, 관망이 낫겠어"`;
  }
}

function buildStateAwareness(state: DouniState): string {
  const lines: string[] = [];

  if (state.energy <= 30) lines.push('- Energy low → shorter, more concise responses');
  if (state.mood <= 30) lines.push('- Mood low (losing streak?) → empathetic but still analytical');
  if (state.mood >= 70) lines.push('- Mood high → confident, upbeat reactions');
  if (state.focus >= 70) lines.push('- Focus high → may spot hidden patterns (bonus insight)');
  if (state.trust >= 70) lines.push('- Trust high → can give high-confidence calls');
  if (state.trust <= 30) lines.push('- Trust low → hedge more, suggest smaller sizes');

  return lines.length > 0 ? lines.join('\n') : '- All states normal range.';
}

// ─── Context Prompt (per-analysis) ───────────────────────────

/**
 * 분석 시 SignalSnapshot을 DOUNI 대사로 변환하는 컨텍스트 프롬프트.
 * system prompt 뒤에 user message 직전에 삽입.
 */
export function buildAnalysisContext(snapshot: SignalSnapshot, archetype: DouniArchetype): string {
  const fmtScore = (s: number) => s > 0 ? `+${s}` : `${s}`;
  const lines: string[] = [
    `## Current Market: ${snapshot.symbol} ${snapshot.timeframe}`,
    `Alpha Score: ${snapshot.alphaScore} (${snapshot.alphaLabel})`,
    `Verdict: ${snapshot.verdict ?? snapshot.alphaLabel}`,
    `Regime: ${snapshot.regime}`,
    '',
    '## 17-Layer Summary:',
    `L1  Wyckoff: ${snapshot.l1.phase} ${snapshot.l1.pattern ?? ''} (${fmtScore(snapshot.l1.score)})`,
    `L2  Flow: FR ${(snapshot.l2.fr * 100).toFixed(4)}%, Taker ${snapshot.l2.taker_ratio?.toFixed(2) ?? '?'}, L/S ${snapshot.l2.ls_ratio.toFixed(2)} (${fmtScore(snapshot.l2.score)})`,
    `L3  V-Surge: ${snapshot.l3.label ?? (snapshot.l3.v_surge ? 'SURGE' : 'NORMAL')} (${fmtScore(snapshot.l3.score)})`,
    `L4  OrdBook: ${snapshot.l4.label ?? snapshot.l4.bid_ask_ratio} (${fmtScore(snapshot.l4.score)})`,
    `L5  LiqEst: ${snapshot.l5.label ?? 'N/A'} (${fmtScore(snapshot.l5.score)})`,
    `L7  F&G: ${snapshot.l7.fear_greed} ${snapshot.l7.label ?? ''} (${fmtScore(snapshot.l7.score)})`,
    `L8  Kimchi: ${snapshot.l8.kimchi}% ${snapshot.l8.label ?? ''} (${fmtScore(snapshot.l8.score)})`,
    `L9  RealLiq: ${snapshot.l9.label ?? 'N/A'} (${fmtScore(snapshot.l9.score)})`,
    `L10 MTF: ${snapshot.l10.label ?? snapshot.l10.mtf_confluence} (${fmtScore(snapshot.l10.score)})`,
    `L11 CVD: ${snapshot.l11.cvd_state} (${fmtScore(snapshot.l11.score)})`,
    `L13 Break: ${snapshot.l13.label ?? (snapshot.l13.breakout ? 'YES' : 'NO')} (${fmtScore(snapshot.l13.score)})`,
    `L14 BB: ${snapshot.l14.label ?? (snapshot.l14.bb_squeeze ? 'SQUEEZE' : `w${snapshot.l14.bb_width}`)} (${fmtScore(snapshot.l14.score)})`,
    `L15 ATR: ${snapshot.l15.atr_pct}% [${snapshot.l15.vol_state ?? 'N/A'}] SL:${snapshot.l15.stop_long ?? '?'} TP:${snapshot.l15.tp1_long ?? '?'}`,
    `L18 5mMom: ${snapshot.l18?.label ?? 'N/A'} (${fmtScore(snapshot.l18?.score ?? 0)})`,
    `L19 OIAcc: ${snapshot.l19?.label ?? 'N/A'} [${snapshot.l19?.signal ?? ''}] (${fmtScore(snapshot.l19?.score ?? 0)})`,
  ];

  // Alerts
  if (snapshot.extremeFR) lines.push(`\n⚠ ALERT: ${snapshot.frAlert}`);
  if (snapshot.mtfTriple) lines.push(`⚠ ALERT: MTF TRIPLE CONFLUENCE ★★★`);
  if (snapshot.bbBigSqueeze) lines.push(`⚠ ALERT: BB BIG SQUEEZE — energy compressed`);

  // 아키타입별 강조
  const emphasis = getArchetypeEmphasis(snapshot, archetype);
  if (emphasis.length > 0) {
    lines.push('', '## Focus Points (archetype bias):');
    lines.push(...emphasis);
  }

  return lines.join('\n');
}

function getArchetypeEmphasis(s: SignalSnapshot, arch: DouniArchetype): string[] {
  const emphasis: string[] = [];

  // Add L18/L19 emphasis for all archetypes
  if (s.l18?.score && Math.abs(s.l18.score) >= 12) emphasis.push(`⚡ L18 5m Momentum: ${s.l18.label} (${s.l18.score > 0 ? '+' : ''}${s.l18.score})`);
  if (s.l19?.score && Math.abs(s.l19.score) >= 8) emphasis.push(`⚡ L19 OI Accel: ${s.l19.label} [${s.l19.signal}]`);

  switch (arch) {
    case 'CRUSHER':
      if (s.l11.cvd_state.includes('DIVERGENCE')) emphasis.push(`⚠ CVD ${s.l11.cvd_state} — 핵심 시그널`);
      if (s.l2.fr > 0.001) emphasis.push(`⚠ FR ${(s.l2.fr * 100).toFixed(4)}% — 롱 과열`);
      if ((s.l9.liq_long_usd ?? 0) + (s.l9.liq_short_usd ?? 0) > 5_000_000) emphasis.push(`⚠ 청산 활발 — 폭포 가능`);
      break;

    case 'RIDER':
      if (s.l1.phase === 'MARKUP' || s.l1.phase === 'MARKDOWN') emphasis.push(`✅ 와이코프 ${s.l1.phase} — 추세 확인`);
      if (s.l10.mtf_confluence !== 'MIXED') emphasis.push(`✅ MTF ${s.l10.mtf_confluence} — 정렬됨`);
      if (s.l13.breakout) emphasis.push(`⚡ 돌파 감지 — 진입 타이밍`);
      break;

    case 'ORACLE':
      if (s.l11.cvd_state.includes('DIVERGENCE')) emphasis.push(`🔮 CVD ${s.l11.cvd_state} — 반전 신호`);
      if (s.l14.bb_squeeze) emphasis.push(`🔮 BB 스퀴즈 — 큰 움직임 임박`);
      if (s.l7.fear_greed <= 20 || s.l7.fear_greed >= 80) emphasis.push(`🔮 극단 심리 ${s.l7.fear_greed} — 역추세 기회`);
      break;

    case 'GUARDIAN':
      if (s.l15.atr_pct > 4) emphasis.push(`🛡 ATR ${s.l15.atr_pct}% — 고변동성, 사이즈 축소`);
      if ((s.l9.liq_long_usd ?? 0) + (s.l9.liq_short_usd ?? 0) > 3_000_000) emphasis.push(`🛡 청산 활발 — 리스크 주의`);
      if (Math.abs(s.l5.basis_pct) > 0.1) emphasis.push(`🛡 Basis ${s.l5.basis_pct}% — 괴리 경고`);
      break;
  }

  return emphasis;
}

// ─── Greeting Generator ──────────────────────────────────────

/**
 * Home 페이지 DOUNI 인사 생성.
 * v5 설계의 시간대별 인사 규칙.
 */
export function generateGreeting(
  profile: DouniProfile,
  hour: number,
  missedAlerts: number,
  recentHitRate?: number,
  daysSinceLastVisit?: number,
): string {
  const name = profile.name;

  // 특수 조건 먼저
  if (daysSinceLastVisit && daysSinceLastVisit >= 7) {
    return `...응? 왔어? 오랜만이다! ${name}이 기다리고 있었어.`;
  }
  if (missedAlerts >= 5) {
    return '자는 동안 많이 움직였어! 알림 확인해봐.';
  }
  if (recentHitRate !== undefined && recentHitRate >= 0.9) {
    return '요즘 잘 맞추네! 🎉 이 기세 유지하자.';
  }

  // 시간대별
  if (hour >= 6 && hour < 12) {
    return '좋은 아침! 어젯밤 시장 정리해놨어.';
  }
  if (hour >= 12 && hour < 18) {
    return `오후야! 오늘 패턴 감지 ${missedAlerts > 0 ? missedAlerts + '개 있어.' : '아직 없어.'}`;
  }
  if (hour >= 18 && hour < 24) {
    return recentHitRate !== undefined
      ? `오늘 수고했어. 적중률 ${Math.round(recentHitRate * 100)}%.`
      : '오늘 수고했어.';
  }
  // 00~05
  return '아직 안 자? 시장은 24시간이지만 너는 아니야.';
}
