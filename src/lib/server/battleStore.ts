// ═══════════════════════════════════════════════════════════════
// COGOCHI — In-memory battle state store (MVP)
// Will move to Redis/DB later
// ═══════════════════════════════════════════════════════════════

import type { BattleTickState } from '$lib/engine/v4/types.js';

export const activeBattles = new Map<string, BattleTickState>();
