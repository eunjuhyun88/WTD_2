<script lang="ts">
  import { walletStore } from '$lib/stores/walletStore';
  import { addPosition } from '$lib/stores/positionStore';
  import {
    preparePolymarketOrder,
    submitPolymarketOrder,
    getPolymarketAuthData,
    submitPolymarketAuth,
  } from '$lib/api/positionsApi';
  import { signTypedData } from '$lib/wallet/eip712Signing';
  import { ensurePolygonChain } from '$lib/wallet/chainSwitch';

  // ── Props ──────────────────────────────────────────
  export let market: {
    id: string;
    question: string;
    slug: string;
    outcomes: string[];
    outcomePrices: string[];
    volume: number;
    liquidity: number;
  } | null = null;

  export let onClose: () => void = () => {};

  // ── State ──────────────────────────────────────────
  let direction: 'YES' | 'NO' = 'YES';
  let amount = '';
  let customPrice = '';
  let step: 'input' | 'signing' | 'submitting' | 'done' | 'error' = 'input';
  let errorMsg = '';
  let resultOrderId = '';
  const amountInputId = 'poly-amount-input';
  const priceInputId = 'poly-price-input';

  // ── Derived ────────────────────────────────────────
  $: yesPrice = market?.outcomePrices?.[0] ? parseFloat(market.outcomePrices[0]) : 0.5;
  $: noPrice = market?.outcomePrices?.[1] ? parseFloat(market.outcomePrices[1]) : 0.5;
  $: selectedPrice = direction === 'YES' ? yesPrice : noPrice;
  $: effectivePrice = customPrice ? parseFloat(customPrice) : selectedPrice;
  $: amountNum = parseFloat(amount) || 0;
  $: estimatedShares = effectivePrice > 0 ? amountNum / effectivePrice : 0;
  $: estimatedPayout = estimatedShares; // Each share pays $1 if outcome is correct
  $: estimatedProfit = estimatedPayout - amountNum;
  $: isValid = amountNum >= 1 && amountNum <= 10000 && effectivePrice > 0 && effectivePrice < 1;
  $: walletConnected = $walletStore.connected;

  // ── Handlers ───────────────────────────────────────
  function toggleDirection() {
    direction = direction === 'YES' ? 'NO' : 'YES';
    customPrice = '';
  }

  function setQuickAmount(val: number) {
    amount = String(val);
  }

  async function handlePlaceBet() {
    if (!market || !isValid) return;

    const ws = $walletStore;
    if (!ws.connected || !ws.address) {
      errorMsg = '지갑을 먼저 연결해주세요.';
      step = 'error';
      return;
    }

    const providerKey = (ws.provider?.toLowerCase() ?? 'metamask') as any;

    try {
      // 1. Switch to Polygon
      step = 'signing';
      errorMsg = '';

      const onPolygon = await ensurePolygonChain(providerKey);
      if (!onPolygon) {
        errorMsg = 'Polygon 체인 전환이 거부되었습니다.';
        step = 'error';
        return;
      }

      // 2. Prepare order via our API
      const prepared = await preparePolymarketOrder({
        marketId: market.id,
        direction,
        price: effectivePrice,
        amount: amountNum,
        walletAddress: ws.address,
      });

      if (!prepared) {
        errorMsg = '주문 준비 실패. 마켓이 비활성일 수 있습니다.';
        step = 'error';
        return;
      }

      // 3. Sign the order with wallet
      const signature = await signTypedData(
        providerKey,
        ws.address,
        prepared.typedData,
      );

      // 4. Submit signed order
      step = 'submitting';
      const result = await submitPolymarketOrder({
        positionId: prepared.positionId,
        signature,
      });

      if (!result?.ok) {
        // Check if auth is needed
        if ((result as any)?.code === 'POLY_AUTH_REQUIRED') {
          // Do Polymarket auth flow
          const authOk = await doPolymarketAuth(providerKey, ws.address);
          if (!authOk) {
            errorMsg = 'Polymarket 인증 실패.';
            step = 'error';
            return;
          }
          // Retry submit
          const retryResult = await submitPolymarketOrder({
            positionId: prepared.positionId,
            signature,
          });
          if (!retryResult?.ok) {
            errorMsg = '주문 제출 실패.';
            step = 'error';
            return;
          }
          resultOrderId = retryResult.clobOrderId;
        } else {
          errorMsg = '주문 제출 실패.';
          step = 'error';
          return;
        }
      } else {
        resultOrderId = result.clobOrderId;
      }

      // 5. Add to position store (optimistic)
      addPosition({
        id: prepared.positionId,
        type: 'polymarket',
        asset: market.question,
        direction,
        entryPrice: effectivePrice,
        currentPrice: effectivePrice,
        pnlPercent: 0,
        pnlUsdc: 0,
        amountUsdc: amountNum,
        status: 'submitted',
        openedAt: Date.now(),
        meta: { marketSlug: market.slug, clobOrderId: resultOrderId },
      });

      step = 'done';
    } catch (err: any) {
      errorMsg = err?.message ?? '알 수 없는 오류';
      step = 'error';
    }
  }

  async function doPolymarketAuth(providerKey: any, address: string): Promise<boolean> {
    try {
      // Get auth typed data
      const authData = await getPolymarketAuthData(address);
      if (!authData?.typedData || !authData.timestamp) return false;

      // Sign auth message
      const authSig = await signTypedData(providerKey, address, authData.typedData);

      // Submit to derive L2 creds
      const result = await submitPolymarketAuth({
        walletAddress: address,
        signature: authSig,
        timestamp: authData.timestamp,
        nonce: authData.nonce ?? 0,
      });

      return !!result?.authenticated;
    } catch {
      return false;
    }
  }

  function handleClose() {
    step = 'input';
    errorMsg = '';
    amount = '';
    customPrice = '';
    onClose();
  }
