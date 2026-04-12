<!-- ═══════════════════════════════════════════
  AgentSprite.svelte — 포켓몬 스타일 에이전트 스프라이트
  CSS animation 기반 idle/attack/defend/hit/critical
═══════════════════════════════════════════ -->
<script lang="ts">
  import type { AgentId } from '$lib/engine/types';
  import type { AgentAnimState } from '$lib/engine/v2BattleTypes';
  import { getAgentCharacter, getTierForLevel, getTierInfo } from '$lib/engine/agentCharacter';
  import type { AgentTier } from '$lib/engine/agentCharacter';
  import HPBar from '../shared/HPBar.svelte';

  const {
    agentId,
    animState = 'IDLE',
    energy = 100,
    maxEnergy = 100,
    level = 1,
    side = 'left',
    showHPBar = true,
    showName = true,
    compact = false,
    damageNumber = null,
    speechBubble = null,
  }: {
    agentId: AgentId;
    animState?: AgentAnimState;
    energy?: number;
    maxEnergy?: number;
    level?: number;
    side?: 'left' | 'right';
    showHPBar?: boolean;
    showName?: boolean;
    compact?: boolean;
    damageNumber?: { value: number; color: string } | null;
    speechBubble?: string | null;
  } = $props();

  const char = $derived(getAgentCharacter(agentId));
  const tier: AgentTier = $derived(getTierForLevel(level));
  const tierInfo = $derived(getTierInfo(tier));

  // Map anim state to CSS class
  const animClass = $derived(() => {
    switch (animState) {
      case 'CAST':
      case 'IMPACT': return 'anim-attack';
      case 'WINDUP': return 'anim-windup';
      case 'RECOVER': return 'anim-defend';
      case 'PANIC': return 'anim-hit';
      case 'CELEBRATE': return 'anim-celebrate';
      case 'LOCK': return 'anim-lock';
      case 'PATROL': return 'anim-patrol';
      default: return 'anim-idle';
    }
  });

  // Tier glow effect
  const glowStyle = $derived(
    tier >= 2 ? `0 0 ${tier === 3 ? 16 : 8}px ${tierInfo.glowColor}` : 'none'
  );

  // Damage number animation
  let showDamage = $state(false);
  let damageDisplay = $state<{ value: number; color: string } | null>(null);

  $effect(() => {
    if (damageNumber) {
      damageDisplay = damageNumber;
      showDamage = true;
      const timer = setTimeout(() => { showDamage = false; }, 800);
      return () => clearTimeout(timer);
    }
  });

  // Speech bubble
  let showSpeech = $state(false);
  let speechText = $state('');

  $effect(() => {
    if (speechBubble) {
      speechText = speechBubble;
      showSpeech = true;
      const timer = setTimeout(() => { showSpeech = false; }, 2000);
      return () => clearTimeout(timer);
    }
  });
</script>

<div
  class="agent-sprite {side} {animClass()} tier-{tier}"
  class:compact
