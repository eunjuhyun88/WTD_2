<script lang="ts">
  import { walletStore } from '$lib/stores/walletStore';
  import { addPosition } from '$lib/stores/positionStore';
  import {
    fetchGmxMarkets,
    fetchGmxBalance,
    prepareGmxOrder,
    confirmGmxOrder,
    type GmxMarket,
    type GmxBalanceInfo,
  } from '$lib/api/gmxApi';
  import { sendGmxOrder, approveUsdc } from '$lib/wallet/gmxTxSender';
  import { ensureArbitrumChain } from '$lib/wallet/chainSwitch';

  // ── Props ──────────────────────────────────────────
  export let onClose: () => void = () => {};

  // ── State ──────────────────────────────────────────
  let markets: GmxMarket[] = [];
  let selectedMarket: GmxMarket | null = null;
  let direction: 'LONG' | 'SHORT' = 'LONG';
  let collateral = '';
  let leverage = 10;
  let step: 'input' | 'loading' | 'approving' | 'signing' | 'confirming' | 'done' | 'error' = 'input';
  let errorMsg = '';
  let balance: GmxBalanceInfo | null = null;
  let resultTxHash = '';
  const collateralInputId = 'gmx-collateral-input';

  // ── Derived ────────────────────────────────────────
  $: collateralNum = parseFloat(collateral) || 0;
  $: sizeUsd = collateralNum * leverage;
  $: walletConnected = $walletStore.connected;
  $: isValid = collateralNum >= 1 && collateralNum <= 100_000 && leverage >= 1 && leverage <= 100 && selectedMarket;
  $: hasEnoughUsdc = balance ? collateralNum <= balance.usdcBalance : true;
  $: hasEnoughEth = balance ? balance.ethBalance > 0.001 : true;

  // ── Init ───────────────────────────────────────────
  async function loadMarkets() {
    try {
      markets = await fetchGmxMarkets();
      if (markets.length > 0) selectedMarket = markets[0];
    } catch {}
  }

  async function loadBalance() {
    const ws = $walletStore;
    if (!ws.connected || !ws.address) return;
    try {
      balance = await fetchGmxBalance(ws.address);
    } catch {}
  }

  // Load on mount
  if (typeof window !== 'undefined') {
    void loadMarkets();
    void loadBalance();
  }

  // ── Handlers ───────────────────────────────────────
  function setQuickCollateral(val: number) {
    collateral = String(val);
  }

  function setLeverage(val: number) {
    leverage = val;
  }

  async function handleOpenPosition() {
    if (!selectedMarket || !isValid) return;

    const ws = $walletStore;
    if (!ws.connected || !ws.address) {
      errorMsg = '지갑을 먼저 연결해주세요.';
      step = 'error';
      return;
    }

    const providerKey = (ws.provider?.toLowerCase() ?? 'metamask') as any;

    try {
      // 1. Switch to Arbitrum
      step = 'loading';
      errorMsg = '';

      const onArbitrum = await ensureArbitrumChain(providerKey);
      if (!onArbitrum) {
        errorMsg = 'Arbitrum 체인 전환이 거부되었습니다.';
        step = 'error';
        return;
      }

      // 2. Check balance
      balance = await fetchGmxBalance(ws.address);
      if (!balance || collateralNum > balance.usdcBalance) {
        errorMsg = `USDC 잔고 부족 (${balance?.usdcBalance.toFixed(2) ?? '?'} USDC)`;
        step = 'error';
        return;
      }

      if (balance.ethBalance < 0.001) {
        errorMsg = 'ETH 잔고 부족 (실행 수수료용 ETH 필요)';
        step = 'error';
        return;
      }

      // 3. Approve USDC if needed
      if (balance.needsApproval) {
        step = 'approving';
        const prepared = await prepareGmxOrder({
          market: selectedMarket.address,
          direction,
          collateralUsd: collateralNum,
          leverage,
          walletAddress: ws.address,
        });
        if (!prepared) {
          errorMsg = '주문 준비 실패';
          step = 'error';
          return;
        }

        // Send approve tx
        await approveUsdc(providerKey, ws.address, prepared.approveCalldata);
      }

      // 4. Prepare order
      step = 'loading';
      const prepared = await prepareGmxOrder({
        market: selectedMarket.address,
        direction,
        collateralUsd: collateralNum,
        leverage,
        walletAddress: ws.address,
      });

      if (!prepared) {
        errorMsg = '주문 준비 실패';
        step = 'error';
        return;
      }

      // 5. Send transaction via wallet
      step = 'signing';
      const txHash = await sendGmxOrder(providerKey, ws.address, prepared.calldata);

      // 6. Confirm to backend
      step = 'confirming';
      await confirmGmxOrder(prepared.positionId, txHash);

      resultTxHash = txHash;

      // 7. Add to position store (optimistic)
      addPosition({
        id: prepared.positionId,
        type: 'gmx',
        asset: selectedMarket.label,
        direction,
        entryPrice: 0, // Will be set after execution
        currentPrice: 0,
        pnlPercent: 0,
        pnlUsdc: null,
        amountUsdc: collateralNum,
        status: 'tx_sent',
        openedAt: Date.now(),
        meta: {
          sizeUsd,
          leverage,
          txHash,
          marketAddress: selectedMarket.address,
        },
      });

      step = 'done';
    } catch (err: any) {
      errorMsg = err?.message ?? '알 수 없는 오류';
      step = 'error';
    }
  }

  function handleClose() {
    step = 'input';
    errorMsg = '';
    collateral = '';
    onClose();
  }