</script>

{#if market}
<div class="bet-overlay" on:click|self={handleClose} role="presentation">
  <div class="bet-panel">
    <!-- Header -->
    <div class="bet-header">
      <span class="bet-title">PLACE BET</span>
      <button class="bet-close" on:click={handleClose}>✕</button>
    </div>

    <!-- Market Question -->
    <div class="bet-question">{market.question}</div>

    <!-- Current Odds -->
    <div class="bet-odds">
      <span class="odds-yes" class:active={direction === 'YES'}>YES {(yesPrice * 100).toFixed(0)}¢</span>
      <span class="odds-no" class:active={direction === 'NO'}>NO {(noPrice * 100).toFixed(0)}¢</span>
    </div>

    {#if step === 'input'}
      <!-- Direction Toggle -->
      <div class="bet-direction">
        <button class="dir-btn" class:active={direction === 'YES'} on:click={() => { direction = 'YES'; customPrice = ''; }}>
          ↑ YES
        </button>
        <button class="dir-btn no" class:active={direction === 'NO'} on:click={() => { direction = 'NO'; customPrice = ''; }}>
          ↓ NO
        </button>
      </div>

      <!-- Amount Input -->
      <div class="bet-field">
        <label for={amountInputId}>Amount (USDC)</label>
        <input id={amountInputId} type="number" bind:value={amount} min="1" max="10000" step="1" placeholder="10" />
        <div class="quick-amounts">
          {#each [5, 10, 25, 50, 100] as v}
            <button class="qa-btn" on:click={() => setQuickAmount(v)}>${v}</button>
          {/each}
        </div>
      </div>

      <!-- Price Override -->
      <div class="bet-field">
        <label for={priceInputId}>Price (optional override)</label>
        <input id={priceInputId} type="number" bind:value={customPrice} min="0.01" max="0.99" step="0.01"
          placeholder={selectedPrice.toFixed(2)} />
      </div>

      <!-- Payout Estimate -->
      {#if amountNum > 0}
        <div class="bet-estimate">
          <div class="est-row">
            <span>Shares</span>
            <span>{estimatedShares.toFixed(2)}</span>
          </div>
          <div class="est-row">
            <span>Payout if correct</span>
            <span class="est-payout">${estimatedPayout.toFixed(2)}</span>
          </div>
          <div class="est-row">
            <span>Potential profit</span>
            <span class="est-profit" class:negative={estimatedProfit < 0}>
              {estimatedProfit >= 0 ? '+' : ''}{estimatedProfit.toFixed(2)} USDC
            </span>
          </div>
        </div>
      {/if}

      <!-- Place Bet Button -->
      <button class="bet-submit" disabled={!isValid || !walletConnected} on:click={handlePlaceBet}>
        {#if !walletConnected}
          Connect Wallet First
        {:else if !isValid}
          Enter Valid Amount
        {:else}
          PLACE BET — ${amountNum} USDC on {direction}
        {/if}
      </button>

    {:else if step === 'signing'}
      <div class="bet-status">
        <div class="status-spinner"></div>
        <p>지갑에서 서명을 확인하세요...</p>
        <p class="status-sub">Sign the order in your wallet</p>
      </div>

    {:else if step === 'submitting'}
      <div class="bet-status">
        <div class="status-spinner"></div>
        <p>주문 제출 중...</p>
        <p class="status-sub">Submitting to Polymarket</p>
      </div>

    {:else if step === 'done'}
      <div class="bet-status success">
        <span class="status-icon">✓</span>
        <p>주문 제출 완료!</p>
        <p class="status-sub">{direction} ${amountNum} USDC @ {effectivePrice.toFixed(2)}</p>
        <button class="bet-submit" on:click={handleClose}>닫기</button>
      </div>

    {:else if step === 'error'}
      <div class="bet-status error">
        <span class="status-icon">✕</span>
        <p>{errorMsg}</p>
        <button class="bet-submit" on:click={() => { step = 'input'; }}>다시 시도</button>
      </div>
    {/if}
  </div>
</div>
{/if}

<style>
  .bet-overlay {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0,0,0,.7); backdrop-filter: blur(4px);
    display: flex; align-items: flex-end; justify-content: center;
  }
  .bet-panel {
    width: 100%; max-width: 420px;
    background: #111; border-top: 2px solid var(--yel, #E8967D);
    border-radius: 16px 16px 0 0;
    padding: 16px; display: flex; flex-direction: column; gap: 12px;
    animation: slideUp .25s ease-out;
    max-height: 85vh; overflow-y: auto;
  }
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

  .bet-header { display: flex; justify-content: space-between; align-items: center; }
  .bet-title { font: 700 13px/1 var(--fm, monospace); color: var(--yel); letter-spacing: 2px; }
  .bet-close {
    background: none; border: none; color: rgba(255,255,255,.5); font-size: 16px; cursor: pointer;
    padding: 4px 8px; border-radius: 4px;
  }
  .bet-close:hover { background: rgba(255,255,255,.08); color: #fff; }

  .bet-question {
    font: 400 12px/1.4 var(--fm); color: rgba(255,255,255,.8);
    padding: 8px; background: rgba(255,255,255,.04); border-radius: 6px;
  }

  .bet-odds { display: flex; gap: 8px; justify-content: center; }
  .odds-yes, .odds-no {
    font: 700 13px/1 var(--fm); padding: 6px 14px; border-radius: 20px;
    background: rgba(255,255,255,.06); color: rgba(255,255,255,.5);
    transition: all .15s;
  }
  .odds-yes.active { background: rgba(0,204,136,.15); color: #00CC88; }
  .odds-no.active { background: rgba(255,94,122,.15); color: #FF5E7A; }

  .bet-direction { display: flex; gap: 8px; }
  .dir-btn {
    flex: 1; padding: 10px; border: 1px solid rgba(0,204,136,.2); border-radius: 8px;
    background: rgba(0,204,136,.05); color: rgba(0,204,136,.6);
    font: 700 12px/1 var(--fm); cursor: pointer; transition: all .15s;
  }
  .dir-btn.active { background: rgba(0,204,136,.15); color: #00CC88; border-color: rgba(0,204,136,.5); }
  .dir-btn.no { border-color: rgba(255,94,122,.2); background: rgba(255,94,122,.05); color: rgba(255,94,122,.6); }
  .dir-btn.no.active { background: rgba(255,94,122,.15); color: #FF5E7A; border-color: rgba(255,94,122,.5); }

  .bet-field { display: flex; flex-direction: column; gap: 4px; }
  .bet-field label { font: 400 10px/1 var(--fm); color: rgba(255,255,255,.4); text-transform: uppercase; letter-spacing: 1px; }
  .bet-field input {
    background: rgba(255,255,255,.06); border: 1px solid rgba(232,150,125,.15); border-radius: 6px;
    padding: 10px 12px; color: #fff; font: 400 14px/1 var(--fm); outline: none;
  }
  .bet-field input:focus { border-color: var(--yel); }
  .bet-field input::placeholder { color: rgba(255,255,255,.25); }

  .quick-amounts { display: flex; gap: 4px; margin-top: 4px; }
  .qa-btn {
    flex: 1; padding: 5px; border: 1px solid rgba(232,150,125,.12); border-radius: 4px;
    background: rgba(232,150,125,.04); color: rgba(232,150,125,.6);
    font: 400 10px/1 var(--fm); cursor: pointer; transition: all .15s;
  }
  .qa-btn:hover { background: rgba(232,150,125,.1); color: var(--yel); }

  .bet-estimate {
    display: flex; flex-direction: column; gap: 6px;
    padding: 8px 10px; background: rgba(255,255,255,.03); border-radius: 6px;
  }
  .est-row { display: flex; justify-content: space-between; font: 400 11px/1 var(--fm); color: rgba(255,255,255,.5); }
  .est-payout { color: var(--yel); font-weight: 600; }
  .est-profit { color: #00CC88; font-weight: 600; }
  .est-profit.negative { color: #FF5E7A; }

  .bet-submit {
    width: 100%; padding: 12px; border: none; border-radius: 8px;
    background: var(--yel); color: #000; font: 700 13px/1 var(--fm);
    cursor: pointer; text-transform: uppercase; letter-spacing: 1px;
    transition: all .15s;
  }
  .bet-submit:hover:not(:disabled) { filter: brightness(1.1); }
  .bet-submit:disabled { opacity: .4; cursor: not-allowed; }

  .bet-status {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 24px 16px; text-align: center;
  }
  .bet-status p { font: 400 13px/1.3 var(--fm); color: rgba(255,255,255,.8); margin: 0; }
  .status-sub { font-size: 11px !important; color: rgba(255,255,255,.4) !important; }
  .status-icon { font-size: 32px; }
  .bet-status.success .status-icon { color: #00CC88; }
  .bet-status.error .status-icon { color: #FF5E7A; }

  .status-spinner {
    width: 28px; height: 28px; border: 2px solid rgba(232,150,125,.2);
    border-top-color: var(--yel); border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
