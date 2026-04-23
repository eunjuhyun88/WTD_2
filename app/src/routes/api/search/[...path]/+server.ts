import type { RequestHandler } from './$types';
import { handleEnginePlaneRequest } from '$lib/server/enginePlaneProxy';

export const GET: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'search', 'GET');
export const POST: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'search', 'POST');
export const PUT: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'search', 'PUT');
export const DELETE: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'search', 'DELETE');
