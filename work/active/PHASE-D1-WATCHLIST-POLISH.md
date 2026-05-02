# Phase D-1 — WatchlistRail Polish (1일)

**목표**: Watchlist UI 최종 정리 및 whale alert 기능 추가

**Branch**: `feat/W-0374-phase-d1-watchlist`

---

## 1. Features to Implement

### 1.1 Fold/Expand Toggle ✅ (DONE in Phase D-0)
- Width: 56px (folded) ↔ 200px (expanded)
- Persist to localStorage: `cogochi.watchlist.folded`
- CSS transition: 200ms ease

### 1.2 Sparklines ✅ (DONE in Phase D-0)
- Real-time miniTicker WebSocket
- 7-point price history
- SVG polyline stroke (bullish: #22AB94, bearish: #F23645)
- Responsive to price updates

### 1.3 Whale Alerts (NEW)

**Data Structure**:
```typescript
interface WhaleAlert {
  symbol: string;
  amount: number;        // USD
  direction: 'buy' | 'sell';
  exchange: string;      // 'binance', 'coinbase', etc.
  timestamp: number;     // unix ms
  confidence?: number;   // 0-100
}
```

**Section Layout**:
```
WHALE ALERTS [↓/↑]  (collapsible header)
├─ [BTC] Sell $5.2M Binance · 2m ago
├─ [ETH] Buy $1.8M Kraken · 5m ago
└─ [SOL] Sell $890K FTX · 12m ago
```

**Features**:
- Collapsible section (default open if alerts exist)
- Max 5 visible alerts (scroll if more)
- Color code: sell (red/neg), buy (green/pos)
- Time delta (2m ago, 5m ago)
- Click → focus symbol in watchlist

**Data Source** (mock for now):
- Fetch from `/api/whale-alerts?symbols=BTC,ETH,SOL...&limit=5`
- Update interval: 10s (polling)
- Fallback: empty state "No recent alerts"

### 1.4 localStorage Persistence (D-1 Enhancement)

Persist watchlist across sessions:
```typescript
const STORAGE_KEY = 'cogochi:watchlist:v1';  // Already exists
localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
```

Note: Fold state already persisted in Phase D-0 (`cogochi.watchlist.folded`)

---

## 2. Files to Modify

### 2.1 `app/src/lib/cogochi/WatchlistRail.svelte`

**Add**:
1. WhaleAlert interface + state:
   ```typescript
   interface WhaleAlert { /* see above */ }
   let whaleAlerts = $state<WhaleAlert[]>([]);
   let whaleCollapsed = $state(false);
   ```

2. Fetch whale alerts:
   ```typescript
   onMount(async () => {
     // Fetch symbols from watchlist
     const syms = symbols.join(',');
     const res = await fetch(`/api/whale-alerts?symbols=${syms}&limit=5`);
     if (res.ok) {
       whaleAlerts = await res.json();
     }
   });
   
   // Poll every 10s
   $effect(() => {
     const interval = setInterval(async () => {
       const syms = symbols.join(',');
       const res = await fetch(`/api/whale-alerts?symbols=${syms}&limit=5`);
       if (res.ok) whaleAlerts = await res.json();
     }, 10000);
     return () => clearInterval(interval);
   });
   ```

3. Render whale alerts section (after symbol list):
   ```svelte
   {#if !folded && whaleAlerts.length > 0}
     <div class="section-header">
       <span class="section-label">WHALE ALERTS</span>
       <button
         class="fold-btn"
         onclick={() => (whaleCollapsed = !whaleCollapsed)}
       >
         {whaleCollapsed ? '▶' : '▼'}
       </button>
     </div>
     {#if !whaleCollapsed}
       <ul class="whale-list">
         {#each whaleAlerts as alert (alert.timestamp)}
           <li class="whale-alert" class:sell={alert.direction === 'sell'} class:buy={alert.direction === 'buy'}>
             <span class="alert-symbol">{alert.symbol.replace(/USDT/, '')}</span>
             <span class="alert-direction">{alert.direction === 'buy' ? '↑' : '↓'}</span>
             <span class="alert-amount">${(alert.amount / 1e6).toFixed(1)}M</span>
             <span class="alert-exchange">{alert.exchange}</span>
             <span class="alert-time">{getTimeDelta(alert.timestamp)}</span>
           </li>
         {/each}
       </ul>
     {/if}
   {/if}
   ```

**Styling**:
```css
.whale-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.whale-alert {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 0.5px solid var(--g3);
  font-size: 9px;
  cursor: pointer;
  transition: background 0.1s;
}

.whale-alert:hover { background: var(--g2); }

.whale-alert.buy { color: var(--pos); }
.whale-alert.sell { color: var(--neg); }

.alert-symbol {
  font-weight: 600;
  flex-shrink: 0;
}

.alert-direction {
  flex-shrink: 0;
}

.alert-amount {
  flex-shrink: 0;
  font-weight: 600;
}

.alert-exchange {
  color: var(--g6);
  flex-shrink: 0;
  font-size: 8px;
}

.alert-time {
  margin-left: auto;
  color: var(--g5);
  font-size: 8px;
}
```

---

## 3. Helper Functions

### 3.1 `getTimeDelta(timestamp: number): string`

```typescript
function getTimeDelta(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffS = Math.floor(diffMs / 1000);
  const diffM = Math.floor(diffS / 60);
  const diffH = Math.floor(diffM / 60);
  
  if (diffM < 1) return 'now';
  if (diffM < 60) return `${diffM}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}
