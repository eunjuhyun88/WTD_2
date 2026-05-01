<script lang="ts">
  /**
   * DecisionHUDAdapter — wraps terminal DecisionHUD for cogochi AppShell.
   *
   * Reads decisionBundle from shellStore and passes analysisData=null
   * (empty state) until a full analysis is loaded. The HUD renders its
   * "no analysis" empty state with the symbol from the bundle.
   */
  import DecisionHUD from '../../components/terminal/workspace/DecisionHUD.svelte';
  import { shellStore } from './shell.store';

  const bundle = $derived($shellStore.decisionBundle);
  const symbol = $derived(bundle?.symbol ?? $shellStore.tabs.find(t => t.id === $shellStore.activeTabId)?.tabState.symbol ?? 'BTCUSDT');
</script>

<DecisionHUD
  analysisData={null}
  symbol={symbol}
  isLoading={false}
  isStreaming={false}
  onAction={(text: string) => {
    window.dispatchEvent(new CustomEvent('cogochi:cmd', { detail: { id: 'open_ai_detail', userText: text, assistantText: '' } }));
  }}
/>
