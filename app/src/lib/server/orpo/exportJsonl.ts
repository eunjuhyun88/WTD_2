import type { BuiltOrpoPair } from './pairBuilder';

export interface OrpoJsonlOptions {
  datasetVersionId?: string;
  includeMetadata?: boolean;
}

export function serializeOrpoPairsToJsonl(
  pairs: BuiltOrpoPair[],
  options: OrpoJsonlOptions = {},
): string {
  const includeMetadata = options.includeMetadata ?? true;
  const lines = pairs.map((pair) => {
    const row: Record<string, unknown> = {
      prompt: pair.prompt,
      chosen: pair.chosen,
      rejected: pair.rejected,
      marginScore: pair.marginScore,
      pairQuality: pair.pairQuality,
    };

    if (options.datasetVersionId) row.datasetVersionId = options.datasetVersionId;
    if (includeMetadata) row.metadata = pair.metadata;

    return JSON.stringify(row);
  });

  return lines.join('\n');
}

export function estimateJsonlByteSize(jsonl: string): number {
  return Buffer.byteLength(jsonl, 'utf8');
}
