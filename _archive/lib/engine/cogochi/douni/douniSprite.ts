// ═══════════════════════════════════════════════════════════════
// COGOCHI — DOUNI Sprite State Machine
// ═══════════════════════════════════════════════════════════════
// 픽셀아트 부엉이 스프라이트의 방향, 애니메이션, 이펙트를 관리.
// Canvas2D 렌더러에 전달할 렌더 커맨드를 생성한다.
//
// 방향 4종:  Front / 3-Quarter / Side / Back
// 애니메이션 7종: Idle / Thinking / Excited / Happy / Sad / Alert / Sleep
// 이펙트: 말풍선, 파티클, 느낌표 등

import type { DouniAnimation } from './douniState';
import type { DouniStage } from './douniPersonality';

// ─── Direction ───────────────────────────────────────────────

export type SpriteDirection = 'FRONT' | 'THREE_QUARTER' | 'SIDE' | 'BACK';

// ─── Sprite Size by Stage ────────────────────────────────────

export const STAGE_SPRITE_SIZE: Record<DouniStage, number> = {
  EGG: 24,
  CHICK: 32,
  FLEDGLING: 48,
  DOUNI: 64,
  ELDER: 80,
};

// ─── Animation Frames ────────────────────────────────────────

export interface SpriteFrame {
  /** 스프라이트시트 내 프레임 인덱스 (row, col) */
  row: number;
  col: number;
  /** 이 프레임의 지속시간 (ms) */
  duration: number;
}

export interface AnimationSequence {
  frames: SpriteFrame[];
  loop: boolean;
  /** 애니메이션 완료 후 전환할 상태 (없으면 유지) */
  nextAnimation?: DouniAnimation;
}

/**
 * 애니메이션 정의.
 * 실제 스프라이트시트가 완성되면 row/col 값을 맞출 것.
 * 지금은 프레임 구조와 타이밍만 정의.
 */
export const ANIMATION_DEFS: Record<DouniAnimation, AnimationSequence> = {
  IDLE: {
    frames: [
      { row: 0, col: 0, duration: 2000 },  // 눈 뜨고 정면
      { row: 0, col: 1, duration: 150 },   // 눈 감김 (깜빡임)
      { row: 0, col: 0, duration: 3000 },  // 다시 뜸
      { row: 0, col: 2, duration: 200 },   // 미세 흔들림
    ],
    loop: true,
  },
  THINKING: {
    frames: [
      { row: 1, col: 0, duration: 500 },   // 옆모습
      { row: 1, col: 1, duration: 500 },   // "..." 말풍선 1
      { row: 1, col: 2, duration: 500 },   // "..." 말풍선 2
      { row: 1, col: 3, duration: 500 },   // "..." 말풍선 3
    ],
    loop: true,
  },
  EXCITED: {
    frames: [
      { row: 2, col: 0, duration: 150 },   // 정면 + 점프 시작
      { row: 2, col: 1, duration: 200 },   // 점프 정점 + !
      { row: 2, col: 2, duration: 150 },   // 착지
      { row: 2, col: 3, duration: 300 },   // 별 이펙트
    ],
    loop: false,
    nextAnimation: 'HAPPY',
  },
  HAPPY: {
    frames: [
      { row: 3, col: 0, duration: 300 },   // 점프
      { row: 3, col: 1, duration: 200 },   // 별 이펙트
      { row: 3, col: 0, duration: 300 },   // 다시
      { row: 3, col: 2, duration: 500 },   // 미소
    ],
    loop: false,
    nextAnimation: 'IDLE',
  },
  SAD: {
    frames: [
      { row: 4, col: 0, duration: 500 },   // 뒤돌아앉기 시작
      { row: 4, col: 1, duration: 1000 },  // 뒤돌아앉음 (Back) + 축 처짐
      { row: 4, col: 2, duration: 800 },   // "다음엔..." 말풍선
    ],
    loop: false,
    nextAnimation: 'IDLE',
  },
  ALERT: {
    frames: [
      { row: 5, col: 0, duration: 200 },   // 빠른 깜빡임 1
      { row: 5, col: 1, duration: 200 },   // 빠른 깜빡임 2
      { row: 5, col: 2, duration: 300 },   // 빨간 ! 이펙트
      { row: 5, col: 0, duration: 200 },   // 반복
      { row: 5, col: 1, duration: 200 },
    ],
    loop: false,
    nextAnimation: 'IDLE',
  },
  SLEEP: {
    frames: [
      { row: 6, col: 0, duration: 1500 },  // 눈 감김
      { row: 6, col: 1, duration: 1000 },  // Zzz 1
      { row: 6, col: 2, duration: 1000 },  // Zzz 2
    ],
    loop: true,
  },
};

