<!-- ═══════════════════════════════════════════
  BattleEffects.svelte — 배틀 이펙트 오버레이
  콤보 카운터, 크리티컬 텍스트, 스크린셰이크, 시너지
═══════════════════════════════════════════ -->
<script lang="ts">
  import type { BattleMilestone } from '$lib/engine/v2BattleTypes';

  const {
    comboCount = 0,
    maxCombo = 0,
    isCritical = false,
    milestone = null,
    screenShake = null,
    signatureActive = false,
    signatureName = '',
  }: {
    comboCount: number;
    maxCombo: number;
    isCritical: boolean;
    milestone: BattleMilestone | null;
    screenShake: { px: number; ms: number } | null;
    signatureActive: boolean;
    signatureName: string;
  } = $props();

  // Screen shake CSS
  let shakeStyle = $state('');
  $effect(() => {
    if (screenShake && screenShake.px > 0) {
      shakeStyle = `animation: screen-shake ${screenShake.ms}ms ease-out`;
      const timer = setTimeout(() => { shakeStyle = ''; }, screenShake.ms);
      return () => clearTimeout(timer);
    }
  });

  // Critical flash
  let showCritFlash = $state(false);
  $effect(() => {
    if (isCritical) {
      showCritFlash = true;
      const timer = setTimeout(() => { showCritFlash = false; }, 600);
      return () => clearTimeout(timer);
    }
  });

  // Milestone display
  let showMilestone = $state(false);
  let milestoneText = $state('');
  let milestoneType = $state('');
  $effect(() => {
    if (milestone) {
      milestoneText = milestone.detail;
      milestoneType = milestone.type;
      showMilestone = true;
      const timer = setTimeout(() => { showMilestone = false; }, 1500);
      return () => clearTimeout(timer);
    }
  });

  // Signature move display
  let showSignature = $state(false);
  $effect(() => {
    if (signatureActive) {
      showSignature = true;
      const timer = setTimeout(() => { showSignature = false; }, 2000);
      return () => clearTimeout(timer);
    }
  });

  const comboLabel = $derived(() => {
    if (comboCount >= 8) return 'MAX COMBO!!';
    if (comboCount >= 5) return 'MEGA COMBO!';
    if (comboCount >= 4) return 'QUAD COMBO!';
    if (comboCount >= 3) return 'TRIPLE!';
    if (comboCount >= 2) return 'DOUBLE!';
    return '';
  });

  const comboColor = $derived(() => {
    if (comboCount >= 8) return '#FF1744';
    if (comboCount >= 5) return '#FFD700';
    if (comboCount >= 4) return '#FF8C00';
    if (comboCount >= 3) return '#4FC3F7';
    return '#a0e8a0';
  });
</script>

