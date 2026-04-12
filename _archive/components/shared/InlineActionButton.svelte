<script lang="ts">
  const { label, href }: {
    label: string;
    href: string;
  } = $props();
</script>

<a class="inline-action" {href}>
  <span class="ia-label">{label}</span>
  <span class="ia-arrow">&rsaquo;</span>
</a>

<style>
  .inline-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: var(--sc-radius-md);
    background: rgba(var(--lis-rgb-pink), 0.06);
    border: 1px solid rgba(var(--lis-rgb-pink), 0.14);
    text-decoration: none;
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    font-weight: 600;
    color: var(--lis-accent);
    cursor: pointer;
    transition: all var(--sc-duration-fast) var(--sc-ease);
  }

  .inline-action:hover {
    background: rgba(var(--lis-rgb-pink), 0.12);
    border-color: rgba(var(--lis-rgb-pink), 0.24);
  }

  .inline-action:hover .ia-arrow {
    transform: translateX(3px);
  }

  .ia-arrow {
    font-size: var(--sc-fs-lg);
    line-height: 1;
    transition: transform var(--sc-duration-fast) var(--sc-ease);
  }

  @media (prefers-reduced-motion: reduce) {
    .inline-action, .ia-arrow { transition: none; }
  }
</style>
