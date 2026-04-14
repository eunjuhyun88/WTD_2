type TimingMap = Record<string, number>;

export function createAnalyzeTimer() {
  const startedAt = Date.now();
  const marks: TimingMap = {};

  return {
    mark(label: string) {
      marks[label] = Date.now() - startedAt;
    },
    flush(meta: Record<string, unknown> = {}) {
      const totalMs = Date.now() - startedAt;
      console.info('[analyze:timing]', { ...meta, ...marks, total_ms: totalMs });
      return { ...marks, total_ms: totalMs };
    },
  };
}
