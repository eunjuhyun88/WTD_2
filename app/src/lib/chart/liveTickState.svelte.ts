// Reactive store for ChartBoard's live-tick scalars.
// Owns the 4 price/time/changePct/oiDelta $state vars so they can be
// consumed outside ChartBoard without prop-drilling.
// Callbacks (DataFeed.onBar, renderCharts, crosshair) stay in ChartBoard
// and call liveTick.update() — coupling is preserved, ownership is not.

export function createLiveTickState() {
  let price     = $state<number | null>(null);
  let time      = $state<number | null>(null);
  let changePct = $state<number | null>(null);
  let oiDelta   = $state<number | null>(null);

  return {
    get price()     { return price; },
    get time()      { return time; },
    get changePct() { return changePct; },
    get oiDelta()   { return oiDelta; },

    update(patch: {
      price?:     number | null;
      time?:      number | null;
      changePct?: number | null;
      oiDelta?:   number | null;
    }) {
      if ('price'     in patch) price     = patch.price     ?? null;
      if ('time'      in patch) time      = patch.time      ?? null;
      if ('changePct' in patch) changePct = patch.changePct ?? null;
      if ('oiDelta'   in patch) oiDelta   = patch.oiDelta   ?? null;
    },

    reset() {
      price = null; time = null; changePct = null; oiDelta = null;
    },
  };
}
