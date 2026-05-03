/**
 * analytics.ts — thin PostHog wrapper
 *
 * PostHog SDK import 불필요. window.posthog snippet으로 주입된 전역 객체를 직접 접근.
 * SSR-safe: typeof window 체크 포함.
 */

export type AnalyticsEvent =
  | 'page_view'
  | 'cta_click'
  | 'workmode_switch'
  | 'rightpanel_tab_switch'
  | 'analyze_panel_view'
  | 'verdict_submit'
  | 'topbar_tf_switch'
  | 'dashboard_opportunity_click'
  | 'pattern_to_cogochi_click'
  | 'passport_share_click'
  | 'lab_feature_gate_hit'
  | 'home_scroll_depth'
  | 'cmdpalette_open'
  | 'cmdpalette_action'
  | 'ticker_symbol_click'
  | 'cogochi_legacy_toggle'
  | 'train_session_complete'
  | 'flywheel_recommendation_click';

export function track(event: AnalyticsEvent | string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  // @ts-expect-error posthog injected by snippet
  window.posthog?.capture(event, props);
}
