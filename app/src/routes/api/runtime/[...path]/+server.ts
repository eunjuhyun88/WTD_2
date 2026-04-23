import type { RequestHandler } from './$types';
import { handleEnginePlaneRequest } from '$lib/server/enginePlaneProxy';

export const GET: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'runtime', 'GET');
export const POST: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'runtime', 'POST');
export const PUT: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'runtime', 'PUT');
export const DELETE: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'runtime', 'DELETE');
