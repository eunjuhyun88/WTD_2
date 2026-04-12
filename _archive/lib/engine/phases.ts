// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — 5-Phase Match Engine (v3)
// ═══════════════════════════════════════════════════════════════

import type { Phase } from '$lib/stores/gameState';

export const PHASES: Phase[] = [
  'DRAFT',
  'ANALYSIS',
  'HYPOTHESIS',
  'BATTLE',
  'RESULT',
];

export const PHASE_DURATION: Record<Phase, number> = {
  DRAFT: 0,       // user-controlled
  ANALYSIS: 5,
  HYPOTHESIS: 30,
  BATTLE: 12,
  RESULT: 0,      // user-controlled (lobby / replay / play again)
};

export const PHASE_LABELS: Record<Phase, { name: string; color: string; emoji: string }> = {
  DRAFT: { name: 'DRAFT', color: '#8b5cf6', emoji: '⚙️' },
  ANALYSIS: { name: 'ANALYSIS', color: '#cc6600', emoji: '🔍' },
  HYPOTHESIS: { name: 'HYPOTHESIS', color: '#9900cc', emoji: '🎯' },
  BATTLE: { name: 'BATTLE', color: '#cc0033', emoji: '⚔' },
  RESULT: { name: 'RESULT', color: '#00aa44', emoji: '🏆' },
};

export const DOGE_DEPLOYS = ['such deploy! ⚡', 'wow go go!', 'much ready!', 'very start!', 'to the moon! 🌙'];
export const DOGE_GATHER = ['wow report!', 'such data!', 'very finding!', 'much info!', 'so ready!'];
export const DOGE_BATTLE = ['wow battle...', 'such candle!', 'very intense!', 'much volatility!', 'so price action!'];
export const DOGE_WIN = ['WOW TP HIT!!', 'VERY WIN!', 'SUCH GAINS!', 'MUCH PROFIT!', 'WOW! 💪'];
export const DOGE_LOSE = ['such sad...', 'very rekt 😢', 'much pain...', 'wow loss...', 'no moon... 😢'];
export const DOGE_VOTE_LONG = ['TO THE MOON! 🌙', 'LONG! such wow!', 'very bullish! 🔥', 'wow LONG! 💎', 'ALL IN! 🚀'];
export const DOGE_WORDS = ['WOW!', 'SUCH!', 'MUCH!', 'VERY!', 'SO!', 'AMAZE!', 'MOON!', 'HODL!', '💎PAWS!', '🚀MOON!', 'GAINS!', 'PUMP!'];
export const WIN_MOTTOS = ['IF IT DIPS, DOUBLE DOWN', 'I ONLY BUY GREEN', 'IN GAINS WE TRUST', 'PUMP MONTH'];
export const LOSE_MOTTOS = ['NO RISK NO RAMEN', 'SUCH IS DEGEN LIFE', "THE DEGEN'S MANIFESTO", 'REKT BUT HOPEFUL'];

export function getNextPhase(current: Phase): Phase {
  const idx = PHASES.indexOf(current);
  if (idx === -1) return 'DRAFT';
  if (idx >= PHASES.length - 1) return 'RESULT';
  return PHASES[idx + 1];
}

export function getPhaseDuration(phase: Phase, speed: number): number {
  return (PHASE_DURATION[phase] || 2) / Math.max(1, speed);
}
