<script lang="ts">
  interface Props {
    orientation: 'horizontal' | 'vertical';
    onDrag: (delta: number) => void;
    color?: string;
  }

  const { orientation, onDrag, color = 'var(--g4)' }: Props = $props();

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
    background: var(--splitter-color);
    cursor: col-resize;
    transition: background 0.15s;
  }

  .splitter.vertical {
    width: 4px;
    height: 100%;
  }

  .splitter.horizontal {
    width: 100%;
    height: 4px;
  }

  .splitter:hover {
    background: var(--g5);
  }

  .splitter.dragging {
    background: var(--pos);
  }
</style>
