// ─── Polling Scheduler ───────────────────────────────────────
// 등록된 작업을 주기적으로 실행하는 스케줄러.
// Node.js setInterval 기반. unref()로 프로세스 종료 방해 없음.

type PollerFn = () => Promise<void>;

interface PollerEntry {
  id: string;
  fn: PollerFn;
  intervalMs: number;
  timer: ReturnType<typeof setInterval>;
  lastRunAt: number;
  errorCount: number;
}

const pollers = new Map<string, PollerEntry>();

/** 폴러 등록. 이미 같은 id가 있으면 교체한다. */
export function registerPoller(
  id: string,
  fn: PollerFn,
  intervalMs: number,
): void {
  // 기존 타이머 해제
  const existing = pollers.get(id);
  if (existing) clearInterval(existing.timer);

  const entry: PollerEntry = {
    id,
    fn,
    intervalMs,
    lastRunAt: 0,
    errorCount: 0,
    timer: setInterval(async () => {
      try {
        await fn();
        entry.lastRunAt = Date.now();
        entry.errorCount = 0;
      } catch (err) {
        entry.errorCount++;
        // silent — caller캐시가 만료되면 자연히 재요청
      }
    }, intervalMs),
  };

  // 서버 종료 방해 없음
  if (typeof entry.timer === 'object' && 'unref' in entry.timer) {
    (entry.timer as NodeJS.Timeout).unref();
  }

  pollers.set(id, entry);

  // 최초 즉시 실행 (캐시 웜업)
  fn().then(() => { entry.lastRunAt = Date.now(); }).catch(() => {});
}

/** 폴러 제거 */
export function unregisterPoller(id: string): void {
  const entry = pollers.get(id);
  if (entry) {
    clearInterval(entry.timer);
    pollers.delete(id);
  }
}

/** 현재 등록된 폴러 목록 */
export function listPollers(): Array<{
  id: string;
  intervalMs: number;
  lastRunAt: number;
  errorCount: number;
}> {
  return Array.from(pollers.values()).map(e => ({
    id: e.id,
    intervalMs: e.intervalMs,
    lastRunAt: e.lastRunAt,
    errorCount: e.errorCount,
  }));
}

/** 특정 폴러 즉시 실행 */
export async function runNow(id: string): Promise<void> {
  const entry = pollers.get(id);
  if (entry) await entry.fn();
}
