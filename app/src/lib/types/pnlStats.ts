export interface PnLStatsPoint {
  ts: string;
  cumulative_pnl_bps: number;
}

export interface PnLStats {
  pattern_slug: string;
  n: number;
  mean_pnl_bps: number | null;
  std_pnl_bps: number | null;
  sharpe_like: number | null;
  win_rate: number | null;
  loss_rate: number | null;
  indeterminate_rate: number | null;
  ci_low: number | null;
  ci_high: number | null;
  preliminary: boolean;
  btc_hold_return_pct: number | null;
  equity_curve: PnLStatsPoint[];
}
