export const STORAGE_KEYS = {
  gameState: 'stockclaw_state',
  agents: 'stockclaw_agents',
  wallet: 'stockclaw_wallet',
  matchHistory: 'stockclaw_match_history',
  quickTrades: 'stockclaw_quicktrades',
  trackedSignals: 'stockclaw_tracked',
  predictPositions: 'stockclaw_predict_positions',
  community: 'stockclaw_community',
  profile: 'stockclaw_profile',
  pnl: 'stockclaw_pnl',
  dbUsers: 'stockclaw_users',
  dbMatches: 'stockclaw_matches',
  dbSignals: 'stockclaw_signals',
  dbPredictions: 'stockclaw_predictions',
  warRoomScan: 'stockclaw.warroom.scanstate.v1',
  notificationsSeeded: 'stockclaw_notifications_seeded_v1',
  activeGames: 'stockclaw_active_games',
} as const;

/** Keys safe to clear on user-initiated data reset (excludes session-only flags) */
export const RESETTABLE_STORAGE_KEYS: ReadonlyArray<string> = Object.values(STORAGE_KEYS)
  .filter(k => k !== STORAGE_KEYS.notificationsSeeded);
