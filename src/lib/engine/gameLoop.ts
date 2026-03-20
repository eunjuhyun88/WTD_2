// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Game Loop (requestAnimationFrame)
// ═══════════════════════════════════════════════════════════════

import { gameState } from '$lib/stores/gameState';
import { get } from 'svelte/store';
import { getNextPhase, PHASE_DURATION } from './phases';
import type { Phase } from '$lib/stores/gameState';

let lastTime = 0;
let running = false;
let phaseInitialized = false;
let onPhaseInit: ((phase: Phase) => void) | null = null;

export function setPhaseInitCallback(cb: (phase: Phase) => void) {
  onPhaseInit = cb;
}

export function startGameLoop() {
  if (running) return;
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

export function stopGameLoop() {
  running = false;
}

export function resetPhaseInit() {
  phaseInitialized = false;
}

export function advancePhase() {
  const state = get(gameState);
  if (state.phase === 'RESULT') {
    gameState.update((s) => ({ ...s, running: false, timer: 0 }));
    return;
  }
  const nextPhase = getNextPhase(state.phase);
  const speed = state.speed || 3;
  const duration = (PHASE_DURATION[nextPhase] || 2) / speed;
  gameState.update(s => ({ ...s, phase: nextPhase, timer: duration }));
  phaseInitialized = false;
}

function loop(ts: number) {
  if (!running) return;
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;
  const state = get(gameState);

  if (state.running) {
    if (!phaseInitialized) {
      phaseInitialized = true;
      if (onPhaseInit) onPhaseInit(state.phase);
    }
    if (state.timer > 0) {
      gameState.update(s => ({ ...s, timer: s.timer - dt }));
    }
    const selfManaged: Phase[] = ['DRAFT', 'HYPOTHESIS', 'BATTLE', 'RESULT'];
    if (state.timer <= 0 && !selfManaged.includes(state.phase)) {
      advancePhase();
    }
    requestAnimationFrame(loop);
  } else {
    // Idle: throttle to 4fps instead of 60fps
    setTimeout(() => requestAnimationFrame(loop), 250);
  }
}

export function startMatch() {
  phaseInitialized = false;
  gameState.update(s => ({
    ...s,
    running: true,
    phase: 'DRAFT',
    timer: 0
  }));
  startGameLoop();
}

// Called after SquadConfig submit during DRAFT to start ANALYSIS.
export function startAnalysisFromDraft() {
  phaseInitialized = false;
  advancePhase();
}
