<script lang="ts">
  /**
   * Icon.svelte — unified inline SVG icon wrapper.
   *
   * Usage:
   *   <Icon name="chart" />
   *   <Icon name="save" size={24} stroke={2} />
   *
   * All icons are 24×24 viewBox, fill="none", stroke="currentColor".
   * Terminal Brutalism: monoline, round caps, consistent weight.
   */
  import { ICONS, type IconName } from './Icon.js';

  interface Props {
    name: IconName;
    size?: 16 | 20 | 24;
    stroke?: number;
    /** Accessible label. Omit for decorative icons. */
    label?: string;
  }

  let { name, size = 20, stroke = 1.8, label }: Props = $props();

  const paths = $derived(ICONS[name] ?? '');
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={label ? undefined : 'true'}
  aria-label={label}
  role={label ? 'img' : undefined}
  style="display:block;flex-shrink:0;"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html paths}
</svg>
