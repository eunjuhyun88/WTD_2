<!-- ═══════════════════════════════════════════
  BattleCanvas.svelte — PixiJS 2D 배틀 씬
  에이전트 스프라이트, HP바, 데미지 넘버, 이펙트
═══════════════════════════════════════════ -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { V3BattleState, V3AgentState, HPChange, KOEvent } from '$lib/engine/v3BattleTypes';
  import { getAgentCharacter, getTypeBadge } from '$lib/engine/agentCharacter';
  import type { AgentAnimState } from '$lib/engine/v2BattleTypes';

  const {
    v3State,
    screenShake = { px: 0, ms: 0 },
  }: {
    v3State: V3BattleState;
    screenShake?: { px: number; ms: number };
  } = $props();

  let canvasContainer: HTMLDivElement;
  let app: any = null; // PIXI.Application
  let sprites: Map<string, any> = new Map();
  let hpBars: Map<string, any> = new Map();
  let damageTexts: any[] = [];
  let pixiLoaded = $state(false);

  // Canvas dimensions
  const WIDTH = 760;
  const HEIGHT = 340;

  // Layout positions
  const POSITIONS = {
    humanLead:   { x: 180, y: 140 },
    humanBack1:  { x: 80, y: 80 },
    humanBack2:  { x: 80, y: 210 },
    aiLead:      { x: 580, y: 140 },
    aiBack1:     { x: 680, y: 80 },
    aiBack2:     { x: 680, y: 210 },
    vsCenter:    { x: 380, y: 140 },
  };

  onMount(async () => {
    try {
      const PIXI = await import('pixi.js');

      app = new PIXI.Application();
      await app.init({
        width: WIDTH,
        height: HEIGHT,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      canvasContainer.appendChild(app.canvas);
      pixiLoaded = true;

      // Initial draw
      drawBattleScene(PIXI);
    } catch (e) {
      console.warn('[BattleCanvas] PixiJS init failed, falling back to CSS', e);
    }
  });

  onDestroy(() => {
    if (app) {
      app.destroy(true, { children: true, texture: true });
      app = null;
    }
  });

  // Redraw when state changes
  $effect(() => {
    if (!app || !pixiLoaded) return;
    // Access state to track dependencies
    const _tick = v3State.v2State.tickN;
    const _hp = v3State.humanAgents.map(a => a.hp).join(',');
    const _aiHp = v3State.aiAgents.map(a => a.hp).join(',');

    import('pixi.js').then(PIXI => {
      updateBattleScene(PIXI);
    });
  });

  // Screen shake effect
  $effect(() => {
    if (!app || screenShake.px === 0) return;
    const stage = app.stage;
    const originalX = 0;
    const originalY = 0;
    const intensity = screenShake.px;

    let frame = 0;
    const totalFrames = Math.ceil((screenShake.ms / 1000) * 60);

    const shakeLoop = () => {
      if (frame >= totalFrames) {
        stage.x = originalX;
        stage.y = originalY;
        return;
      }
      const decay = 1 - frame / totalFrames;
      stage.x = originalX + (Math.random() - 0.5) * intensity * 2 * decay;
      stage.y = originalY + (Math.random() - 0.5) * intensity * 2 * decay;
      frame++;
      requestAnimationFrame(shakeLoop);
    };
    shakeLoop();
  });

  function drawBattleScene(PIXI: any) {
    if (!app) return;
    app.stage.removeChildren();
    sprites.clear();
    hpBars.clear();

    // Draw ground line
    const ground = new PIXI.Graphics();
    ground.setStrokeStyle({ width: 1, color: 0x1a3d2e, alpha: 0.5 });
    ground.moveTo(0, 260);
    ground.lineTo(WIDTH, 260);
    ground.stroke();
    app.stage.addChild(ground);

    // VS text
    const vsText = new PIXI.Text({
      text: 'VS',
      style: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 28,
        fontWeight: '900',
        fill: 0xf8d030,
        dropShadow: {
          color: 0x000000,
          distance: 2,
          alpha: 0.8,
        },
      }
    });
    vsText.anchor.set(0.5);
    vsText.x = POSITIONS.vsCenter.x;
    vsText.y = POSITIONS.vsCenter.y;
    app.stage.addChild(vsText);

    // Draw agents
    drawTeam(PIXI, v3State.humanAgents, 'human', v3State.humanLeadIdx);
    drawTeam(PIXI, v3State.aiAgents, 'ai', v3State.aiLeadIdx);
  }

  function drawTeam(PIXI: any, agents: V3AgentState[], side: 'human' | 'ai', leadIdx: number) {
    agents.forEach((agent, i) => {
      const isLead = i === leadIdx;
      let pos;

      if (side === 'human') {
        pos = isLead ? POSITIONS.humanLead :
              (i < leadIdx || (i === 0 && leadIdx !== 0)) ? POSITIONS.humanBack1 : POSITIONS.humanBack2;
      } else {
        pos = isLead ? POSITIONS.aiLead :
              (i < leadIdx || (i === 0 && leadIdx !== 0)) ? POSITIONS.aiBack1 : POSITIONS.aiBack2;
      }

      drawAgent(PIXI, agent, pos, side, isLead);
    });
  }

  function drawAgent(PIXI: any, agent: V3AgentState, pos: { x: number; y: number }, side: 'human' | 'ai', isLead: boolean) {
    const char = getAgentCharacter(agent.agentId);
    const key = `${side}-${agent.agentId}`;
    const container = new PIXI.Container();
    container.x = pos.x;
    container.y = pos.y;

    // Size based on lead/back
    const size = isLead ? 52 : 36;
    const alpha = agent.isKO ? 0.3 : (isLead ? 1.0 : 0.7);
    container.alpha = alpha;

    // Agent circle
    const circle = new PIXI.Graphics();
    const color = parseInt(char.color.replace('#', ''), 16);
    const colorSecondary = parseInt(char.colorSecondary.replace('#', ''), 16);

    // Gradient-like effect with two circles
    circle.circle(0, 0, size);
    circle.fill({ color: colorSecondary, alpha: 0.6 });
    circle.circle(0, -4, size - 4);
    circle.fill({ color: color, alpha: 0.9 });

    // KO: grayscale look (darker)
    if (agent.isKO) {
      circle.circle(0, 0, size);
      circle.fill({ color: 0x333333, alpha: 0.5 });
    }

    container.addChild(circle);

    // Agent initial text
    const label = new PIXI.Text({
      text: agent.isKO ? 'X' : agent.agentId.charAt(0),
      style: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: isLead ? 22 : 16,
        fontWeight: '900',
        fill: 0xffffff,
      }
    });
    label.anchor.set(0.5);
    label.y = -2;
    container.addChild(label);

    // Type badge below
    const typeBadge = getTypeBadge(char.type);
    const typeText = new PIXI.Text({
      text: `${typeBadge.icon} ${typeBadge.name}`,
      style: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 8,
        fill: parseInt(typeBadge.color.replace('#', ''), 16),
      }
    });
    typeText.anchor.set(0.5);
    typeText.y = size + 8;
    container.addChild(typeText);

    // Name below type
    const nameText = new PIXI.Text({
      text: char.nameKR,
      style: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        fill: 0xaaaaaa,
      }
    });
    nameText.anchor.set(0.5);
    nameText.y = size + 20;
    container.addChild(nameText);

    // HP Bar (above agent)
    if (!agent.isKO) {
      const hpBarWidth = isLead ? 64 : 44;
      const hpBarHeight = 5;
      const hpY = -(size + 10);
      const hpPercent = agent.maxHP > 0 ? agent.hp / agent.maxHP : 0;

      // Background
      const hpBg = new PIXI.Graphics();
      hpBg.roundRect(-hpBarWidth / 2, hpY, hpBarWidth, hpBarHeight, 2);
      hpBg.fill({ color: 0x1a1a1a, alpha: 0.8 });
      container.addChild(hpBg);

      // Fill
      const hpFill = new PIXI.Graphics();
      const fillColor = hpPercent > 0.5 ? 0x48d868 : (hpPercent > 0.25 ? 0xf8d030 : 0xf85858);
      hpFill.roundRect(-hpBarWidth / 2, hpY, hpBarWidth * hpPercent, hpBarHeight, 2);
      hpFill.fill({ color: fillColor });
      container.addChild(hpFill);

      // HP text
      const hpText = new PIXI.Text({
        text: `${Math.ceil(agent.hp)}/${agent.maxHP}`,
        style: {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 7,
          fill: 0xcccccc,
        }
      });
      hpText.anchor.set(0.5);
      hpText.y = hpY - 8;
      container.addChild(hpText);
    }

    // Side indicator
    if (isLead) {
      const sideText = new PIXI.Text({
        text: side === 'human' ? 'YOU' : 'AI',
        style: {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 8,
          fontWeight: '900',
          fill: side === 'human' ? 0x48d868 : 0xf85858,
        }
      });
      sideText.anchor.set(0.5);
      sideText.y = -(size + 26);
      container.addChild(sideText);
    }

    // Lead glow ring
    if (isLead && !agent.isKO) {
      const glow = new PIXI.Graphics();
      glow.setStrokeStyle({ width: 2, color: side === 'human' ? 0x48d868 : 0xf85858, alpha: 0.5 });
      glow.circle(0, 0, size + 4);
      glow.stroke();
      container.addChild(glow);
    }

    app.stage.addChild(container);
    sprites.set(key, container);
  }

  function updateBattleScene(PIXI: any) {
    drawBattleScene(PIXI);
  }

  // Spawn floating damage number
  export function showDamageNumber(agentId: string, side: 'human' | 'ai', value: number, color: string) {
    if (!app) return;
    import('pixi.js').then(PIXI => {
      const key = `${side}-${agentId}`;
      const sprite = sprites.get(key);
      if (!sprite) return;

      const text = new PIXI.Text({
        text: value > 0 ? `+${value}` : `${value}`,
        style: {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 16,
          fontWeight: '900',
          fill: color === 'green' ? 0x48d868 : (color === 'gold' ? 0xf8d030 : 0xf85858),
          dropShadow: {
            color: 0x000000,
            distance: 1,
            alpha: 0.8,
          },
        }
      });
      text.anchor.set(0.5);
      text.x = sprite.x + (Math.random() - 0.5) * 20;
      text.y = sprite.y - 40;
      app.stage.addChild(text);

      // Animate upward and fade
      let frame = 0;
      const animate = () => {
        if (frame > 40) {
          app.stage.removeChild(text);
          return;
        }
        text.y -= 1.5;
        text.alpha = 1 - frame / 40;
        frame++;
        requestAnimationFrame(animate);
      };
      animate();
    });
  }
