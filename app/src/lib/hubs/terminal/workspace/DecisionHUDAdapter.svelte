<script lang="ts">
  import DecisionHUD from './DecisionHUD.svelte';
  import { shellStore } from '../shell.store';
  import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';

  interface Props {
    analysisData?: AnalyzeEnvelope | null;
    isLoading?: boolean;
  }
  let { analysisData = null, isLoading = false }: Props = $props();

  const bundle = $derived($shellStore.decisionBundle);
  const symbol = $derived(bundle?.symbol ?? $shellStore.tabs.find(t => t.id === $shellStore.activeTabId)?.tabState.symbol ?? 'BTCUSDT');
</script>

<DecisionHUD
  {analysisData}
  symbol={symbol}
  {isLoading}
  isStreaming={false}
  onAction={(text: string) => {
    window.dispatchEvent(new CustomEvent('cogochi:cmd', { detail: { id: 'open_ai_detail', userText: text, assistantText: '' } }));
  }}
/>