>
  <!-- Tier glow ring -->
  {#if tier >= 2}
    <div class="tier-glow" style:box-shadow={glowStyle}></div>
  {/if}

  <!-- Agent body (emoji-based for now, replaceable with SVG later) -->
  <div class="sprite-body" style:background={char.gradientCSS}>
    <span class="sprite-icon">{char.type === 'TECH' ? '⚙' : char.type === 'FLOW' ? '💧' : char.type === 'SENTI' ? '💜' : '🌐'}</span>
    <span class="agent-initial">{agentId.charAt(0)}</span>

    <!-- Tier badge -->
    {#if tier >= 2}
      <div class="tier-badge" style:background={tierInfo.glowColor}>
        {tier === 3 ? '★' : '◆'}
      </div>
    {/if}
  </div>

  <!-- Name & Info -->
  {#if showName}
    <div class="agent-info">
      <span class="agent-name" style:color={char.color}>{char.nameKR}</span>
      <span class="agent-level">Lv.{level}</span>
    </div>
  {/if}

  <!-- Energy bar -->
  {#if showHPBar}
    <div class="energy-bar-wrap">
      <HPBar value={energy} max={maxEnergy} label="EN" size="sm" />
    </div>
  {/if}

  <!-- Type badge -->
  <div class="type-badge" style:background={char.color}>
    {char.typeIcon} {char.type}
  </div>

  <!-- Damage number (floating) -->
  {#if showDamage && damageDisplay}
    <div
      class="damage-number"
      class:crit={damageDisplay.value >= 10}
      style:color={damageDisplay.color === 'gold' ? '#FFD700' : damageDisplay.color === 'green' ? '#48d868' : '#f85858'}
    >
      {damageDisplay.value > 0 ? '+' : ''}{damageDisplay.value.toFixed(1)}
    </div>
  {/if}

  <!-- Speech bubble -->
  {#if showSpeech}
    <div class="speech-bubble" class:right={side === 'right'}>
      {speechText}
    </div>
  {/if}
</div>

<style>
  .agent-sprite {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 80px;
    user-select: none;
  }
  .agent-sprite.compact {
    width: 56px;
  }
  .agent-sprite.compact .sprite-body {
    width: 40px;
    height: 40px;
  }

  .sprite-body {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(255,255,255,0.15);
    transition: transform 0.15s;
    overflow: hidden;
  }

  .sprite-icon {
    position: absolute;
    top: 2px;
    left: 2px;
    font-size: 10px;
    opacity: 0.6;
  }

  .agent-initial {
    font-size: 22px;
    font-weight: 900;
    color: white;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    font-family: 'JetBrains Mono', monospace;
  }
  .compact .agent-initial {
    font-size: 16px;
  }

  .tier-badge {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: #111;
    font-weight: 900;
    border: 1px solid rgba(0,0,0,0.3);
  }

  .tier-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 62px;
    height: 62px;
    border-radius: 50%;
    pointer-events: none;
    z-index: -1;
  }

  .agent-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .agent-name {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.5px;
    font-family: 'JetBrains Mono', monospace;
  }

  .agent-level {
    font-size: 8px;
    color: rgba(255,255,255,0.4);
    font-family: 'JetBrains Mono', monospace;
  }

  .energy-bar-wrap {
    width: 100%;
    padding: 0 4px;
  }

  .type-badge {
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.5px;
    padding: 1px 5px;
    border-radius: 3px;
    color: rgba(0,0,0,0.8);
    font-family: 'JetBrains Mono', monospace;
  }

  /* ── Animations ────────────────────────── */

  .anim-idle .sprite-body {
    animation: idle-bob 2s ease-in-out infinite;
  }

  .anim-attack .sprite-body {
    animation: attack-lunge 0.4s ease-out;
  }

  .anim-windup .sprite-body {
    animation: windup-charge 0.3s ease-in;
  }

  .anim-defend .sprite-body {
    animation: defend-brace 0.3s ease-out;
    border-color: rgba(72, 216, 104, 0.6);
  }

  .anim-hit .sprite-body {
    animation: hit-shake 0.3s ease-out;
  }

  .anim-celebrate .sprite-body {
    animation: celebrate-bounce 0.5s ease-out;
  }

  .anim-lock .sprite-body {
    border-color: rgba(255, 215, 0, 0.6);
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.3);
  }

  .anim-patrol .sprite-body {
    animation: patrol-sway 1.5s ease-in-out infinite;
  }

  /* Left side attacks right, right side attacks left */
  .left.anim-attack .sprite-body {
    animation: attack-lunge-right 0.4s ease-out;
  }
  .right.anim-attack .sprite-body {
    animation: attack-lunge-left 0.4s ease-out;
  }

  /* Tier visual effects */
  .tier-2 .sprite-body { border-width: 2px; }
  .tier-3 .sprite-body {
    border-width: 3px;
    border-color: rgba(255, 213, 79, 0.5);
  }

  @keyframes idle-bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }

  @keyframes attack-lunge-right {
    0% { transform: translateX(0) scale(1); }
    40% { transform: translateX(20px) scale(1.15); }
    100% { transform: translateX(0) scale(1); }
  }

  @keyframes attack-lunge-left {
    0% { transform: translateX(0) scale(1); }
    40% { transform: translateX(-20px) scale(1.15); }
    100% { transform: translateX(0) scale(1); }
  }

  @keyframes windup-charge {
    0% { transform: scale(1); }
    100% { transform: scale(1.1); filter: brightness(1.2); }
  }

  @keyframes defend-brace {
    0% { transform: scale(1); }
    50% { transform: scale(0.92); }
    100% { transform: scale(1); }
  }

  @keyframes hit-shake {
    0% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    50% { transform: translateX(6px); }
    75% { transform: translateX(-3px); }
    100% { transform: translateX(0); }
  }

  @keyframes celebrate-bounce {
    0% { transform: translateY(0) scale(1); }
    40% { transform: translateY(-12px) scale(1.1); }
    100% { transform: translateY(0) scale(1); }
  }

  @keyframes patrol-sway {
    0%, 100% { transform: translateX(0); }
    50% { transform: translateX(4px); }
  }

  /* ── Damage Number ────────────────────── */

  .damage-number {
    position: absolute;
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 16px;
    font-weight: 900;
    font-family: 'JetBrains Mono', monospace;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    animation: damage-float 0.8s ease-out forwards;
    pointer-events: none;
    z-index: 10;
    white-space: nowrap;
  }
  .damage-number.crit {
    font-size: 22px;
    animation: damage-float-crit 0.8s ease-out forwards;
  }

  @keyframes damage-float {
    0% { opacity: 1; transform: translateX(-50%) translateY(0); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-30px); }
  }
  @keyframes damage-float-crit {
    0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    30% { transform: translateX(-50%) translateY(-10px) scale(1.3); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(0.8); }
  }

  /* ── Speech Bubble ────────────────────── */

  .speech-bubble {
    position: absolute;
    top: -32px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.85);
    color: white;
    font-size: 8px;
    padding: 3px 6px;
    border-radius: 4px;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    animation: speech-pop 0.3s ease-out;
    z-index: 10;
    border: 1px solid rgba(255,255,255,0.1);
  }
  .speech-bubble::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 4px solid rgba(0,0,0,0.85);
  }

  @keyframes speech-pop {
    0% { opacity: 0; transform: translateX(-50%) scale(0.7); }
    100% { opacity: 1; transform: translateX(-50%) scale(1); }
  }
</style>
