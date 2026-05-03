<script lang="ts">
  import { onMount } from 'svelte';
  import { activePairState, setActivePair, setActiveTimeframe, setActiveSpeed } from '$lib/stores/activePairStore';
  import { RESETTABLE_STORAGE_KEYS } from '$lib/stores/storageKeys';
  import {
    CORE_TIMEFRAME_OPTIONS,
    formatTimeframeLabel,
    normalizeTimeframe,
  } from '$lib/utils/timeframe';
  import { fetchPreferencesApi, updatePreferencesApi } from '$lib/api/preferencesApi';
  import TelegramConnectWidget from '$lib/components/settings/TelegramConnectWidget.svelte';
  import { get } from 'svelte/store';
  import { douniRuntimeStore, type DouniMode } from '$lib/stores/douniRuntime';

  let state = $activePairState;
  $: state = $activePairState;
  let saving = false;
  let loadedRemote = false;

  let settings = {
    defaultTF: normalizeTimeframe(state.timeframe),
    signals: true,
    sfx: true,
    dataSource: 'binance',
    chartTheme: 'dark',
    speed: state.speed || 3,
    language: 'kr'
  };
  $: {
    const normalized = normalizeTimeframe(state.timeframe);
    if (settings.defaultTF !== normalized) {
      settings = { ...settings, defaultTF: normalized };
    }
  }

  async function persistPreferences(currentSettings = settings) {
    saving = true;
    await updatePreferencesApi({
      defaultPair: state.pair,
      defaultTimeframe: normalizeTimeframe(currentSettings.defaultTF),
      battleSpeed: Number(currentSettings.speed || 3),
      signalsEnabled: Boolean(currentSettings.signals),
      sfxEnabled: Boolean(currentSettings.sfx),
      chartTheme: currentSettings.chartTheme,
      dataSource: currentSettings.dataSource,
      language: currentSettings.language
    });
    saving = false;
  }

  let _persistTimer: ReturnType<typeof setTimeout> | null = null;
  function queuePersist() {
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      persistPreferences(settings);
    }, 250);
  }

  function updateSetting(key: string, value: any) {
    const next = { ...settings, [key]: value };
    settings = next;
    if (key === 'speed') {
      setActiveSpeed(value);
    }
    if (key === 'defaultTF') {
      const timeframe = normalizeTimeframe(value);
      setActiveTimeframe(timeframe);
    }
    queuePersist();
  }

  function resetAllData() {
    if (typeof window !== 'undefined') {
      for (const key of RESETTABLE_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
      window.location.reload();
    }
  }

  // ── AI (DOUNI) settings ──────────────────────────────────────
  const _rt = get(douniRuntimeStore);
  let aiMode: DouniMode = _rt.mode;
  let aiProvider = _rt.provider;
  let aiApiKey = _rt.apiKey;
  let aiOllamaModel = _rt.ollamaModel;
  let aiOllamaEndpoint = _rt.ollamaEndpoint;
  let testLoading = false;
  let testResult = '';

  function saveAiConfig() {
    douniRuntimeStore.patch({
      mode: aiMode,
      provider: aiProvider,
      apiKey: aiApiKey,
      ollamaModel: aiOllamaModel,
      ollamaEndpoint: aiOllamaEndpoint,
    });
  }

  function setAiMode(mode: DouniMode) {
    aiMode = mode;
    saveAiConfig();
  }

  async function testAi() {
    testLoading = true;
    testResult = '';
    try {
      const res = await fetch('/api/cogochi/terminal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          greeting: true,
          runtimeConfig: { mode: aiMode, provider: aiProvider, apiKey: aiApiKey, ollamaModel: aiOllamaModel, ollamaEndpoint: aiOllamaEndpoint },
          locale: settings.language === 'kr' ? 'ko-KR' : 'en-US',
        }),
      });
      if (!res.ok || !res.body) { testResult = 'Connection failed'; return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let text = '';
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'text_delta') { text += ev.text; testResult = text; }
            if (ev.type === 'done' || ev.type === 'error') break outer;
          } catch {}
        }
      }
      if (!text) testResult = '✓ Connected';
    } catch (e: any) {
      testResult = 'Error: ' + (e.message || 'Unknown');
    } finally {
      testLoading = false;
    }
  }

  onMount(async () => {
    const remote = await fetchPreferencesApi();
    if (!remote) return;

    settings = {
      ...settings,
      defaultTF: normalizeTimeframe(remote.defaultTimeframe),
      signals: Boolean(remote.signalsEnabled),
      sfx: Boolean(remote.sfxEnabled),
      dataSource: remote.dataSource || settings.dataSource,
      chartTheme: remote.chartTheme || settings.chartTheme,
      speed: Number(remote.battleSpeed || settings.speed),
      language: remote.language || settings.language
    };

    activePairState.update((s) => ({
      ...s,
      pair: remote.defaultPair || s.pair,
      timeframe: normalizeTimeframe(remote.defaultTimeframe),
      speed: Number(remote.battleSpeed || s.speed || 3)
    }));

    loadedRemote = true;
  });
