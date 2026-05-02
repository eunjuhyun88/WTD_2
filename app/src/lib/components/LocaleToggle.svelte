<script lang="ts">
  import { locale, setLocale, type Locale } from '$lib/i18n/index';
</script>

<div class="locale-toggle" role="group" aria-label="Language">
  <button
    class:active={$locale === 'ko'}
    onclick={() => setLocale('ko')}
    aria-pressed={$locale === 'ko'}
  >KO</button>
  <span class="divider">/</span>
  <button
    class:active={$locale === 'en'}
    onclick={() => setLocale('en')}
    aria-pressed={$locale === 'en'}
  >EN</button>
</div>

<style>
  .locale-toggle {
    display: flex;
    align-items: center;
    gap: 2px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
  }
  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    color: rgba(255,255,255,0.3);
    transition: color 0.15s;
    line-height: 1;
  }
  button:hover { color: rgba(255,255,255,0.7); }
  button.active { color: #fff; font-weight: 700; }
  .divider { color: rgba(255,255,255,0.15); user-select: none; }
</style>
