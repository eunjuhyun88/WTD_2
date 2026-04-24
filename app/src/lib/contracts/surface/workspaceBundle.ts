export interface WorkspaceBundleSection {
	id: string;
	label: string;
	kind: 'summary' | 'detail' | 'compare' | 'agent';
	summary?: string | null;
}

export interface WorkspaceCompareSlot {
	id: string;
	kind: string;
	summary?: string | null;
}

export interface WorkspaceBundle {
	symbol: string;
	timeframe: string;
	fact_snapshot_id?: string | null;
	sections: WorkspaceBundleSection[];
	compare?: WorkspaceCompareSlot[];
}