</script>

<div class="gmx-overlay" on:click|self={handleClose} role="presentation">
  <div class="gmx-panel">
    <!-- Header -->
    <div class="gmx-header">
      <span class="gmx-title">OPEN PERP</span>
      <button class="gmx-close" on:click={handleClose}>✕</button>
    </div>

    {#if step === 'input'}
      <!-- Market Selector -->
      <div class="gmx-markets">
        {#each markets as m}
          <button
            class="market-btn"
            class:active={selectedMarket?.address === m.address}
            on:click={() => { selectedMarket = m; }}
          >
            {m.label}
          </button>
        {/each}
      </div>

      <!-- Direction Toggle -->
      <div class="gmx-direction">
        <button class="dir-btn long" class:active={direction === 'LONG'} on:click={() => { direction = 'LONG'; }}>
          ▲ LONG
        </button>
        <button class="dir-btn short" class:active={direction === 'SHORT'} on:click={() => { direction = 'SHORT'; }}>
          ▼ SHORT
        </button>
      </div>

      <!-- Collateral Input -->
      <div class="gmx-field">
        <label for={collateralInputId}>Collateral (USDC)</label>
        <input id={collateralInputId} type="number" bind:value={collateral} min="1" max="100000" step="1" placeholder="100" />
        <div class="quick-amounts">
          {#each [10, 25, 50, 100, 500] as v}
            <button class="qa-btn" on:click={() => setQuickCollateral(v)}>${v}</button>
          {/each}
        </div>
        {#if balance}
          <span class="balance-hint">Balance: ${balance.usdcBalance.toFixed(2)} USDC</span>
        {/if}
      </div>

      <!-- Leverage Selector -->
      <div class="gmx-field">
        <div class="field-label">Leverage: {leverage}x</div>
        <div class="leverage-btns">
          {#each [1, 2, 5, 10, 25, 50] as lev}
            <button class="lev-btn" class:active={leverage === lev} on:click={() => setLeverage(lev)}>
              {lev}x
            </button>
          {/each}
        </div>
      </div>

      <!-- Position Summary -->
      {#if collateralNum > 0}
        <div class="gmx-summary">
          <div class="sum-row">
            <span>Position Size</span>
            <span class="sum-val">${sizeUsd.toLocaleString()}</span>
          </div>
          <div class="sum-row">
            <span>Collateral</span>
            <span>${collateralNum.toLocaleString()} USDC</span>
          </div>
          <div class="sum-row">
            <span>Leverage</span>
            <span>{leverage}x</span>
          </div>
          {#if !hasEnoughUsdc}
            <div class="sum-warn">⚠ USDC 잔고 부족</div>
          {/if}
          {#if !hasEnoughEth}
            <div class="sum-warn">⚠ ETH 잔고 부족 (가스비 필요)</div>
          {/if}
        </div>
      {/if}

      <!-- Submit Button -->
      <button class="gmx-submit" disabled={!isValid || !walletConnected || !hasEnoughUsdc} on:click={handleOpenPosition}>
        {#if !walletConnected}
          Connect Wallet First
        {:else if !isValid}
          Enter Valid Amount
        {:else if !hasEnoughUsdc}
          Insufficient USDC
        {:else}
          OPEN {direction} — ${sizeUsd.toLocaleString()} {selectedMarket?.label ?? ''}
        {/if}
      </button>

    {:else if step === 'loading'}
      <div class="gmx-status">
        <div class="status-spinner"></div>
        <p>주문 준비 중...</p>
        <p class="status-sub">Preparing order</p>
      </div>

    {:else if step === 'approving'}
      <div class="gmx-status">
        <div class="status-spinner"></div>
        <p>USDC 승인을 확인해주세요</p>
        <p class="status-sub">Approve USDC in your wallet (one-time)</p>
      </div>

    {:else if step === 'signing'}
      <div class="gmx-status">
        <div class="status-spinner"></div>
        <p>지갑에서 트랜잭션을 확인하세요</p>
        <p class="status-sub">Confirm transaction in your wallet</p>
      </div>

    {:else if step === 'confirming'}
      <div class="gmx-status">
        <div class="status-spinner"></div>
        <p>트랜잭션 전송됨</p>
        <p class="status-sub">Waiting for confirmation...</p>
      </div>

    {:else if step === 'done'}
      <div class="gmx-status success">
        <span class="status-icon">✓</span>
        <p>주문 제출 완료!</p>
        <p class="status-sub">{direction} ${sizeUsd.toLocaleString()} {selectedMarket?.label ?? ''}</p>
        {#if resultTxHash}
          <a class="tx-link" href="https://arbiscan.io/tx/{resultTxHash}" target="_blank" rel="noopener">
            Arbiscan에서 보기 ↗
          </a>
        {/if}
        <button class="gmx-submit" on:click={handleClose}>닫기</button>
      </div>

    {:else if step === 'error'}
      <div class="gmx-status error">
        <span class="status-icon">✕</span>
        <p>{errorMsg}</p>
        <button class="gmx-submit" on:click={() => { step = 'input'; }}>다시 시도</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .gmx-overlay {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0,0,0,.7); backdrop-filter: blur(4px);
    display: flex; align-items: flex-end; justify-content: center;
  }
  .gmx-panel {
    width: 100%; max-width: 420px;
    background: #111; border-top: 2px solid var(--yel, #E8967D);
    border-radius: 16px 16px 0 0;
    padding: 16px; display: flex; flex-direction: column; gap: 12px;
    animation: slideUp .25s ease-out;
    max-height: 85vh; overflow-y: auto;
  }
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

  .gmx-header { display: flex; justify-content: space-between; align-items: center; }
  .gmx-title { font: 700 13px/1 var(--fm, monospace); color: var(--yel); letter-spacing: 2px; }
  .gmx-close {
    background: none; border: none; color: rgba(255,255,255,.5); font-size: 16px; cursor: pointer;
    padding: 4px 8px; border-radius: 4px;
  }
  .gmx-close:hover { background: rgba(255,255,255,.08); color: #fff; }

  .gmx-markets { display: flex; gap: 6px; }
  .market-btn {
    flex: 1; padding: 8px; border: 1px solid rgba(232,150,125,.15); border-radius: 8px;
    background: rgba(232,150,125,.04); color: rgba(232,150,125,.5);
    font: 700 12px/1 var(--fm); cursor: pointer; transition: all .15s;
  }
  .market-btn.active { background: rgba(232,150,125,.12); color: var(--yel); border-color: rgba(232,150,125,.4); }

  .gmx-direction { display: flex; gap: 8px; }
  .dir-btn {
    flex: 1; padding: 10px; border-radius: 8px;
    font: 700 12px/1 var(--fm); cursor: pointer; transition: all .15s;
  }
  .dir-btn.long { border: 1px solid rgba(0,204,136,.2); background: rgba(0,204,136,.05); color: rgba(0,204,136,.6); }
  .dir-btn.long.active { background: rgba(0,204,136,.15); color: #00CC88; border-color: rgba(0,204,136,.5); }
  .dir-btn.short { border: 1px solid rgba(255,94,122,.2); background: rgba(255,94,122,.05); color: rgba(255,94,122,.6); }
  .dir-btn.short.active { background: rgba(255,94,122,.15); color: #FF5E7A; border-color: rgba(255,94,122,.5); }

  .gmx-field { display: flex; flex-direction: column; gap: 4px; }
  .gmx-field label, .gmx-field .field-label {
    font: 400 10px/1 var(--fm);
    color: rgba(255,255,255,.4);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .gmx-field input {
    background: rgba(255,255,255,.06); border: 1px solid rgba(232,150,125,.15); border-radius: 6px;
    padding: 10px 12px; color: #fff; font: 400 14px/1 var(--fm); outline: none;
  }
  .gmx-field input:focus { border-color: var(--yel); }
  .gmx-field input::placeholder { color: rgba(255,255,255,.25); }

  .quick-amounts { display: flex; gap: 4px; margin-top: 4px; }
  .qa-btn {
    flex: 1; padding: 5px; border: 1px solid rgba(232,150,125,.12); border-radius: 4px;
    background: rgba(232,150,125,.04); color: rgba(232,150,125,.6);
    font: 400 10px/1 var(--fm); cursor: pointer; transition: all .15s;
  }
  .qa-btn:hover { background: rgba(232,150,125,.1); color: var(--yel); }

  .balance-hint { font: 400 10px/1 var(--fm); color: rgba(255,255,255,.3); margin-top: 2px; }

  .leverage-btns { display: flex; gap: 4px; }
  .lev-btn {
    flex: 1; padding: 7px 4px; border: 1px solid rgba(232,150,125,.12); border-radius: 6px;
    background: rgba(232,150,125,.04); color: rgba(232,150,125,.5);
    font: 700 11px/1 var(--fm); cursor: pointer; transition: all .15s;
  }
  .lev-btn.active { background: rgba(232,150,125,.15); color: var(--yel); border-color: rgba(232,150,125,.4); }
  .lev-btn:hover { background: rgba(232,150,125,.08); }

  .gmx-summary {
    display: flex; flex-direction: column; gap: 6px;
    padding: 8px 10px; background: rgba(255,255,255,.03); border-radius: 6px;
  }
  .sum-row { display: flex; justify-content: space-between; font: 400 11px/1 var(--fm); color: rgba(255,255,255,.5); }
  .sum-val { color: var(--yel); font-weight: 600; }
  .sum-warn { color: #FF5E7A; font: 400 10px/1 var(--fm); text-align: center; padding: 4px; }

  .gmx-submit {
    width: 100%; padding: 12px; border: none; border-radius: 8px;
    background: var(--yel); color: #000; font: 700 13px/1 var(--fm);
    cursor: pointer; text-transform: uppercase; letter-spacing: 1px;
    transition: all .15s;
  }
  .gmx-submit:hover:not(:disabled) { filter: brightness(1.1); }
  .gmx-submit:disabled { opacity: .4; cursor: not-allowed; }

  .gmx-status {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 24px 16px; text-align: center;
  }
  .gmx-status p { font: 400 13px/1.3 var(--fm); color: rgba(255,255,255,.8); margin: 0; }
  .status-sub { font-size: 11px !important; color: rgba(255,255,255,.4) !important; }
  .status-icon { font-size: 32px; }
  .gmx-status.success .status-icon { color: #00CC88; }
  .gmx-status.error .status-icon { color: #FF5E7A; }

  .status-spinner {
    width: 28px; height: 28px; border: 2px solid rgba(232,150,125,.2);
    border-top-color: var(--yel); border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .tx-link {
    font: 400 11px/1 var(--fm); color: rgba(232,150,125,.7);
    text-decoration: none; margin-top: 4px;
  }
  .tx-link:hover { color: var(--yel); text-decoration: underline; }
</style>
