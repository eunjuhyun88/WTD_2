import type { VisualizationIntent, VisualizationTemplate } from '../contracts/intentDrivenChart';

const INTENT_TO_TEMPLATE: Record<VisualizationIntent, VisualizationTemplate> = {
	why: 'event-focus',
	state: 'state-view',
	compare: 'compare-view',
	search: 'scan-grid',
	flow: 'flow-view',
	execution: 'execution-view',
};

export function selectVisualizationTemplate(intent: VisualizationIntent): VisualizationTemplate {
	return INTENT_TO_TEMPLATE[intent];
}