</script>

<div class="battle-canvas-wrapper">
  {#if !pixiLoaded}
    <!-- Fallback while PixiJS loads -->
    <div class="fallback-scene">
      <div class="fallback-team left">
        {#each v3State.humanAgents as agent, i}
          {@const char = getAgentCharacter(agent.agentId)}
          {@const isLead = i === v3State.humanLeadIdx}
          <div class="fallback-agent"
               class:lead={isLead}
               class:ko={agent.isKO}
               style:--agent-color={char.color}>
            <div class="fallback-hp-bar">
              <div class="fallback-hp-fill"
                   style="width: {agent.maxHP > 0 ? (agent.hp / agent.maxHP * 100) : 0}%"
                   class:low={agent.hp / agent.maxHP < 0.25}></div>
            </div>
            <div class="fallback-avatar" style:background={char.gradientCSS}>
              {agent.isKO ? 'X' : agent.agentId.charAt(0)}
            </div>
            <span class="fallback-name">{char.nameKR}</span>
            <span class="fallback-hp-text">{Math.ceil(agent.hp)}/{agent.maxHP}</span>
          </div>
        {/each}
      </div>

      <div class="fallback-vs">VS</div>

      <div class="fallback-team right">
        {#each v3State.aiAgents as agent, i}
          {@const char = getAgentCharacter(agent.agentId)}
          {@const isLead = i === v3State.aiLeadIdx}
          <div class="fallback-agent"
               class:lead={isLead}
               class:ko={agent.isKO}
               style:--agent-color={char.color}>
            <div class="fallback-hp-bar">
              <div class="fallback-hp-fill"
                   style="width: {agent.maxHP > 0 ? (agent.hp / agent.maxHP * 100) : 0}%"
                   class:low={agent.hp / agent.maxHP < 0.25}></div>
            </div>
            <div class="fallback-avatar" style:background={char.gradientCSS}>
              {agent.isKO ? 'X' : agent.agentId.charAt(0)}
            </div>
            <span class="fallback-name">{char.nameKR}</span>
            <span class="fallback-hp-text">{Math.ceil(agent.hp)}/{agent.maxHP}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div bind:this={canvasContainer} class="canvas-container"
       class:hidden={!pixiLoaded}></div>
</div>

<style>
  .battle-canvas-wrapper {
    width: 100%;
    aspect-ratio: 760 / 340;
    max-width: 760px;
    margin: 0 auto;
    position: relative;
    background: linear-gradient(180deg,
      rgba(7, 19, 13, 0.9) 0%,
      rgba(13, 33, 24, 0.8) 60%,
      rgba(7, 19, 13, 0.95) 100%
    );
    border-radius: 8px;
    border: 1px solid var(--arena-line, #1a3d2e);
    overflow: hidden;
  }

  .canvas-container {
    width: 100%;
    height: 100%;
  }

  .canvas-container.hidden {
    display: none;
  }

  .canvas-container :global(canvas) {
    width: 100% !important;
    height: 100% !important;
  }

  /* ── CSS Fallback ── */

  .fallback-scene {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 20px;
    gap: 20px;
  }

  .fallback-team {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }

  .fallback-team.left { align-items: flex-end; }
  .fallback-team.right { align-items: flex-start; }

  .fallback-vs {
    font-family: 'JetBrains Mono', monospace;
    font-size: 24px;
    font-weight: 900;
    color: #f8d030;
    text-shadow: 0 0 12px rgba(248, 208, 48, 0.4);
    flex-shrink: 0;
  }

  .fallback-agent {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    transition: all 0.3s ease;
    min-width: 140px;
  }

  .fallback-agent.lead {
    border-color: var(--agent-color, #4FC3F7);
    background: rgba(255, 255, 255, 0.05);
    transform: scale(1.1);
  }

  .fallback-agent.ko {
    opacity: 0.3;
    filter: grayscale(1);
  }

  .fallback-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    font-weight: 900;
    color: white;
    flex-shrink: 0;
  }

  .fallback-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--arena-text-0, #e0f0e8);
    font-weight: 700;
  }

  .fallback-hp-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: var(--arena-text-2, #5a7d6e);
    margin-left: auto;
  }

  .fallback-hp-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 3px 3px 0 0;
    overflow: hidden;
  }

  .fallback-hp-fill {
    height: 100%;
    background: #48d868;
    transition: width 0.3s ease;
    border-radius: 3px 3px 0 0;
  }

  .fallback-hp-fill.low {
    background: #f85858;
  }
</style>
