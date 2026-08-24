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
