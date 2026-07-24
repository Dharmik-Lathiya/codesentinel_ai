export function groupIntoBatches(files, batchSize) {
    const batches = [];
    for (let i = 0; i < files.length; i += batchSize) {
        batches.push(files.slice(i, i + batchSize));
    }
    return batches;
}
export function estimateTokenBudget(files, maxTokens) {
    let total = 0;
    for (const f of files) {
        total += f.content.length / 4;
        if (f.diff)
            total += f.diff.length / 4;
    }
    return Math.min(maxTokens, Math.ceil(total));
}
//# sourceMappingURL=batcher.js.map