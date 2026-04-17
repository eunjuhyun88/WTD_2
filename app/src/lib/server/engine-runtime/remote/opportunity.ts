import { type OpportunityScanResult, type OpportunityAlert, extractAlerts as extractLocalAlerts } from '$lib/engine/opportunityScanner';
import { engine } from '$lib/server/engineClient';

export async function runOpportunityScan(limit = 15): Promise<OpportunityScanResult> {
  return engine.opportunityScan(limit) as Promise<OpportunityScanResult>;
}

export function extractAlerts(scanResult: OpportunityScanResult): OpportunityAlert[] {
  return extractLocalAlerts(scanResult);
}
