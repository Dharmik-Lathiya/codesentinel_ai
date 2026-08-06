function formatLine(label, value, fallback = "N/A") {
    return `  ${label}: ${value ?? fallback}`;
}
export function buildDeltaContext(history) {
    if (history.length === 0)
        return "";
    const parts = history.map((h, i) => {
        const attrs = [
            formatLine("Previous fix", h.diff ?? "no diff"),
            formatLine("Result", h.previousResult ?? h.explanation),
            formatLine("Verification", h.verified ? "passed" : "failed"),
        ];
        return `Attempt ${h.iteration} on ${h.file}:\n${attrs.join("\n")}`;
    });
    return [
        "<previous_attempts>",
        parts.join("\n---\n"),
        "</previous_attempts>",
        "",
        "INSTRUCTIONS: Review the previous attempts above. Do NOT repeat the same fixes.",
        "If previous attempts failed, consider a different approach.",
    ].join("\n");
}
export function mergeDeltas(existing, newDelta) {
    if (!existing)
        return newDelta;
    if (!newDelta)
        return existing;
    return `${existing}\n---\n${newDelta}`;
}
//# sourceMappingURL=delta.js.map