```

---

## 4. API Endpoint (Mock/Stub)

**Endpoint**: `GET /api/whale-alerts?symbols=BTC,ETH&limit=5`

**Response**:
```json
{
  "alerts": [
    {
      "symbol": "BTCUSDT",
      "amount": 5200000,
      "direction": "sell",
      "exchange": "binance",
      "timestamp": 1714605600000
    },
    {
      "symbol": "ETHUSDT",
      "amount": 1800000,
      "direction": "buy",
      "exchange": "kraken",
      "timestamp": 1714605300000
    }
  ]
}
```

For Phase D-1, create a stub that returns mock data. Later phases can wire real data.

---

## 5. Acceptance Criteria (D-1)

| AC | Criterion | Status |
|---|---|---|
| AC-D1-1 | Fold 56px/expand 200px toggle works | Verify |
| AC-D1-2 | Fold state persists to localStorage | Verify |
| AC-D1-3 | Sparklines render correctly | Verify |
| AC-D1-4 | Whale alerts section visible (if data exists) | Implement |
| AC-D1-5 | Whale alerts collapsible | Implement |
| AC-D1-6 | Whale direction indicated (↑/↓) | Implement |
| AC-D1-7 | Whale amount formatted ($XM) | Implement |
| AC-D1-8 | Whale exchange badge visible | Implement |
| AC-D1-9 | Whale time delta correct (2m ago, 5m ago) | Implement |
| AC-D1-10 | Click whale alert focuses symbol | Implement |
| AC-D1-11 | Whale alerts poll every 10s | Implement |
| AC-D1-12 | No console errors on watchlist load | Verify |

---

## 6. Testing Strategy

**Manual Testing**:
1. Open cogochi terminal
2. Verify WatchlistRail is 200px wide (expanded)
3. Click fold button (‹) → should shrink to 56px
4. Reload page → fold state persists
5. Verify sparklines update on price tick
6. Verify whale alerts section shows (if API returns data)
7. Click whale alert → symbol should highlight in watchlist

**No new unit tests** (focused on manual validation and UI polish)

---

## 7. PR Strategy

**Single PR**: `feat/W-0374-phase-d1-watchlist-polish`

**Commits** (atomic):
1. `feat(whale-alerts): add whale alert UI structure and polling`
2. `feat(whale-alerts): wire symbol focus and time delta formatting`
3. `chore(D1): verify watchlist fold, sparklines, whale alerts`

---

## 8. Exit Criteria (D-1 Complete)

1. ✅ Fold/expand toggle works + persists
2. ✅ Sparklines render and update
3. ✅ Whale alerts section visible, collapsible, clickable
4. ✅ All AC-D1-1 through AC-D1-12 pass
5. ✅ 0 new TypeScript errors
6. ✅ 0 console errors
7. ✅ PR merged to main

---

**Timeline**: 1 day (Phase D-1)  
**Next**: Phase D-2 (Chart toolbar + TF picker) — 1.5 days
