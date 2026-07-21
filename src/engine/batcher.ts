export interface FileBatch {
  index: number;
  files: { path: string; content: string; diff?: string }[];
}

export function groupIntoBatches<T extends { path: string }>(
  files: T[],
  batchSize: number,
): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }
  return batches;
}

export function estimateTokenBudget(
  files: { path: string; content: string; diff?: string }[],
  maxTokens: number,
): number {
  let total = 0;
  for (const f of files) {
    total += f.content.length / 4;
    if (f.diff) total += f.diff.length / 4;
  }
  return Math.min(maxTokens, Math.ceil(total));
}
