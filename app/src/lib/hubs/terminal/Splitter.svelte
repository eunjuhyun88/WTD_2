<script lang="ts">
  interface Props {
    orientation: 'horizontal' | 'vertical';
    onDrag: (delta: number) => void;
    color?: string;
    onReset?: () => void;
    ariaLabel?: string;
  }

  const {
    orientation,
    onDrag,
    color = 'var(--g5)',
    onReset,
    ariaLabel = orientation === 'vertical' ? 'Resize vertical split' : 'Resize horizontal split',
  }: Props = $props();

  let isDragging = $state(false);

  function startDrag(startX: number, startY: number) {
    isDragging = true;
    let lastPos = orientation === 'vertical' ? startX : startY;
    let queuedDelta = 0;
    let rafId: number | null = null;

    function flush() {
      rafId = null;
      if (queuedDelta === 0) return;
      onDrag(queuedDelta);
      queuedDelta = 0;
    }

    function onMouseMove(e: MouseEvent) {
      const pos = orientation === 'vertical' ? e.clientX : e.clientY;
      const delta = pos - lastPos;
      lastPos = pos;
      if (delta === 0) return;
      queuedDelta += delta;
      if (!rafId) rafId = requestAnimationFrame(flush);
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const pos = orientation === 'vertical' ? e.touches[0].clientX : e.touches[0].clientY;
      const delta = pos - lastPos;
      lastPos = pos;
      if (delta === 0) return;
      queuedDelta += delta;
      if (!rafId) rafId = requestAnimationFrame(flush);
    }

    function end() {
      isDragging = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (queuedDelta !== 0) { onDrag(queuedDelta); queuedDelta = 0; }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', end);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', end);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', end);
  }

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  }

  function onTouchStart(e: TouchEvent) {
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }

  function onDblClick() {
    onReset?.();
  }
</script>

<button
  type="button"
  class="splitter"
  class:vertical={orientation === 'vertical'}
  class:horizontal={orientation === 'horizontal'}
  class:dragging={isDragging}
  class:resettable={Boolean(onReset)}
  style:--splitter-color={color}
  onmousedown={onMouseDown}
  ontouchstart={onTouchStart}
  ondblclick={onDblClick}
  aria-label={ariaLabel}
  title={onReset ? `Drag to resize · double-click to reset` : 'Drag to resize'}
></button>

<style>
  .splitter {
    flex-shrink: 0;
    position: relative;
    background: transparent;
    border: none;
    padding: 0;
    z-index: 1;
  }

  .splitter::before {
    content: '';
    position: absolute;
    background: var(--splitter-color);
    transition: background 0.12s, opacity 0.12s;
    opacity: 0.4;
  }

  /* Grip dots (center indicator) */
  .splitter::after {
    content: '';
    position: absolute;
    transition: opacity 0.12s;
    opacity: 0;
  }

  .splitter.vertical {
    width: 5px;
    height: 100%;
    cursor: col-resize;
  }
  .splitter.vertical::before {
    top: 0; bottom: 0;
    left: 2px;
    width: 1px;
  }
  .splitter.vertical::after {
    top: 50%;
    left: 0;
    width: 5px;
    height: 24px;
    transform: translateY(-50%);
    background: radial-gradient(circle at center, var(--g6) 1.5px, transparent 1.5px) 50% 0 / 3px 6px repeat-y;
  }

  .splitter.horizontal {
    width: 100%;
    height: 5px;
    cursor: row-resize;
  }
  .splitter.horizontal::before {
    left: 0; right: 0;
    top: 2px;
    height: 1px;
  }
  .splitter.horizontal::after {
    left: 50%;
    top: 0;
    height: 5px;
    width: 24px;
    transform: translateX(-50%);
    background: radial-gradient(circle at center, var(--g6) 1.5px, transparent 1.5px) 0 50% / 6px 3px repeat-x;
  }

  .splitter:hover::before { background: var(--g7); opacity: 0.8; }
  .splitter:hover::after  { opacity: 1; }
  .splitter.dragging::before { background: var(--brand); opacity: 1; }
  .splitter.dragging::after  { opacity: 0; }
</style>
