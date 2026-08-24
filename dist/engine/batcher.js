export function groupIntoBatches(files, batchSize) {
    const batches = [];
    for (let i = 0; i < files.length; i += batchSize) {
        batches.push(files.slice(i, i + batchSize));
    }
    return batches;
}
//# sourceMappingURL=batcher.js.map