// ─── Render Command ──────────────────────────────────────────

export interface SpriteRenderCommand {
  animation: DouniAnimation;
  direction: SpriteDirection;
  size: number;             // px
  frame: SpriteFrame;
  effects: SpriteEffect[];
}

export type SpriteEffect =
  | { type: 'BUBBLE'; text: string }        // 말풍선
  | { type: 'PARTICLE'; kind: 'star' | 'heart' | 'exclamation' | 'zzz' }
  | { type: 'GLOW'; color: string };

// ─── Sprite Controller ───────────────────────────────────────

/**
 * DOUNI 스프라이트 상태를 관리하는 컨트롤러.
 * 매 프레임(requestAnimationFrame)에서 tick()을 호출하면
 * 현재 렌더해야 할 SpriteRenderCommand를 반환.
 */
export class DouniSpriteController {
  private animation: DouniAnimation = 'IDLE';
  private direction: SpriteDirection = 'FRONT';
  private frameIndex = 0;
  private frameTimer = 0;
  private size: number;

  constructor(stage: DouniStage) {
    this.size = STAGE_SPRITE_SIZE[stage];
  }

  /** Stage 변경 시 사이즈 업데이트 */
  setStage(stage: DouniStage): void {
    this.size = STAGE_SPRITE_SIZE[stage];
  }

  /** 애니메이션 전환 */
  play(animation: DouniAnimation, direction?: SpriteDirection): void {
    if (this.animation !== animation) {
      this.animation = animation;
      this.frameIndex = 0;
      this.frameTimer = 0;
    }
    if (direction) this.direction = direction;
  }

  /** 방향만 변경 */
  face(direction: SpriteDirection): void {
    this.direction = direction;
  }

  /**
   * deltaMs 만큼 시간 진행. 현재 렌더 커맨드 반환.
   */
  tick(deltaMs: number): SpriteRenderCommand {
    const seq = ANIMATION_DEFS[this.animation];
    const frame = seq.frames[this.frameIndex];

    this.frameTimer += deltaMs;

    // 프레임 전환
    if (this.frameTimer >= frame.duration) {
      this.frameTimer -= frame.duration;
      this.frameIndex++;

      if (this.frameIndex >= seq.frames.length) {
        if (seq.loop) {
          this.frameIndex = 0;
        } else if (seq.nextAnimation) {
          this.animation = seq.nextAnimation;
          this.frameIndex = 0;
          this.frameTimer = 0;
        } else {
          this.frameIndex = seq.frames.length - 1; // 마지막 프레임 유지
        }
      }
    }

    const currentFrame = ANIMATION_DEFS[this.animation].frames[this.frameIndex];

    return {
      animation: this.animation,
      direction: this.direction,
      size: this.size,
      frame: currentFrame,
      effects: this.resolveEffects(),
    };
  }

  private resolveEffects(): SpriteEffect[] {
    const effects: SpriteEffect[] = [];

    switch (this.animation) {
      case 'THINKING':
        effects.push({ type: 'BUBBLE', text: '...' });
        break;
      case 'EXCITED':
        effects.push({ type: 'PARTICLE', kind: 'exclamation' });
        break;
      case 'HAPPY':
        effects.push({ type: 'PARTICLE', kind: 'star' });
        break;
      case 'SAD':
        effects.push({ type: 'BUBBLE', text: '다음엔...' });
        break;
      case 'ALERT':
        effects.push({ type: 'PARTICLE', kind: 'exclamation' });
        effects.push({ type: 'GLOW', color: '#ff4444' });
        break;
      case 'SLEEP':
        effects.push({ type: 'PARTICLE', kind: 'zzz' });
        break;
    }

    return effects;
  }

  /** 현재 상태 (직렬화용) */
  getState(): { animation: DouniAnimation; direction: SpriteDirection } {
    return { animation: this.animation, direction: this.direction };
  }
}

// ─── Context-based Direction ─────────────────────────────────

/**
 * 분석 컨텍스트에 따라 DOUNI 방향을 결정.
 * v5 설계: Front(말할 때), 3Q(차트 가리킬 때), Side(분석 중), Back(틀렸을 때)
 */
export function resolveDirection(context: 'speaking' | 'analyzing' | 'pointing' | 'wrong'): SpriteDirection {
  switch (context) {
    case 'speaking': return 'FRONT';
    case 'analyzing': return 'SIDE';
    case 'pointing': return 'THREE_QUARTER';
    case 'wrong': return 'BACK';
  }
}
