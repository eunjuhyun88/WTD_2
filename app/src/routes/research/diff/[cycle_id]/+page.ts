import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	return {
		cycleId: params.cycle_id
	};
};
