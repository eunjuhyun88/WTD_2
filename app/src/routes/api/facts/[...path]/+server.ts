import type { RequestHandler } from './$types';
import { handleEnginePlaneRequest } from '$lib/server/enginePlaneProxy';

export const GET: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'facts', 'GET');
export const POST: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'facts', 'POST');
export const PUT: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'facts', 'PUT');
export const DELETE: RequestHandler = (event) => handleEnginePlaneRequest(event as any, 'facts', 'DELETE');
