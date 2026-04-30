import {
  extractAlerts as extractLocalAlerts,
  runOpportunityScan as runLocalOpportunityScan,
  type OpportunityAlert,
  type OpportunityScanResult,
} from './local/opportunity';
import {
  extractAlerts as extractRemoteAlerts,
  runOpportunityScan as runRemoteOpportunityScan,
} from './remote/opportunity';
import { getEngineRuntimeMode } from './config';

export type { OpportunityScore, OpportunityAlert, OpportunityScanResult } from './local/opportunity';

export async function runOpportunityScan(limit = 15): Promise<OpportunityScanResult> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return runLocalOpportunityScan(limit);
    case 'remote':
      return runRemoteOpportunityScan(limit);
  }
}

export function extractAlerts(scanResult: OpportunityScanResult): OpportunityAlert[] {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return extractLocalAlerts(scanResult);
    case 'remote':
      return extractRemoteAlerts(scanResult);
  }
}
