<script lang="ts">
  import {
    walletStore,
    closeWalletModal,
    setWalletModalStep,
    applyAuthenticatedUser,
    clearAuthenticatedUser,
    connectWallet,
    signMessage,
    disconnectWallet
  } from '$lib/stores/walletStore';
  import type { WalletState } from '$lib/stores/walletStore';
  import { loginAuth, logoutAuth, registerAuth, requestWalletNonce, verifyWalletSignature, walletAuth } from '$lib/api/auth';
  import {
    WALLET_PROVIDER_LABEL,
    getPreferredEvmChainCode,
    hasInjectedEvmProvider,
    isWalletConnectConfigured,
    requestInjectedEvmAccount,
    requestPhantomSolanaAccount,
    signInjectedEvmMessage,
    type WalletProviderKey
  } from '$lib/wallet/providers';

  type AuthMode = 'signup' | 'login';
  type WalletFunnelStep = 'modal_open' | 'connect' | 'sign' | 'auth' | 'disconnect';
  type WalletFunnelStatus = 'view' | 'success' | 'error';

  const STEP_TITLE: Record<WalletState['walletModalStep'], string> = {
    'wallet-select': 'CONNECT WALLET',
    connecting: 'CONNECTING',
    'sign-message': 'VERIFY OWNERSHIP',
    connected: 'WALLET READY',
    signup: 'CREATE ACCOUNT',
    login: 'LOG IN',
    profile: 'MY PROFILE'
  };

  const WALLET_SIGNATURE_RE = /^0x[0-9a-f]{130}$/i;
  const preferredEvmChain = getPreferredEvmChainCode();
  const walletConnectReady = isWalletConnectConfigured();

  $: state = $walletStore;
  $: step = state.walletModalStep;

  let authMode: AuthMode = 'signup';
  let emailInput = '';
  let nicknameInput = '';
  let emailError = '';
  let actionError = '';
  let connectingProvider = '';
  let signingMessage = false;
  let authSubmitting = false;
  let signedWalletMessage = '';
  let signedWalletSignature = '';
  let trackedModalOpen = false;

  $: headerTitle = STEP_TITLE[step] ?? 'WALLET ACCESS';

  interface GTMWindow extends Window {
    dataLayer?: Array<Record<string, unknown>>;
  }

  function gtmEvent(event: string, payload: Record<string, unknown> = {}) {
    if (typeof window === 'undefined') return;
    const w = window as GTMWindow;
    if (!Array.isArray(w.dataLayer)) return;
    w.dataLayer.push({
      event,
      area: 'wallet_modal',
      ...payload,
    });
  }

  function trackWalletFunnel(
    stepName: WalletFunnelStep,
    status: WalletFunnelStatus,
    payload: Record<string, unknown> = {}
  ) {
    gtmEvent('wallet_funnel', {
      step: stepName,
      status,
      mode: authMode,
      ...payload,
    });
  }

  function toErrorReason(error: unknown): string {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (!message) return 'unknown';
    if (message.includes('reject') || message.includes('denied')) return 'user_rejected';
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('network')) return 'network';
    if (message.includes('wallet')) return 'wallet';
    if (message.includes('signature') || message.includes('sign')) return 'signature';
    if (message.includes('email') || message.includes('nickname')) return 'form_validation';
    return 'unexpected';
  }

  function isWalletProviderKey(value: string): value is WalletProviderKey {
    return value === 'metamask'
      || value === 'coinbase'
      || value === 'walletconnect'
      || value === 'phantom';
  }

  function isEvmAddress(address: string): boolean {
    return address.startsWith('0x');
  }

  function clearErrors() {
    emailError = '';
    actionError = '';
  }

  function clearWalletProof() {
    signedWalletMessage = '';
    signedWalletSignature = '';
  }

  function hasWalletProof(): boolean {
    return Boolean(signedWalletMessage && WALLET_SIGNATURE_RE.test(signedWalletSignature));
  }

  function setAuthMode(mode: AuthMode) {
    authMode = mode;
    clearErrors();
    if (step === 'signup' || step === 'login') {
      setWalletModalStep(mode);
    }
  }

  function startAuthFlow(mode: AuthMode) {
    setAuthMode(mode);

    if (state.connected && state.address) {
      if (hasWalletProof()) {
        setWalletModalStep(mode);
      } else {
        setWalletModalStep('sign-message');
      }
      return;
    }

    setWalletModalStep('wallet-select');
  }

  function parseEmailOnly(): { email: string } | null {
    clearErrors();
    const email = emailInput.trim();
    if (!email.includes('@')) {
      emailError = 'Valid email required';
      return null;
    }
    if (email.length > 254) {
      emailError = 'Email is too long';
      return null;
    }
    return { email };
  }

  function parseSignupInput(): { email: string; nickname: string } | null {
    const emailPayload = parseEmailOnly();
    if (!emailPayload) return null;

    const nickname = nicknameInput.trim();
    if (nickname.length < 2) {
      emailError = 'Nickname must be 2+ characters';
      return null;
    }
    if (nickname.length > 32) {
      emailError = 'Nickname must be 32 characters or less';
      return null;
    }

    return {
      email: emailPayload.email,
      nickname,
    };
  }

  function parseLoginInput(): { email: string; nickname?: string } | null {
    const emailPayload = parseEmailOnly();
    if (!emailPayload) return null;

    const nickname = nicknameInput.trim();
    if (nickname && nickname.length < 2) {
      emailError = 'Nickname must be 2+ characters if provided';
      return null;
    }
    if (nickname.length > 32) {
      emailError = 'Nickname must be 32 characters or less';
      return null;
    }

    return nickname
      ? { email: emailPayload.email, nickname }
      : { email: emailPayload.email };
  }

  function getSignedWalletProof(): { walletMessage: string; walletSignature: string } | null {
    if (!hasWalletProof()) return null;
    return {
      walletMessage: signedWalletMessage,
      walletSignature: signedWalletSignature,
    };
  }

  function ensureWalletReadyForAuth(): boolean {
    if (!state.connected || !state.address) {
      actionError = 'Connect wallet first.';
      setWalletModalStep('wallet-select');
      return false;
    }

    const walletProof = getSignedWalletProof();
    if (!walletProof) {
      actionError = 'Sign wallet message first.';
      setWalletModalStep('sign-message');
      return false;
    }

    return true;
  }

  async function handleSignupSubmit() {
    const payload = parseSignupInput();
    if (!payload) return;
    if (!ensureWalletReadyForAuth()) return;

    const walletProof = getSignedWalletProof();
    if (!walletProof || !state.address) return;

    authSubmitting = true;
    try {
      const res = await registerAuth({
        ...payload,
        walletAddress: state.address,
        walletMessage: walletProof.walletMessage,
        walletSignature: walletProof.walletSignature,
      });
      applyAuthenticatedUser(res.user);
      trackWalletFunnel('auth', 'success', {
        auth_mode: 'signup',
        chain: state.chain,
      });
    } catch (error) {
      emailError = error instanceof Error ? error.message : 'Failed to create account';
      trackWalletFunnel('auth', 'error', {
        auth_mode: 'signup',
        reason: toErrorReason(error),
      });
    } finally {
      authSubmitting = false;
    }
  }

  async function handleLoginSubmit() {
    const payload = parseLoginInput();
    if (!payload) return;
    if (!ensureWalletReadyForAuth()) return;

    const walletProof = getSignedWalletProof();
    if (!walletProof || !state.address) return;

    authSubmitting = true;
    try {
      const res = await loginAuth({
        email: payload.email,
        nickname: payload.nickname ?? '',
        walletAddress: state.address,
        walletMessage: walletProof.walletMessage,
        walletSignature: walletProof.walletSignature,
      });
      applyAuthenticatedUser(res.user);
      trackWalletFunnel('auth', 'success', {
        auth_mode: 'login',
        chain: state.chain,
      });
    } catch (error) {
      emailError = error instanceof Error ? error.message : 'Failed to log in';
      trackWalletFunnel('auth', 'error', {
        auth_mode: 'login',
        reason: toErrorReason(error),
      });
    } finally {
      authSubmitting = false;
    }
  }

  async function handleConnect(provider: string) {
    clearErrors();
    clearWalletProof();

    if (!isWalletProviderKey(provider)) {
      actionError = 'Unsupported wallet provider.';
      return;
    }
    if (provider === 'walletconnect' && !walletConnectReady) {
      actionError = 'WalletConnect project id is missing. Set PUBLIC_WALLETCONNECT_PROJECT_ID first.';
      return;
    }

    connectingProvider = WALLET_PROVIDER_LABEL[provider];
    setWalletModalStep('connecting');

    try {
      if (provider === 'phantom') {
        if (hasInjectedEvmProvider('phantom')) {
          const walletAddress = await requestInjectedEvmAccount('phantom');
          connectWallet(provider, walletAddress, preferredEvmChain);
        } else {
          throw new Error('Phantom EVM required. Enable "Ethereum" in Phantom wallet settings and reload.');
        }
      } else {
        const walletAddress = await requestInjectedEvmAccount(provider);
        connectWallet(provider, walletAddress, preferredEvmChain);
      }
      trackWalletFunnel('connect', 'success', {
        provider,
        chain: preferredEvmChain,
      });
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to connect wallet';
      trackWalletFunnel('connect', 'error', {
        provider,
        reason: toErrorReason(error),
      });
      setWalletModalStep('wallet-select');
    } finally {
      connectingProvider = '';
    }
  }

  async function handleSignMessage() {
    signingMessage = true;
    actionError = '';

    try {
      if (!state.address) {
        throw new Error('Wallet address is missing');
      }

      if (!state.provider || !isWalletProviderKey(state.provider)) {
        throw new Error('Wallet provider is missing');
      }

      const provider = state.provider;

      if (!isEvmAddress(state.address)) {
        throw new Error('Solana wallet auth is temporarily unavailable. Use an EVM wallet.');
      }

      const noncePayload = await requestWalletNonce({
        address: state.address,
        provider,
        chain: state.chain,
      });

      const signature = await signInjectedEvmMessage(provider, noncePayload.message, state.address);

      if (state.email) {
        await verifyWalletSignature({
          address: state.address,
          message: noncePayload.message,
          signature,
          provider,
          chain: state.chain,
        });
      }

      signedWalletMessage = noncePayload.message;
      signedWalletSignature = signature;
      signMessage(signature);

      trackWalletFunnel('sign', 'success', { provider, chain: state.chain });

      // Wallet-first: auto-login or auto-register
      try {
        const authResult = await walletAuth({
          walletAddress: state.address!,
          walletMessage: noncePayload.message,
          walletSignature: signature,
        });
        if (authResult.action === 'login' && authResult.user) {
          applyAuthenticatedUser(authResult.user);
          trackWalletFunnel('auth', 'success', { action: 'auto_login' });
        }
        setWalletModalStep('profile');
      } catch (walletAuthError) {
        console.warn('[WalletModal] wallet-auth error', walletAuthError);
        setWalletModalStep('profile');
      }
    } catch (error) {
      clearWalletProof();
      actionError = error instanceof Error ? error.message : 'Failed to sign wallet message';
      trackWalletFunnel('sign', 'error', { reason: toErrorReason(error) });
    } finally {
      signingMessage = false;
    }
  }

  async function handleDisconnect() {
    try {
      await logoutAuth();
    } catch (error) {
      console.warn('[WalletModal] logout api failed', error);
    }

    clearWalletProof();
    disconnectWallet();
    clearAuthenticatedUser();
    trackWalletFunnel('disconnect', 'success', {
      had_session: Boolean(state.email),
    });
    closeWalletModal();
  }

  function handleClose() {
    closeWalletModal();
  }

  function connectStepState(): 'active' | 'done' | 'idle' {
    if (state.connected) return 'done';
    if (step === 'wallet-select' || step === 'connecting') return 'active';
    return 'idle';
  }

  function signStepState(): 'active' | 'done' | 'idle' {
    if (hasWalletProof()) return 'done';
    if (step === 'sign-message') return 'active';
    if (!state.connected) return 'idle';
    return 'idle';
  }

  function authStepState(): 'active' | 'done' | 'idle' {
    if (state.nickname || state.email) return 'done';
    if (step === 'signup' || step === 'login' || step === 'connected') return 'active';
    return 'idle';
  }

  $: if (state.showWalletModal && !trackedModalOpen) {
    trackWalletFunnel('modal_open', 'view', { entry_step: step });
    trackedModalOpen = true;
  }

  $: if (!state.showWalletModal) {
    authSubmitting = false;
    signingMessage = false;
    connectingProvider = '';
    trackedModalOpen = false;
  }
