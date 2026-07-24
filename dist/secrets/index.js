function checkLine(line, lineNumber, path, pattern, re) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*"))
        return null;
    if (trimmed.startsWith("#"))
        return null;
    re.lastIndex = 0;
    if (re.test(line)) {
        return {
            severity: pattern.severity,
            category: "security",
            file: path,
            line: lineNumber,
            comment: pattern.message,
            suggestion: pattern.suggestion,
            source: "static",
        };
    }
    return null;
}
export function scanSecrets(path, content, patterns) {
    const findings = [];
    const lines = content.split("\n");
    for (const pattern of patterns) {
        const flags = pattern.regex.startsWith("(?i)") ? "gi" : "g";
        const source = pattern.regex.startsWith("(?i)") ? pattern.regex.slice(4) : pattern.regex;
        let re;
        try {
            re = new RegExp(source, flags);
        }
        catch {
            continue;
        }
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const finding = checkLine(line, i + 1, path, pattern, re);
            if (finding)
                findings.push(finding);
        }
    }
    return findings;
}
//# sourceMappingURL=index.js.map