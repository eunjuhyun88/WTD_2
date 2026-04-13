export const STORAGE_KEYS = {
  gameState: 'wtd_state',
  agents: 'wtd_agents',
  wallet: 'wtd_wallet',
  matchHistory: 'wtd_match_history',
  quickTrades: 'wtd_quicktrades',
  trackedSignals: 'wtd_tracked',
  predictPositions: 'wtd_predict_positions',
  community: 'wtd_community',
  profile: 'wtd_profile',
  pnl: 'wtd_pnl',
  dbUsers: 'wtd_users',
  dbMatches: 'wtd_matches',
  dbSignals: 'wtd_signals',
  dbPredictions: 'wtd_predictions',
  warRoomScan: 'wtd.warroom.scanstate.v1',
  notificationsSeeded: 'wtd_notifications_seeded_v1',
  activeGames: 'wtd_active_games',
  strategies: 'wtd_strategies',
} as const;

/** Keys safe to clear on user-initiated data reset (excludes session-only flags) */
export const RESETTABLE_STORAGE_KEYS: ReadonlyArray<string> = Object.values(STORAGE_KEYS)
  .filter(k => k !== STORAGE_KEYS.notificationsSeeded);