</script>

{#if state.showWalletModal}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-overlay" on:click={handleClose}>
  <div class="wallet-panel" on:click|stopPropagation>
    <div class="wh">
      <div class="wh-left">
        <span class="wh-tag">//WALLET AUTH</span>
        <span class="wht">{headerTitle}</span>
      </div>

      <button class="whc" type="button" aria-label="Close wallet modal" on:click={handleClose}>✕</button>
    </div>

    {#if actionError}
      <div class="global-error">{actionError}</div>
    {/if}

    <div class="progress-row" aria-hidden="true">
      <div class="pstep" class:active={connectStepState() === 'active'} class:done={connectStepState() === 'done'}>1 CONNECT</div>
      <div class="pstep" class:active={signStepState() === 'active'} class:done={signStepState() === 'done'}>2 SIGN</div>
      <div class="pstep" class:active={authStepState() === 'active'} class:done={authStepState() === 'done'}>3 ACCOUNT</div>
    </div>
    {#if step === 'wallet-select'}
      <div class="wb">
        <div class="step-hero">
          <span class="hero-kicker">STEP 1</span>
          <h3 class="hero-title">Connect your wallet</h3>
          <p class="hero-sub">Connect your wallet to access or create your account automatically.</p>
        </div>

        <div class="wallet-list">
          <button class="wopt" type="button" on:click={() => handleConnect('metamask')}>
            <span class="wo-icon">🦊</span>
            <span class="wo-name">MetaMask</span>
            <span class="wo-chain">EVM</span>
          </button>
          <button
            class="wopt"
            type="button"
            on:click={() => handleConnect('walletconnect')}
            disabled={!walletConnectReady}
            title={!walletConnectReady ? 'Set PUBLIC_WALLETCONNECT_PROJECT_ID in env first.' : undefined}
          >
            <span class="wo-icon">🔵</span>
            <span class="wo-name">WalletConnect</span>
            <span class="wo-chain">{walletConnectReady ? 'EVM' : 'SETUP REQUIRED'}</span>
          </button>
          <button class="wopt" type="button" on:click={() => handleConnect('coinbase')}>
            <span class="wo-icon">🔷</span>
            <span class="wo-name">Coinbase Wallet</span>
            <span class="wo-chain">EVM</span>
          </button>
          <button class="wopt" type="button" on:click={() => handleConnect('phantom')}>
            <span class="wo-icon">👻</span>
            <span class="wo-name">Phantom</span>
            <span class="wo-chain">EVM</span>
          </button>
        </div>
      </div>

    {:else if step === 'connecting'}
      <div class="wb">
        <div class="connecting-anim">
          <div class="conn-spinner"></div>
          <div class="conn-text">Connecting {connectingProvider || 'wallet'}...</div>
          <div class="conn-sub">Approve the connection request in wallet</div>
        </div>
      </div>

    {:else if step === 'sign-message'}
      <div class="wb">
        <div class="step-hero">
          <span class="hero-kicker">STEP 2</span>
          <h3 class="hero-title">Sign to verify ownership</h3>
          <p class="hero-sub">This signature is free and used only for account authentication.</p>
        </div>

        <div class="info-box">
          <div class="info-row">
            <span class="info-k">WALLET</span>
            <span class="info-v">{state.shortAddr || '-'}</span>
          </div>
          <div class="info-row">
            <span class="info-k">CHAIN</span>
            <span class="info-v">{state.chain}</span>
          </div>
          <div class="info-row">
            <span class="info-k">MODE</span>
            <span class="info-v">{authMode === 'login' ? 'LOG IN' : 'SIGN UP'}</span>
          </div>
        </div>

        <button class="btn-primary" type="button" on:click={handleSignMessage} disabled={signingMessage}>
          {#if signingMessage}SIGNING...{:else}SIGN MESSAGE{/if}
        </button>
        <button class="btn-ghost" type="button" on:click={() => setWalletModalStep('wallet-select')}>
          USE DIFFERENT WALLET
        </button>
      </div>

    {:else if step === 'connected'}
      <div class="wb">
        <div class="step-hero">
          <span class="hero-kicker">WALLET READY</span>
          <h3 class="hero-title">{state.shortAddr}</h3>
          <p class="hero-sub">{hasWalletProof() ? 'Wallet challenge completed.' : 'Sign challenge is required before authentication.'}</p>
        </div>

        <div class="info-box">
          <div class="info-row">
            <span class="info-k">CHAIN</span>
            <span class="info-v">{state.chain}</span>
          </div>
          <div class="info-row">
            <span class="info-k">BALANCE</span>
            <span class="info-v">{state.balance.toLocaleString()} USDT</span>
          </div>
        </div>

        {#if hasWalletProof()}
          <button class="btn-primary" type="button" on:click={() => setWalletModalStep(authMode)}>
            CONTINUE TO {authMode === 'login' ? 'LOG IN' : 'SIGN UP'}
          </button>
        {:else}
          <button class="btn-primary" type="button" on:click={() => setWalletModalStep('sign-message')}>
            SIGN TO CONTINUE
          </button>
        {/if}

        <button class="btn-ghost" type="button" on:click={handleDisconnect}>DISCONNECT WALLET</button>
      </div>

    {:else if step === 'signup'}
      <div class="wb">
        <div class="step-hero">
          <span class="hero-kicker">STEP 3</span>
          <h3 class="hero-title">Create account</h3>
          <p class="hero-sub">Use only required identity fields.</p>
        </div>

        <div class="form-group">
          <label class="form-label" for="signup-email">EMAIL</label>
          <input id="signup-email" class="form-input" type="email" bind:value={emailInput} placeholder="you@example.com" />
        </div>

        <div class="form-group">
          <label class="form-label" for="signup-nickname">NICKNAME</label>
          <input id="signup-nickname" class="form-input" type="text" bind:value={nicknameInput} maxlength="32" placeholder="TraderDoge" />
        </div>

        {#if emailError}
          <div class="form-error">{emailError}</div>
        {/if}

        <button class="btn-primary" type="button" on:click={handleSignupSubmit} disabled={authSubmitting}>
          {#if authSubmitting}CREATING...{:else}CREATE ACCOUNT{/if}
        </button>
        <button class="btn-ghost" type="button" on:click={() => setWalletModalStep('sign-message')}>BACK TO SIGN</button>
      </div>

    {:else if step === 'login'}
      <div class="wb">
        <div class="step-hero">
          <span class="hero-kicker">STEP 3</span>
          <h3 class="hero-title">Log in account</h3>
          <p class="hero-sub">Email + wallet signature is the primary login path.</p>
        </div>

        <div class="form-group">
          <label class="form-label" for="login-email">EMAIL</label>
          <input id="login-email" class="form-input" type="email" bind:value={emailInput} placeholder="you@example.com" />
        </div>

        <div class="form-group">
          <label class="form-label" for="login-nickname">NICKNAME (OPTIONAL)</label>
          <input id="login-nickname" class="form-input" type="text" bind:value={nicknameInput} maxlength="32" placeholder="Only if duplicate email history" />
        </div>

        {#if emailError}
          <div class="form-error">{emailError}</div>
        {/if}

        <button class="btn-primary" type="button" on:click={handleLoginSubmit} disabled={authSubmitting}>
          {#if authSubmitting}LOGGING IN...{:else}LOG IN{/if}
        </button>
        <button class="btn-ghost" type="button" on:click={() => setWalletModalStep('sign-message')}>BACK TO SIGN</button>
      </div>

    {:else}
      <div class="wb">
        <div class="step-hero">
          <span class="hero-kicker">ACCOUNT</span>
          <h3 class="hero-title">{state.nickname || 'TRADER'}</h3>
          <p class="hero-sub">Core profile information only.</p>
        </div>

        <div class="info-box">
          <div class="info-row">
            <span class="info-k">EMAIL</span>
            <span class="info-v">{state.email || '-'}</span>
          </div>
          <div class="info-row">
            <span class="info-k">NICKNAME</span>
            <span class="info-v">{state.nickname || '-'}</span>
          </div>
          <div class="info-row">
            <span class="info-k">TIER</span>
            <span class="info-v">{state.tier.toUpperCase()}</span>
          </div>
          <div class="info-row">
            <span class="info-k">PHASE</span>
            <span class="info-v">P{state.phase}</span>
          </div>
          <div class="info-row">
            <span class="info-k">WALLET</span>
            <span class="info-v">{state.connected ? state.shortAddr : 'NOT CONNECTED'}</span>
          </div>
        </div>

        {#if state.connected}
          <a class="btn-primary passport-link" href="/passport" on:click={handleClose}>VIEW PASSPORT</a>
          <button class="btn-ghost" type="button" on:click={handleDisconnect}>LOG OUT & DISCONNECT</button>
        {:else}
          <button class="btn-primary" type="button" on:click={() => setWalletModalStep('wallet-select')}>CONNECT WALLET</button>
          <a class="btn-ghost passport-link" href="/passport" on:click={handleClose}>OPEN PASSPORT</a>
        {/if}
      </div>
    {/if}
  </div>
</div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(2, 2, 4, 0.76);
    backdrop-filter: blur(14px);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 12px;
  }

  .wallet-panel {
    --wm-bg: #09090b;
    --wm-bg-2: #111114;
    --wm-card: rgba(255, 255, 255, 0.03);
    --wm-border: rgba(249, 216, 194, 0.12);
    --wm-accent: #db9a9f;
    --wm-text: #faf7eb;
    --wm-muted: rgba(250, 247, 235, 0.62);
    --wm-kicker: rgba(219, 154, 159, 0.88);
    width: min(560px, 100%);
    max-height: min(88vh, 820px);
    border: 1px solid var(--wm-border);
    border-radius: 24px;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(18, 18, 20, 0.94), rgba(10, 10, 12, 0.92)),
      radial-gradient(circle at top right, rgba(249, 216, 194, 0.06), transparent 36%);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    display: flex;
    flex-direction: column;
  }

  .wh {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 18px;
    border-bottom: 1px solid rgba(249, 216, 194, 0.08);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
  }

  .wh-left {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .wh-tag {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    letter-spacing: 0.16em;
    color: var(--wm-kicker);
  }

  .wht {
    font-family: var(--sc-font-body);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--wm-text);
  }

  .whc {
    border: 1px solid rgba(249, 216, 194, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: var(--wm-text);
    width: 32px;
    height: 32px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 14px;
    flex-shrink: 0;
  }

  .whc:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .global-error,
  .form-error {
    margin: 10px 16px 0;
    padding: 11px 12px;
    border: 1px solid rgba(255, 89, 89, 0.45);
    border-radius: 14px;
    background: rgba(255, 89, 89, 0.08);
    color: #ff9b9b;
    font-family: var(--sc-font-body);
    font-size: 14px;
    line-height: 1.5;
  }

  .form-error {
    margin: 0 0 6px;
  }

  .progress-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(249, 216, 194, 0.08);
  }

  .pstep {
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: 999px;
    text-align: center;
    padding: 7px 10px;
    font-family: var(--sc-font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: rgba(250, 247, 235, 0.42);
  }

  .pstep.active {
    color: var(--wm-text);
    border-color: rgba(219, 154, 159, 0.18);
    background: rgba(255, 255, 255, 0.06);
  }

  .pstep.done {
    color: var(--wm-text);
    border-color: rgba(219, 154, 159, 0.14);
    background: rgba(219, 154, 159, 0.08);
  }

  .wb {
    padding: 22px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .step-hero {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hero-kicker {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    letter-spacing: 0.16em;
    color: var(--wm-kicker);
  }

  .hero-title {
    font-family: var(--sc-font-body);
    font-size: clamp(1.45rem, 2vw, 1.9rem);
    letter-spacing: -0.045em;
    color: var(--wm-text);
    line-height: 1.05;
  }

  .hero-sub {
    font-family: var(--sc-font-body);
    font-size: 0.98rem;
    color: var(--wm-muted);
    line-height: 1.6;
  }

  .info-box {
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.03);
    padding: 14px;
  }

  .wallet-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .wopt {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--wm-text);
    padding: 14px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.16s ease, background 0.16s ease;
  }

  .wopt:hover {
    border-color: rgba(219, 154, 159, 0.18);
    background: rgba(255, 255, 255, 0.06);
  }

  .wopt:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }

  .wo-icon {
    font-size: 18px;
  }

  .wo-name {
    font-family: var(--sc-font-body);
    font-size: 15px;
    font-weight: 600;
    flex: 1;
  }

  .wo-chain {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    border: 1px solid rgba(249, 216, 194, 0.1);
    border-radius: 999px;
    padding: 3px 6px;
    color: var(--wm-kicker);
  }

  .connecting-anim {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 0;
  }

  .conn-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(232, 150, 125, 0.2);
    border-top-color: var(--wm-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .conn-text {
    font-family: var(--sc-font-body);
    font-size: 16px;
    font-weight: 600;
    color: var(--wm-text);
  }

  .conn-sub {
    font-family: var(--sc-font-body);
    font-size: 14px;
    color: var(--wm-muted);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 6px 2px;
    border-bottom: 1px solid rgba(249, 216, 194, 0.08);
  }

  .info-row:last-child {
    border-bottom: none;
  }

  .info-k {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: rgba(250, 247, 235, 0.52);
  }

  .info-v {
    font-family: var(--sc-font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--wm-text);
    text-align: right;
    word-break: break-word;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .form-label {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: rgba(250, 247, 235, 0.52);
  }

  .form-input {
    width: 100%;
    border: 1px solid rgba(249, 216, 194, 0.1);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--wm-text);
    padding: 13px 14px;
    font-family: var(--sc-font-body);
    font-size: 15px;
    outline: none;
    transition: border-color 0.16s ease, box-shadow 0.16s ease;
  }

  .form-input:focus {
    border-color: rgba(219, 154, 159, 0.24);
    box-shadow: 0 0 0 2px rgba(219, 154, 159, 0.1);
  }

  .form-input::placeholder {
    color: rgba(240, 237, 228, 0.34);
  }

  .btn-primary,
  .btn-ghost {
    width: 100%;
    border-radius: 999px;
    font-family: var(--sc-font-body);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    padding: 13px 14px;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
  }

  .btn-primary {
    border: 1px solid rgba(219, 154, 159, 0.24);
    background: linear-gradient(180deg, rgba(250, 247, 235, 0.98), rgba(249, 246, 241, 0.96));
    color: #0f0f12;
    box-shadow: 0 10px 20px rgba(219, 154, 159, 0.12);
  }

  .btn-primary:hover {
    transform: translateY(-1px);
  }

  .btn-primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .btn-ghost {
    border: 1px solid rgba(249, 216, 194, 0.08);
    background: transparent;
    color: rgba(250, 247, 235, 0.72);
  }

  .btn-ghost:hover {
    color: var(--wm-text);
    border-color: rgba(219, 154, 159, 0.2);
  }

  .passport-link {
    display: block;
    box-sizing: border-box;
  }

  @media (max-width: 520px) {
    .modal-overlay {
      padding: 12px;
    }

    .wallet-panel {
      width: 100%;
      max-height: 92vh;
      border-radius: 22px;
    }

    .wh {
      padding: 10px 10px;
      gap: 8px;
      flex-wrap: wrap;
    }

    .whc {
      margin-left: auto;
    }

    .wb {
      padding: 16px;
      gap: 12px;
    }

    .btn-primary,
    .btn-ghost {
      font-size: 13px;
      padding: 12px 10px;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
