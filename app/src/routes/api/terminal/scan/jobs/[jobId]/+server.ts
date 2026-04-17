import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getTerminalScanJob } from '$lib/server/terminalScanJobStore';

export const GET: RequestHandler = async ({ cookies, params }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ error: 'Authentication required' }, { status: 401 });

  const jobId = typeof params.jobId === 'string' ? params.jobId.trim() : '';
  if (!jobId) return json({ error: 'Invalid job id' }, { status: 400 });

  const job = getTerminalScanJob(jobId, user.id);
  if (!job) return json({ error: 'Job not found' }, { status: 404 });

  if (job.state === 'failed') {
    return json(
      {
        success: false,
        state: job.state,
        jobId,
        error: job.error ?? 'Scan job failed',
      },
      { status: 200 },
    );
  }

  if (job.state !== 'completed' || !job.result) {
    return json({
      success: true,
      state: job.state,
      jobId,
    });
  }

  const r = job.result;
  return json({
    success: true,
    ok: true,
    state: 'completed',
    jobId,
    scanId: r.scanId,
    persisted: r.persisted,
    warning: r.warning,
    data: r.data,
  });
};
