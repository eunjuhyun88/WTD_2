<script lang="ts">
  interface Props {
    orientation: 'horizontal' | 'vertical';
    onDrag: (delta: number) => void;
    color?: string;
  }

  const { orientation, onDrag, color = 'var(--g5)' }: Props = $props();

  let isDragging = $state(false);

  function onMouseDown(e: MouseEvent) {
    isDragging = true;
    const startPos = orientation === 'vertical' ? e.clientX : e.clientY;

    function onMouseMove(e: MouseEvent) {
      const currentPos = orientation === 'vertical' ? e.clientX : e.clientY;
      const delta = currentPos - startPos;
      onDrag(delta);
    }

    function onMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
</script>

<div
  class="splitter"
  class:vertical={orientation === 'vertical'}
  class:horizontal={orientation === 'horizontal'}
  class:dragging={isDragging}
  style:--splitter-color={color}
  onmousedown={onMouseDown}
/>

<style>
  .splitter {
    flex-shrink: 0;
    position: relative;
    background: transparent;
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
