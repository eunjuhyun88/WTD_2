import type { RuntimePlaneState } from './captures';

export interface WorkspacePin {
	id: string;
	kind: string;
	summary?: string | null;
}

export interface WorkspaceStateRecord {
	symbol: string;
	pins: WorkspacePin[];
	compare_ids?: string[];
	updated_at: string;
}

export interface RuntimeWorkspaceStateResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'runtime';
	status: RuntimePlaneState;
	generated_at: string;
	workspace: WorkspaceStateRecord;
}