</script>

<div class="general-panel">
  <div class="sync-badge">
    {#if saving}Saving...{:else if loadedRemote}Cloud sync{:else}Local{/if}
  </div>

  <div class="settings-body">
    <!-- Profile & Subscription -->
    <section class="settings-section">
      <div class="ss-head">
        <span class="surface-kicker">Profile & Subscription</span>
      </div>
      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Passport</div>
          <div class="sr-desc">Win rate, LP, tier, trading streak</div>
        </div>
        <a class="sr-link-btn" href="/settings/passport">View Passport →</a>
      </div>
      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Subscription</div>
          <div class="sr-desc">Current plan · upgrade for unlimited patterns</div>
        </div>
        <a class="sr-link-btn" href="/settings/status">Plan Details →</a>
      </div>
    </section>

    <!-- AI (DOUNI) — moved to 2nd -->
    <section class="settings-section">
      <div class="ss-head">
        <span class="surface-kicker">AI (DOUNI)</span>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Mode</div>
          <div class="sr-desc">DOUNI insight generation method</div>
        </div>
        <div class="mode-btns">
          {#each ['TERMINAL', 'HEURISTIC', 'OLLAMA', 'API'] as m}
            <button class="mode-btn" class:active={aiMode === m} onclick={() => setAiMode(m as DouniMode)}>
              {m}
            </button>
          {/each}
        </div>
      </div>

      <div class="mode-desc-row">
        {#if aiMode === 'TERMINAL'}
          <p>Data terminal only — no AI. Bloomberg-style raw data.</p>
        {:else if aiMode === 'HEURISTIC'}
          <p>Template synthesis — structured snapshot summary without LLM. Lightest fallback mode.</p>
        {:else if aiMode === 'OLLAMA'}
          <p>Local Ollama — runs on your machine. Full privacy.</p>
        {:else}
          <p>Full AI analysis — uses your saved personal key if available, otherwise falls back to the server-configured provider.</p>
        {/if}
      </div>

      {#if aiMode === 'API'}
        <div class="setting-row">
          <div class="sr-info">
            <div class="sr-label">Provider</div>
            <div class="sr-desc">Groq free · fast (recommended)</div>
          </div>
          <select class="sr-select" bind:value={aiProvider} onchange={saveAiConfig}>
            <option value="groq">Groq (free)</option>
            <option value="cerebras">Cerebras</option>
            <option value="mistral">Mistral</option>
            <option value="openrouter">OpenRouter</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="sr-info">
            <div class="sr-label">API Key</div>
            <div class="sr-desc">Optional · if provided, saved to localStorage and used first</div>
          </div>
          <input
            type="password"
            class="sr-input"
            placeholder="gsk_..."
            bind:value={aiApiKey}
            onchange={saveAiConfig}
          />
        </div>
      {/if}

      {#if aiMode === 'OLLAMA'}
        <div class="setting-row">
          <div class="sr-info">
            <div class="sr-label">Endpoint</div>
            <div class="sr-desc">Ollama server address</div>
          </div>
          <input
            type="text"
            class="sr-input"
            placeholder="http://localhost:11434"
            bind:value={aiOllamaEndpoint}
            onchange={saveAiConfig}
          />
        </div>

        <div class="setting-row">
          <div class="sr-info">
            <div class="sr-label">Model</div>
            <div class="sr-desc">Installed Ollama model name</div>
          </div>
          <input
            type="text"
            class="sr-input"
            placeholder="mistral:7b"
            bind:value={aiOllamaModel}
            onchange={saveAiConfig}
          />
        </div>
      {/if}

      {#if aiMode !== 'TERMINAL'}
        <div class="setting-row">
          <div class="sr-info">
            <div class="sr-label">Test</div>
            <div class="sr-desc">Send greeting message to DOUNI</div>
          </div>
          <button class="test-btn" onclick={testAi} disabled={testLoading}>
            {testLoading ? '...' : 'Test'}
          </button>
        </div>
        {#if testResult}
          <div class="test-result-row">{testResult}</div>
        {/if}
      {/if}
    </section>

    <!-- Trading -->
    <section class="settings-section">
      <div class="ss-head">
        <span class="surface-kicker">Trading</span>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Default Timeframe</div>
          <div class="sr-desc">Set default chart timeframe</div>
        </div>
        <select class="sr-select" bind:value={settings.defaultTF} onchange={() => updateSetting('defaultTF', settings.defaultTF)}>
          {#each CORE_TIMEFRAME_OPTIONS as option}
            <option value={option.value}>{formatTimeframeLabel(option.value)}</option>
          {/each}
        </select>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Data Source</div>
          <div class="sr-desc">Real-time market data provider</div>
        </div>
        <select class="sr-select" bind:value={settings.dataSource} onchange={() => updateSetting('dataSource', settings.dataSource)}>
          <option value="binance">Binance Futures</option>
          <option value="simulation">Simulation</option>
        </select>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Game Speed</div>
          <div class="sr-desc">Arena battle speed multiplier</div>
        </div>
        <div class="speed-btns">
          {#each [1, 2, 3] as s}
            <button
              class="speed-btn"
              class:active={settings.speed === s}
              onclick={() => updateSetting('speed', s)}
            >{s}x</button>
          {/each}
        </div>
      </div>
    </section>

    <!-- Display -->
    <section class="settings-section">
      <div class="ss-head">
        <span class="surface-kicker">Display</span>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Chart Theme</div>
          <div class="sr-desc">Chart color scheme</div>
        </div>
        <select class="sr-select" bind:value={settings.chartTheme} onchange={() => updateSetting('chartTheme', settings.chartTheme)}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Language</div>
          <div class="sr-desc">Interface language</div>
        </div>
        <select class="sr-select" bind:value={settings.language} onchange={() => updateSetting('language', settings.language)}>
          <option value="kr">Korean</option>
          <option value="en">English</option>
        </select>
      </div>
    </section>

    <!-- Notifications -->
    <section class="settings-section">
      <div class="ss-head">
        <span class="surface-kicker">Notifications</span>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Signal Alerts</div>
          <div class="sr-desc">Receive trade signal notifications</div>
        </div>
        <button
          class="toggle-btn"
          class:on={settings.signals}
          aria-label="Toggle signal alerts"
          onclick={() => { settings.signals = !settings.signals; updateSetting('signals', settings.signals); }}
        >
          <div class="toggle-dot"></div>
        </button>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Sound Effects</div>
          <div class="sr-desc">Arena SFX and notifications</div>
        </div>
        <button
          class="toggle-btn"
          class:on={settings.sfx}
          aria-label="Toggle sound effects"
          onclick={() => { settings.sfx = !settings.sfx; updateSetting('sfx', settings.sfx); }}
        >
          <div class="toggle-dot"></div>
        </button>
      </div>

      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Alert Patterns</div>
          <div class="sr-desc">Pattern scan match alerts</div>
        </div>
        <button
          class="toggle-btn"
          class:on={settings.signals}
          aria-label="Toggle alert patterns"
          onclick={() => { settings.signals = !settings.signals; updateSetting('signals', settings.signals); }}
        >
          <div class="toggle-dot"></div>
        </button>
      </div>

      <div class="setting-row tg-row">
        <div class="sr-info">
          <div class="sr-label">Telegram Bot</div>
          <div class="sr-desc">Receive pattern alerts via Telegram</div>
        </div>
        <TelegramConnectWidget />
      </div>
    </section>

    <!-- Danger Zone -->
    <section class="settings-section danger">
      <div class="ss-head">
        <span class="surface-kicker danger-kicker">Danger Zone</span>
      </div>
      <div class="setting-row">
        <div class="sr-info">
          <div class="sr-label">Reset All Data</div>
          <div class="sr-desc">Delete all saved progress and start fresh</div>
        </div>
        <button class="reset-btn" onclick={resetAllData}>RESET</button>
      </div>
    </section>
  </div>
</div>

<style>
  .general-panel {
    max-width: 640px;
  }

  .sync-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs, 11px);
    color: var(--sc-text-3, #555);
    margin-bottom: 16px;
  }

  .settings-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .settings-section {
    background: rgba(255, 255, 255, 0.026);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    overflow: hidden;
  }
  .settings-section.danger {
    border-color: rgba(255, 100, 100, 0.2);
  }

  .ss-head {
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }

  .danger-kicker {
    color: #ff9ca0;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .setting-row:last-child { border-bottom: none; }

  .sr-info { flex: 1; min-width: 0; }
  .sr-label {
    font-family: var(--sc-font-body);
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--sc-text-0);
  }
  .sr-desc {
    font-family: var(--sc-font-body);
    font-size: 0.78rem;
    color: var(--sc-text-2);
    margin-top: 2px;
  }

  .sr-link-btn {
    font-family: var(--sc-font-body);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--sc-accent);
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .sr-link-btn:hover { background: rgba(255, 255, 255, 0.08); }

  .sr-select {
    font-family: var(--sc-font-body);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(250, 247, 235, 0.88);
    cursor: pointer;
  }

  .speed-btns { display: flex; gap: 4px; }
  .speed-btn {
    font-family: var(--sc-font-body);
    font-size: 0.78rem;
    font-weight: 700;
    width: 36px;
    height: 32px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(250, 247, 235, 0.52);
    cursor: pointer;
    transition: all 0.15s;
  }
  .speed-btn.active {
    background: rgba(219, 154, 159, 0.14);
    color: var(--sc-accent);
    border-color: rgba(219, 154, 159, 0.28);
  }

  .toggle-btn {
    width: 44px;
    height: 24px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    cursor: pointer;
    position: relative;
    transition: background 0.2s, border-color 0.2s;
    padding: 0;
    flex-shrink: 0;
  }
  .toggle-btn.on {
    background: var(--sc-good, #adca7c);
    border-color: rgba(173, 202, 124, 0.4);
  }
  .toggle-dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(250, 247, 235, 0.96);
    border: 1px solid rgba(0, 0, 0, 0.12);
    position: absolute;
    top: 2px;
    left: 2px;
    transition: left 0.2s;
  }
  .toggle-btn.on .toggle-dot { left: 22px; }

  .reset-btn {
    font-family: var(--sc-font-body);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 6px 16px;
    border-radius: 6px;
    background: rgba(255, 100, 100, 0.1);
    color: #ff9ca0;
    border: 1px solid rgba(255, 100, 100, 0.2);
    cursor: pointer;
    transition: all 0.15s;
  }
  .reset-btn:hover { background: rgba(255, 100, 100, 0.18); }

  @media (max-width: 540px) {
    .setting-row {
      padding: 10px 14px;
    }
  }

  /* ── AI section ─────────────────────────────────────────── */
  .mode-btns {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .mode-btn {
    padding: 4px 9px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: transparent;
    color: var(--sc-text-2, #888);
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.7rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .mode-btn:hover { background: rgba(255, 255, 255, 0.06); }
  .mode-btn.active {
    background: rgba(99, 179, 237, 0.14);
    border-color: rgba(99, 179, 237, 0.4);
    color: #63b3ed;
  }

  .mode-desc-row {
    padding: 7px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .mode-desc-row p {
    margin: 0;
    font-size: 0.78rem;
    color: var(--sc-text-3, #555);
    font-family: var(--sc-font-body, sans-serif);
  }

  .sr-input {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 4px 10px;
    color: var(--sc-text-0, #eee);
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.82rem;
    width: 200px;
    outline: none;
    flex-shrink: 0;
  }
  .sr-input:focus { border-color: rgba(99, 179, 237, 0.4); }

  .test-btn {
    padding: 5px 16px;
    border-radius: 4px;
    border: 1px solid rgba(99, 179, 237, 0.3);
    background: rgba(99, 179, 237, 0.08);
    color: #63b3ed;
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .test-btn:hover:not(:disabled) { background: rgba(99, 179, 237, 0.15); }
  .test-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .test-result-row {
    padding: 8px 16px 12px;
    font-family: var(--sc-font-body, sans-serif);
    font-size: 0.82rem;
    color: var(--sc-text-1, #ccc);
    white-space: pre-wrap;
    word-break: break-word;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .tg-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 4px;
  }
</style>
