<script lang="ts">
  interface Props {
    orientation: 'horizontal' | 'vertical';
    onDrag: (delta: number) => void;
    color?: string;
  }

  const { orientation, onDrag, color = 'var(--g5)' }: Props = $props();

  let isDragging = $state(false);

  function startDrag(startX: number, startY: number) {
    isDragging = true;
    const startPos = orientation === 'vertical' ? startX : startY;

    function onMove(pos: number) {
      onDrag(pos - startPos);
    }

    function onMouseMove(e: MouseEvent) {
      onMove(orientation === 'vertical' ? e.clientX : e.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      onMove(orientation === 'vertical' ? e.touches[0].clientX : e.touches[0].clientY);
    }
    function end() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', end);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', end);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', end);
  }

  function onMouseDown(e: MouseEvent) { startDrag(e.clientX, e.clientY); }
  function onTouchStart(e: TouchEvent) { startDrag(e.touches[0].clientX, e.touches[0].clientY); }
</script>

<button
  type="button"
  class="splitter"
  class:vertical={orientation === 'vertical'}
  class:horizontal={orientation === 'horizontal'}
  class:dragging={isDragging}
  style:--splitter-color={color}
  onmousedown={onMouseDown}
  ontouchstart={onTouchStart}
  aria-label={orientation === 'vertical' ? 'Resize vertical split' : 'Resize horizontal split'}
></button>

<style>
  .splitter {
    flex-shrink: 0;
    position: relative;
    background: transparent;
    border: none;
    padding: 0;
    transition: background 0.1s;
    z-index: 1;
  }

  /* Visible 1px line in center + invisible 4px hit zone */
  .splitter::before {
    content: '';
    position: absolute;
    background: var(--splitter-color);
    transition: background 0.1s;
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

  .splitter:hover::before {
    background: var(--g7);
  }

  .splitter.dragging::before {
    background: var(--pos);
  }
</style>