<div class="battle-effects" style={shakeStyle}>
  <!-- Combo Counter (always visible when combo > 1) -->
  {#if comboCount >= 2}
    <div class="combo-display" style:color={comboColor()}>
      <span class="combo-count">{comboCount}</span>
      <span class="combo-label">{comboLabel()}</span>
      <div class="combo-meter">
        <div class="combo-fill" style:width="{Math.min(100, (comboCount / 8) * 100)}%"></div>
      </div>
    </div>
  {/if}

  <!-- Critical Hit Flash -->
  {#if showCritFlash}
    <div class="critical-flash">
      <span class="critical-text">CRITICAL HIT!</span>
      <div class="critical-burst"></div>
    </div>
  {/if}

  <!-- Milestone Banner -->
  {#if showMilestone}
    <div class="milestone-banner type-{milestoneType}">
      <span class="milestone-text">{milestoneText}</span>
    </div>
  {/if}

  <!-- Signature Move Activation -->
  {#if showSignature}
    <div class="signature-overlay">
      <div class="signature-cut-in">
        <span class="signature-name">{signatureName}</span>
      </div>
    </div>
  {/if}

  <!-- Max Combo Record -->
  {#if maxCombo >= 3}
    <div class="max-combo-badge">
      MAX {maxCombo}
    </div>
  {/if}
</div>

<style>
  .battle-effects {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 50;
    overflow: hidden;
  }

  /* ── Combo ────────────────────────── */

  .combo-display {
    position: absolute;
    top: 8px;
    right: 8px;
    text-align: right;
    animation: combo-pop 0.3s ease-out;
  }

  .combo-count {
    font-size: 36px;
    font-weight: 900;
    font-family: 'JetBrains Mono', monospace;
    text-shadow: 0 2px 8px rgba(0,0,0,0.6);
    line-height: 1;
  }

  .combo-label {
    display: block;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 2px;
    font-family: 'JetBrains Mono', monospace;
    text-shadow: 0 1px 4px rgba(0,0,0,0.6);
  }

  .combo-meter {
    width: 60px;
    height: 3px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
    margin-top: 3px;
    margin-left: auto;
    overflow: hidden;
  }

  .combo-fill {
    height: 100%;
    background: currentColor;
    transition: width 0.3s;
    border-radius: 2px;
  }

  /* ── Critical Hit ──────────────────── */

  .critical-flash {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 60;
  }

  .critical-text {
    font-size: 28px;
    font-weight: 900;
    color: #FFD700;
    font-family: 'JetBrains Mono', monospace;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.6), 0 2px 8px rgba(0,0,0,0.8);
    animation: crit-zoom 0.6s ease-out;
    white-space: nowrap;
  }

  .critical-burst {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 120px;
    height: 120px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%);
    animation: burst-expand 0.6s ease-out forwards;
    z-index: -1;
  }

  /* ── Milestone ─────────────────────── */

  .milestone-banner {
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 16px;
    border-radius: 4px;
    animation: milestone-slide 1.5s ease-out forwards;
  }

  .milestone-banner.type-APPROACHING_TP {
    background: rgba(72, 216, 104, 0.2);
    border: 1px solid #48d868;
  }
  .milestone-banner.type-DANGER_ZONE {
    background: rgba(248, 88, 88, 0.2);
    border: 1px solid #f85858;
    animation: milestone-slide 1.5s ease-out forwards, danger-pulse 0.5s ease-in-out infinite;
  }
  .milestone-banner.type-FINISHER_READY {
    background: rgba(255, 215, 0, 0.2);
    border: 1px solid #FFD700;
  }
  .milestone-banner.type-SYNERGY_ACTIVATED {
    background: rgba(79, 195, 247, 0.2);
    border: 1px solid #4FC3F7;
  }

  .milestone-text {
    font-size: 11px;
    font-weight: 800;
    color: white;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 1px;
    text-shadow: 0 1px 4px rgba(0,0,0,0.5);
    white-space: nowrap;
  }

  /* ── Signature Move ────────────────── */

  .signature-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: sig-fade 2s ease-out forwards;
  }

  .signature-cut-in {
    padding: 12px 32px;
    background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.15), transparent);
    border-top: 2px solid #FFD700;
    border-bottom: 2px solid #FFD700;
    animation: sig-slash 0.5s ease-out;
  }

  .signature-name {
    font-size: 20px;
    font-weight: 900;
    color: #FFD700;
    font-family: 'JetBrains Mono', monospace;
    text-transform: uppercase;
    letter-spacing: 4px;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  }

  /* ── Max Combo Badge ───────────────── */

  .max-combo-badge {
    position: absolute;
    bottom: 8px;
    right: 8px;
    font-size: 7px;
    font-weight: 800;
    color: rgba(255,255,255,0.3);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 1px;
  }

  /* ── Animations ────────────────────── */

  @keyframes combo-pop {
    0% { transform: scale(0.5); opacity: 0; }
    60% { transform: scale(1.15); }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes crit-zoom {
    0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
    30% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
  }

  @keyframes burst-expand {
    0% { width: 0; height: 0; opacity: 1; }
    100% { width: 200px; height: 200px; opacity: 0; }
  }

  @keyframes milestone-slide {
    0% { transform: translateX(-50%) translateY(10px); opacity: 0; }
    15% { transform: translateX(-50%) translateY(0); opacity: 1; }
    85% { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes danger-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @keyframes sig-fade {
    0% { opacity: 0; }
    15% { opacity: 1; }
    70% { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes sig-slash {
    0% { transform: scaleX(0); }
    100% { transform: scaleX(1); }
  }

  @keyframes screen-shake {
    0%, 100% { transform: translateX(0); }
    10% { transform: translateX(-4px) translateY(2px); }
    20% { transform: translateX(4px) translateY(-2px); }
    30% { transform: translateX(-3px) translateY(1px); }
    40% { transform: translateX(3px); }
    50% { transform: translateX(-2px); }
    60% { transform: translateX(2px); }
    70% { transform: translateX(-1px); }
  }
</style>
