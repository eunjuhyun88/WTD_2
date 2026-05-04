<script lang="ts">
  import { onMount } from 'svelte';
  import {
    walletStore,
    closeWalletModal,
    setWalletModalStep,
    applyAuthenticatedUser,
    connectWallet,
    signMessage,
    disconnectWallet,
    clearAuthenticatedUser,
  } from '$lib/stores/walletStore';
  import { systemToasts } from '$lib/stores/notificationStore';
  import { loginAuth, logoutAuth, requestWalletNonce, walletAuth } from '$lib/api/auth';
  import {
    WALLET_PROVIDER_LABEL,
    getPreferredEvmChainCode,
    isWalletConnectConfigured,
    requestInjectedEvmAccount,
    signInjectedEvmMessage,
    type WalletProviderKey,
  } from '$lib/wallet/providers';
  import { detectInjectedWallets, RDNS_TO_PROVIDER, type DetectedWallet } from '$lib/wallet/eip6963';
  import { isPrivyConfigured, privySendCode, privyLoginWithCode } from '$lib/wallet/privyClient';

  const WALLET_SIGNATURE_RE = /^0x[0-9a-f]{130}$/i;
  const privyReady = isPrivyConfigured();
  const preferredEvmChain = getPreferredEvmChainCode();
  const walletConnectReady = isWalletConnectConfigured();

  $: state = $walletStore;
  $: step = state.walletModalStep;

  // EIP-6963 detected wallets
  let detectedWallets: DetectedWallet[] = [];

  // local state
  let connectingProvider = '';
  let signingMessage = false;
  let actionError = '';
  let signedWalletMessage = '';
  let signedWalletSignature = '';
  let trackedModalOpen = false;
  let panelEl: HTMLDivElement | null = null;

  // Privy email flow
  let privyStep: 'hidden' | 'email' | 'otp' = 'hidden';
  let privyEmail = '';
  let privyCode = '';
  let privySending = false;
  let privyVerifying = false;

  // ── GTM ───────────────────────────────────────────────────────
  interface GTMWindow extends Window { dataLayer?: Array<Record<string, unknown>>; }
  function gtmEvent(event: string, payload: Record<string, unknown> = {}) {
    if (typeof window === 'undefined') return;
    const w = window as GTMWindow;
    if (!Array.isArray(w.dataLayer)) return;
    w.dataLayer.push({ event, area: 'wallet_modal', ...payload });
  }

  // ── Helpers ───────────────────────────────────────────────────
  function isWalletProviderKey(v: string): v is WalletProviderKey {
    return v === 'metamask' || v === 'coinbase' || v === 'walletconnect' || v === 'phantom' || v === 'base';
  }

  function isEvmAddress(address: string) { return address.startsWith('0x'); }

  function clearErrors() { actionError = ''; }
  function clearWalletProof() { signedWalletMessage = ''; signedWalletSignature = ''; }
  function hasWalletProof() {
    return Boolean(signedWalletMessage && WALLET_SIGNATURE_RE.test(signedWalletSignature));
  }

  // deduplicate EIP-6963 list vs static — hide static entry if EIP-6963 already has it
  function isStaticHidden(providerKey: WalletProviderKey): boolean {
    return detectedWallets.some(w => RDNS_TO_PROVIDER[w.rdns] === providerKey);
  }

  // ── EIP-6963 mount ────────────────────────────────────────────
  onMount(async () => {
    detectedWallets = await detectInjectedWallets(300);
    gtmEvent('eip6963_detected', {
      count: detectedWallets.length,
      rdns_list: detectedWallets.map(w => w.rdns),
    });
  });

  // ── focus trap ────────────────────────────────────────────────
  function trapFocus(e: KeyboardEvent) {
    if (!panelEl) return;
    const focusable = Array.from(
      panelEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  }

  $: if (state.showWalletModal && panelEl) {
    setTimeout(() => {
      const first = panelEl?.querySelector<HTMLElement>('button:not([disabled])');
      first?.focus();
    }, 50);
  }

  // ── GTM modal open ────────────────────────────────────────────
  $: if (state.showWalletModal && !trackedModalOpen) {
    gtmEvent('wallet_modal_open', { entry_step: step });
    trackedModalOpen = true;
  }
  $: if (!state.showWalletModal) {
    signingMessage = false;
    connectingProvider = '';
    trackedModalOpen = false;
    privyStep = 'hidden';
    privyEmail = '';
    privyCode = '';
  }

  // ── Connect ───────────────────────────────────────────────────
  async function handleConnect(provider: string, eip6963Provider?: EIP1193Provider) {
    clearErrors();
    clearWalletProof();

    // EIP-6963 path
    if (eip6963Provider) {
      connectingProvider = provider;
      setWalletModalStep('connecting');
      try {
        const accounts = await (eip6963Provider as any).request({ method: 'eth_requestAccounts' }) as string[];
        const walletAddress = accounts[0];
        if (!walletAddress) throw new Error('No account returned');
        // switch to Base
        try {
          await (eip6963Provider as any).request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x2105' }], // Base = 8453
          });
        } catch { /* ignore chain switch failure */ }
        connectWallet('metamask', walletAddress, preferredEvmChain);
        gtmEvent('wallet_connected', { method: 'eip6963', rdns: provider });
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        actionError = msg.toLowerCase().includes('reject') || (error as any)?.code === 4001
          ? 'Connection cancelled.'
          : msg || 'Failed to connect wallet.';
        gtmEvent('wallet_connect_failed', { method: 'eip6963', rdns: provider });
        setWalletModalStep('wallet-select');
      } finally {
        connectingProvider = '';
      }
      return;
    }

    // Static provider path
    if (!isWalletProviderKey(provider)) { actionError = 'Unsupported wallet provider.'; return; }

    connectingProvider = WALLET_PROVIDER_LABEL[provider];
    setWalletModalStep('connecting');
    try {
      const walletAddress = await requestInjectedEvmAccount(provider as WalletProviderKey);
      if (provider !== 'walletconnect') {
        const { ensureBaseChain } = await import('$lib/wallet/chainSwitch');
        await ensureBaseChain(provider as WalletProviderKey);
      }
      connectWallet(provider as WalletProviderKey, walletAddress, preferredEvmChain);
      gtmEvent('wallet_connected', { method: provider });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('denied') || (error as any)?.code === 4001) {
        actionError = 'Connection cancelled.';
      } else if (msg.toLowerCase().includes('not detected') || msg.toLowerCase().includes('install')) {
        actionError = msg;
      } else {
        actionError = msg || 'Failed to connect wallet. Check extension and try again.';
      }
      gtmEvent('wallet_connect_failed', { method: provider, error_code: actionError });
      setWalletModalStep('wallet-select');
    } finally {
      connectingProvider = '';
    }
  }

  // ── Sign & Auth ───────────────────────────────────────────────
  async function handleSignMessage() {
    signingMessage = true;
    actionError = '';

    try {
      if (!state.address) throw new Error('Wallet address is missing');
      if (!state.provider || !isWalletProviderKey(state.provider)) throw new Error('Wallet provider is missing');
      if (!isEvmAddress(state.address)) throw new Error('Solana wallet auth is temporarily unavailable. Use an EVM wallet.');

      const provider = state.provider;
      const noncePayload = await requestWalletNonce({ address: state.address, provider, chain: state.chain });
      const signature = await signInjectedEvmMessage(provider, noncePayload.message, state.address);

      signedWalletMessage = noncePayload.message;
      signedWalletSignature = signature;
      signMessage(signature);
      gtmEvent('auth_sign_success', { method: provider });

      // wallet-first auto login/register
      try {
        const { getAuthTurnstileToken } = await import('$lib/wallet/turnstileAuth');
        const turnstileToken = await getAuthTurnstileToken().catch(() => '');
        const authResult = await walletAuth({
          walletAddress: state.address!,
          walletMessage: noncePayload.message,
          walletSignature: signature,
          turnstileToken: turnstileToken || undefined,
        });
        if (authResult.user) {
          applyAuthenticatedUser(authResult.user);
          const isNew = authResult.action === 'register';
          const nickname = authResult.user.nickname ?? `Trader_${state.address!.slice(-6).toUpperCase()}`;
          gtmEvent('auth_success', { method: provider, is_new_user: isNew });
          closeWalletModal();
          systemToasts.add({
            type: 'success',
            message: `Connected as ${nickname}`,
            action: { label: 'Settings →', href: '/settings' },
          });
        } else {
          // Server returned a response but no user — show retryable error, keep modal open
          actionError = 'Authentication failed — no session was created. Please try signing again.';
          gtmEvent('auth_failure', { method: provider, stage: 'wallet_auth', reason_code: 'no_user', retryable: true });
        }
      } catch (authErr) {
        // Server-side auth failure — keep modal open so user can retry
        const errMsg = authErr instanceof Error ? authErr.message : '';
        actionError = classifyWalletAuthError(errMsg);
        gtmEvent('auth_failure', {
          method: provider,
          stage: 'wallet_auth',
          reason_code: classifyWalletAuthReason(errMsg),
          retryable: true,
        });
      }
    } catch (error) {
      clearWalletProof();
      const msg = error instanceof Error ? error.message : 'Failed to sign wallet message';
      const isRejected = msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('denied') || (error as any)?.code === 4001;
      actionError = isRejected ? 'Signature cancelled. Click "Sign Message" to try again.' : msg;
      gtmEvent('auth_sign_failed', { error_code: isRejected ? 'rejected' : 'unknown' });
      // keep modal open for retry — do NOT close
    } finally {
      signingMessage = false;
    }
  }

  // ── Auth error classification (Fix 4 / Fix 5) ───────────────
  function classifyWalletAuthReason(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes('cancel') || m.includes('reject') || m.includes('denied')) return 'user_cancelled';
    if (m.includes('nonce') || m.includes('expired') || m.includes('invalid nonce')) return 'nonce_expired';
    if (m.includes('rate limit') || m.includes('too many') || m.includes('429')) return 'rate_limited';
    if (m.includes('provider') || m.includes('extension') || m.includes('wallet')) return 'provider_error';
    if (m.includes('server') || m.includes('500') || m.includes('503')) return 'server_error';
    return 'unknown';
  }

  function classifyWalletAuthError(msg: string): string {
    const reason = classifyWalletAuthReason(msg);
    switch (reason) {
      case 'user_cancelled':
        return 'Signature cancelled. Click "Sign Message" to try again.';
      case 'nonce_expired':
        return 'Challenge expired. Click "Sign Message" to request a new one.';
      case 'rate_limited':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'provider_error':
        return 'Wallet provider error. Check your extension and try again.';
      case 'server_error':
        return 'Server error. Please try again in a moment.';
      default:
        return msg || 'Authentication failed. Please try signing again.';
    }
  }

  // ── Privy Email ───────────────────────────────────────────────
  async function handlePrivySendCode() {
    privySending = true;
    actionError = '';
    try {
      await privySendCode(privyEmail.trim());
      privyStep = 'otp';
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Failed to send code.';
    } finally {
      privySending = false;
    }
  }

  async function handlePrivyVerify() {
    privyVerifying = true;
    actionError = '';
    try {
      const { address, accessToken } = await privyLoginWithCode(privyEmail.trim(), privyCode.trim());
      const res = await fetch('/api/auth/privy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Authentication failed');
      if (data.user) {
        applyAuthenticatedUser(data.user);
        const nickname = data.user.nickname ?? `Trader_${(address || '').slice(-6).toUpperCase()}`;
        gtmEvent('auth_success', { method: 'privy_email', is_new_user: false });
        closeWalletModal();
        systemToasts.add({
          type: 'success',
          message: `Connected as ${nickname}`,
          action: { label: 'Settings →', href: '/settings' },
        });
      }
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Verification failed.';
      privyCode = '';
    } finally {
      privyVerifying = false;
    }
  }

  function resetPrivy() {
    privyStep = 'hidden';
    privyEmail = '';
    privyCode = '';
    actionError = '';
  }

  // ── Disconnect ────────────────────────────────────────────────
  async function handleDisconnect() {
    try { await logoutAuth(); } catch { /* ignore */ }
    clearWalletProof();
    disconnectWallet();
    clearAuthenticatedUser();
    gtmEvent('wallet_disconnected');
    closeWalletModal();
  }

  // ── Close ─────────────────────────────────────────────────────
  function handleClose() {
    if (step !== 'wallet-select') {
      gtmEvent('modal_dismiss', { stage: step, reason: 'x_button' });
    }
    closeWalletModal();
  }

  function handleOverlayClick() {
    gtmEvent('modal_dismiss', { stage: step, reason: 'overlay' });
    closeWalletModal();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      gtmEvent('modal_dismiss', { stage: step, reason: 'esc' });
      closeWalletModal();
    }
    trapFocus(e);
  }

  // ── EIP1193Provider type for eip6963 ─────────────────────────
  type EIP1193Provider = import('$lib/wallet/eip6963').EIP1193Provider;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if state.showWalletModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Connect Wallet" tabindex="-1" onclick={handleOverlayClick} onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="wallet-panel" role="document" bind:this={panelEl} onclick={(e) => e.stopPropagation()}>

      <!-- Header -->
      <div class="wh">
        <div class="wh-left">
          <span class="wh-tag">//WALLET AUTH</span>
          <span class="wht">
            {step === 'connecting' ? 'CONNECTING' : step === 'sign-message' ? 'VERIFY OWNERSHIP' : privyStep === 'otp' ? 'VERIFY EMAIL' : 'CONNECT WALLET'}
          </span>
        </div>
        <button class="whc" type="button" aria-label="Close" onclick={handleClose}>✕</button>
      </div>

      <!-- Progress -->
      <div class="progress-row" aria-hidden="true">
        <div class="pstep" class:active={step === 'wallet-select' || step === 'connecting'} class:done={state.connected}>1 CONNECT</div>
        <div class="pstep" class:active={step === 'sign-message'} class:done={hasWalletProof()}>2 SIGN</div>
      </div>

      <!-- Error banner -->
      {#if actionError}
        <div class="global-error" role="alert">{actionError}</div>
      {/if}

      <!-- ── Step: wallet-select ── -->
      {#if step === 'wallet-select'}
        <div class="wb">

          {#if privyStep === 'email'}
            <!-- Privy: email input -->
            <div class="step-hero">
              <span class="hero-kicker">EMAIL LOGIN</span>
              <h3 class="hero-title">Enter your email</h3>
              <p class="hero-sub">We'll send a one-time code to verify it's you.</p>
            </div>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="privy-input"
              type="email"
              placeholder="you@example.com"
              bind:value={privyEmail}
              autofocus
              onkeydown={(e) => e.key === 'Enter' && privyEmail.trim() && handlePrivySendCode()}
            />
            <button class="btn-primary" type="button" onclick={handlePrivySendCode} disabled={privySending || !privyEmail.trim()}>
              {privySending ? 'SENDING...' : 'SEND CODE'}
            </button>
            <button class="btn-ghost" type="button" onclick={resetPrivy}>BACK</button>

          {:else if privyStep === 'otp'}
            <!-- Privy: OTP input -->
            <div class="step-hero">
              <span class="hero-kicker">EMAIL LOGIN</span>
              <h3 class="hero-title">Check your inbox</h3>
              <p class="hero-sub">Enter the 6-digit code sent to <strong>{privyEmail}</strong>.</p>
            </div>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="privy-input privy-otp"
              type="text"
              inputmode="numeric"
              placeholder="000000"
              maxlength="6"
              bind:value={privyCode}
              autofocus
              onkeydown={(e) => e.key === 'Enter' && privyCode.trim().length >= 6 && handlePrivyVerify()}
            />
            <button class="btn-primary" type="button" onclick={handlePrivyVerify} disabled={privyVerifying || privyCode.trim().length < 6}>
              {privyVerifying ? 'VERIFYING...' : 'VERIFY'}
            </button>
            <button class="btn-ghost" type="button" onclick={() => { privyStep = 'email'; privyCode = ''; actionError = ''; }}>RESEND CODE</button>

          {:else}
            <!-- Wallet list -->
            <div class="step-hero">
              <span class="hero-kicker">STEP 1</span>
              <h3 class="hero-title">Connect your wallet</h3>
              <p class="hero-sub">Sign in instantly — no email required.</p>
            </div>

            <div class="wallet-list">

              <!-- Base Smart Wallet — passkey-first, always top -->
              <button class="wopt wopt-featured" type="button" onclick={() => handleConnect('base')}>
                <span class="wo-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect width="20" height="20" rx="6" fill="#0052FF"/>
                    <path d="M10 4.5a5.5 5.5 0 1 1 0 11A5.5 5.5 0 0 1 10 4.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" fill="white" fill-rule="evenodd" clip-rule="evenodd"/>
                  </svg>
                </span>
                <span class="wo-name">Base Smart Wallet</span>
                <span class="wo-badge">PASSKEY</span>
              </button>

              <!-- EIP-6963 detected wallets -->
              {#each detectedWallets as wallet (wallet.rdns)}
                <button class="wopt" type="button" onclick={() => handleConnect(wallet.rdns, wallet.provider)}>
                  {#if wallet.icon}
                    <img class="wo-img" src={wallet.icon} alt={wallet.name} width="20" height="20" />
                  {:else}
                    <span class="wo-icon">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect width="20" height="20" rx="6" fill="rgba(255,255,255,0.1)"/>
                        <circle cx="10" cy="10" r="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
                      </svg>
                    </span>
                  {/if}
                  <span class="wo-name">{wallet.name}</span>
                  <span class="wo-chain wo-detected">DETECTED</span>
                </button>
              {/each}

              <!-- Static: MetaMask -->
              {#if !isStaticHidden('metamask')}
                <button class="wopt" type="button" onclick={() => handleConnect('metamask')}>
                  <span class="wo-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect width="20" height="20" rx="6" fill="#F6851B"/>
                      <path d="M14.5 5L10.9 7.9l.65-1.54L14.5 5Z" fill="#E17726"/>
                      <path d="M5.5 5l3.56 2.93-.62-1.56L5.5 5Z" fill="#E27625"/>
                      <path d="M13.2 13.2l-.96 1.47 2.06.57.59-2L13.2 13.2ZM5.1 13.24l.58 2 2.06-.57-.96-1.47-1.68.04Z" fill="#E27625"/>
                      <path d="M7.6 9.97l-.56 1.56 2 .09-.07-2.16-1.37.51Z" fill="#E27625"/>
                      <path d="M12.4 9.97l-1.38-.53-.07 2.18 2-.09-.55-1.56Z" fill="#E27625"/>
                      <path d="M7.74 14.67l1.22-.57-.5-.45-1.22.57.5.45Z" fill="#D5BFB2"/>
                      <path d="M11.04 14.1l1.22.57.5-.45-1.22-.57-.5.45Z" fill="#D5BFB2"/>
                    </svg>
                  </span>
                  <span class="wo-name">MetaMask</span>
                  <span class="wo-chain">EVM</span>
                </button>
              {/if}

              <!-- Static: Coinbase Wallet -->
              {#if !isStaticHidden('coinbase')}
                <button class="wopt" type="button" onclick={() => handleConnect('coinbase')}>
                  <span class="wo-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect width="20" height="20" rx="6" fill="#1652F0"/>
                      <rect x="7.5" y="7.5" width="5" height="5" rx="1" fill="white"/>
                    </svg>
                  </span>
                  <span class="wo-name">Coinbase Wallet</span>
                  <span class="wo-chain">EVM</span>
                </button>
              {/if}

              <!-- Static: Phantom -->
              {#if !isStaticHidden('phantom')}
                <button class="wopt" type="button" onclick={() => handleConnect('phantom')}>
                  <span class="wo-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect width="20" height="20" rx="6" fill="#AB9FF2"/>
                      <path d="M10 5a4 4 0 0 1 4 4c0 1.5-.4 3.1-1.2 4.2-.6.8-1.2 1.4-1.8 1.4-.5 0-.8-.3-1-.7-.2.4-.5.7-1 .7-.6 0-1.2-.6-1.8-1.4C6.4 12.1 6 10.5 6 9a4 4 0 0 1 4-4Z" fill="white"/>
                      <circle cx="8.5" cy="9" r="1" fill="#AB9FF2"/>
                      <circle cx="11.5" cy="9" r="1" fill="#AB9FF2"/>
                    </svg>
                  </span>
                  <span class="wo-name">Phantom</span>
                  <span class="wo-chain">EVM</span>
                </button>
              {/if}

              <!-- WalletConnect -->
              {#if walletConnectReady}
                <button class="wopt" type="button" onclick={() => handleConnect('walletconnect')}>
                  <span class="wo-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect width="20" height="20" rx="6" fill="#3B99FC"/>
                      <path d="M6.8 8.6a4.6 4.6 0 0 1 6.4 0l.2.2-.8.8-.2-.2a3.4 3.4 0 0 0-4.8 0l-.2.2-.8-.8.2-.2Z" fill="white"/>
                      <path d="M14 9.8l.8.8-4.8 4.8L5.2 10.6l.8-.8 4 4 4-4Z" fill="white"/>
                    </svg>
                  </span>
                  <span class="wo-name">WalletConnect</span>
                  <span class="wo-chain">QR</span>
                </button>
              {/if}

            </div>

            <!-- Privy email login divider -->
            {#if privyReady}
              <div class="privy-divider"><span>or</span></div>
              <button class="wopt wopt-email" type="button" onclick={() => { privyStep = 'email'; actionError = ''; }}>
                <span class="wo-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect width="20" height="20" rx="6" fill="rgba(255,255,255,0.08)"/>
                    <path d="M5 7.5A1.5 1.5 0 0 1 6.5 6h7A1.5 1.5 0 0 1 15 7.5v5A1.5 1.5 0 0 1 13.5 14h-7A1.5 1.5 0 0 1 5 12.5v-5Z" stroke="rgba(250,247,235,0.5)" stroke-width="1"/>
                    <path d="M5.5 7.5l4.5 3 4.5-3" stroke="rgba(250,247,235,0.5)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
                <span class="wo-name">Continue with Email</span>
              </button>
            {/if}

          {/if}
        </div>

      <!-- ── Step: connecting ── -->
      {:else if step === 'connecting'}
        <div class="wb">
          <div class="connecting-anim">
            <div class="conn-spinner"></div>
            <div class="conn-text">Connecting {connectingProvider || 'wallet'}...</div>
            <div class="conn-sub">Approve the connection request in your wallet</div>
          </div>
        </div>

      <!-- ── Step: sign-message ── -->
      {:else if step === 'sign-message'}
        <div class="wb">
          <div class="step-hero">
            <span class="hero-kicker">STEP 2</span>
            <h3 class="hero-title">Sign to verify ownership</h3>
            <p class="hero-sub">Free signature — proves you own this wallet. No transaction is sent.</p>
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
          </div>

          <button class="btn-primary" type="button" onclick={handleSignMessage} disabled={signingMessage}>
            {signingMessage ? 'SIGNING...' : 'SIGN MESSAGE'}
          </button>
          <button class="btn-ghost" type="button" onclick={() => { clearErrors(); setWalletModalStep('wallet-select'); }}>
            USE DIFFERENT WALLET
          </button>
        </div>

      {/if}

      <!-- Disconnect link (if already connected) -->
      {#if state.connected && step !== 'connecting'}
        <div class="disconnect-row">
          <button class="disconnect-link" type="button" onclick={handleDisconnect}>Disconnect wallet</button>
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
    --wm-border: rgba(249, 216, 194, 0.12);
    --wm-accent: #db9a9f;
    --wm-text: #faf7eb;
    --wm-muted: rgba(250, 247, 235, 0.62);
    --wm-kicker: rgba(219, 154, 159, 0.88);
    width: min(480px, 100%);
    max-height: min(88vh, 760px);
    border: 1px solid var(--wm-border);
    border-radius: 24px;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(18, 18, 20, 0.96), rgba(10, 10, 12, 0.94)),
      radial-gradient(circle at top right, rgba(249, 216, 194, 0.06), transparent 36%);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32);
    display: flex;
    flex-direction: column;
    outline: none;
  }

  /* ── Header ── */
  .wh {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 18px;
    border-bottom: 1px solid rgba(249, 216, 194, 0.08);
  }

  .wh-left {
    flex: 1;
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
    font-size: 17px;
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
    font-size: 13px;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .whc:hover { background: rgba(255, 255, 255, 0.08); }

  /* ── Progress ── */
  .progress-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(249, 216, 194, 0.08);
  }

  .pstep {
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: 999px;
    text-align: center;
    padding: 6px 10px;
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.12em;
    color: rgba(250, 247, 235, 0.38);
    transition: all 0.2s;
  }

  .pstep.active {
    color: var(--wm-text);
    border-color: rgba(219, 154, 159, 0.2);
    background: rgba(255, 255, 255, 0.06);
  }

  .pstep.done {
    color: var(--wm-text);
    border-color: rgba(219, 154, 159, 0.16);
    background: rgba(219, 154, 159, 0.1);
  }

  /* ── Errors ── */
  .global-error {
    margin: 10px 16px 0;
    padding: 10px 12px;
    border: 1px solid rgba(255, 89, 89, 0.4);
    border-radius: 12px;
    background: rgba(255, 89, 89, 0.07);
    color: #ff9b9b;
    font-family: var(--sc-font-body);
    font-size: 13px;
    line-height: 1.5;
  }

  /* ── Body ── */
  .wb {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .step-hero {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .hero-kicker {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    letter-spacing: 0.16em;
    color: var(--wm-kicker);
  }

  .hero-title {
    font-family: var(--sc-font-body);
    font-size: clamp(1.35rem, 2vw, 1.75rem);
    letter-spacing: -0.04em;
    color: var(--wm-text);
    line-height: 1.1;
    margin: 0;
  }

  .hero-sub {
    font-family: var(--sc-font-body);
    font-size: 0.93rem;
    color: var(--wm-muted);
    line-height: 1.6;
    margin: 0;
  }

  /* ── Wallet list ── */
  .wallet-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .wopt {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--wm-text);
    padding: 13px 14px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }

  .wopt:hover {
    border-color: rgba(219, 154, 159, 0.2);
    background: rgba(255, 255, 255, 0.06);
  }

  .wopt-featured {
    border-color: rgba(0, 82, 255, 0.3);
    background: rgba(0, 82, 255, 0.06);
  }

  .wopt-featured:hover {
    border-color: rgba(0, 82, 255, 0.5);
    background: rgba(0, 82, 255, 0.1);
  }

  .wo-icon {
    flex-shrink: 0;
    line-height: 0;
    border-radius: 6px;
    overflow: hidden;
  }

  .wo-img {
    flex-shrink: 0;
    border-radius: 6px;
    display: block;
  }

  .wo-name {
    font-family: var(--sc-font-body);
    font-size: 14px;
    font-weight: 600;
    flex: 1;
  }

  .wo-chain {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.12em;
    border: 1px solid rgba(249, 216, 194, 0.1);
    border-radius: 999px;
    padding: 3px 7px;
    color: var(--wm-kicker);
    flex-shrink: 0;
  }

  .wo-badge {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.1em;
    border-radius: 999px;
    padding: 3px 8px;
    color: #60a5fa;
    background: rgba(0, 82, 255, 0.14);
    border: 1px solid rgba(0, 82, 255, 0.25);
    flex-shrink: 0;
  }

  .wo-detected {
    color: #4ade80;
    border-color: rgba(52, 196, 112, 0.25);
  }

  /* ── Connecting spinner ── */
  .connecting-anim {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 32px 0;
  }

  .conn-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(219, 154, 159, 0.2);
    border-top-color: var(--wm-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .conn-text {
    font-family: var(--sc-font-body);
    font-size: 15px;
    font-weight: 600;
    color: var(--wm-text);
  }

  .conn-sub {
    font-family: var(--sc-font-body);
    font-size: 13px;
    color: var(--wm-muted);
    text-align: center;
  }

  /* ── Info box ── */
  .info-box {
    border: 1px solid rgba(249, 216, 194, 0.08);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
    padding: 12px 14px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid rgba(249, 216, 194, 0.06);
  }

  .info-row:last-child { border-bottom: none; }

  .info-k {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.12em;
    color: rgba(250, 247, 235, 0.48);
  }

  .info-v {
    font-family: var(--sc-font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--wm-text);
    word-break: break-word;
    text-align: right;
  }

  /* ── Buttons ── */
  .btn-primary,
  .btn-ghost {
    width: 100%;
    border-radius: 999px;
    font-family: var(--sc-font-body);
    font-size: 14px;
    font-weight: 600;
    padding: 13px 14px;
    cursor: pointer;
    text-align: center;
    transition: transform 0.12s, opacity 0.12s;
  }

  .btn-primary {
    border: 1px solid rgba(219, 154, 159, 0.24);
    background: linear-gradient(180deg, rgba(250, 247, 235, 0.98), rgba(249, 246, 241, 0.96));
    color: #0f0f12;
    box-shadow: 0 8px 20px rgba(219, 154, 159, 0.12);
  }

  .btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn-ghost {
    border: 1px solid rgba(249, 216, 194, 0.08);
    background: transparent;
    color: rgba(250, 247, 235, 0.68);
  }

  .btn-ghost:hover { color: var(--wm-text); border-color: rgba(219, 154, 159, 0.2); }

  /* ── Disconnect ── */
  .disconnect-row {
    padding: 12px 20px;
    border-top: 1px solid rgba(249, 216, 194, 0.06);
    text-align: center;
  }

  .disconnect-link {
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--sc-font-body);
    font-size: 12px;
    color: rgba(250, 247, 235, 0.38);
    transition: color 0.15s;
  }

  .disconnect-link:hover { color: #ff9b9b; }

  /* ── Mobile ── */
  @media (max-width: 520px) {
    .modal-overlay { padding: 8px; }
    .wallet-panel { width: 100%; max-height: 92vh; border-radius: 20px; }
    .wh { padding: 12px 14px; }
    .wb { padding: 14px; gap: 10px; }
    .btn-primary, .btn-ghost { font-size: 13px; padding: 12px; }
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Privy ── */
  .privy-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    color: rgba(250, 247, 235, 0.28);
    font-family: var(--sc-font-body);
    font-size: 11px;
    letter-spacing: 0.08em;
  }

  .privy-divider::before,
  .privy-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(249, 216, 194, 0.08);
  }

  .wopt-email {
    border-color: rgba(249, 216, 194, 0.06);
    color: rgba(250, 247, 235, 0.7);
  }

  .wopt-email .wo-name {
    font-weight: 500;
    color: rgba(250, 247, 235, 0.7);
  }

  .privy-input {
    width: 100%;
    padding: 13px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(249, 216, 194, 0.12);
    border-radius: 14px;
    color: var(--wm-text);
    font-family: var(--sc-font-body);
    font-size: 15px;
    outline: none;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }

  .privy-input:focus {
    border-color: rgba(219, 154, 159, 0.4);
  }

  .privy-input::placeholder {
    color: rgba(250, 247, 235, 0.28);
  }

  .privy-otp {
    font-size: 22px;
    letter-spacing: 0.3em;
    text-align: center;
  }
</style>
