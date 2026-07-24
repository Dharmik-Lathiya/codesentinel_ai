/**
 * Enhanced static analyzer with dynamic severity adjustment, confidence
 * thresholds, custom rules, and analysis context tracking.
 */
export class EnhancedAnalyzer {
    severityConfig;
    confidenceThresholds;
    customRules;
    analysisContext;
    constructor(severityConfig, confidenceThresholds, customRules) {
        this.severityConfig = {
            highRiskPatterns: ["src/", "lib/", "app/"],
            lowRiskPatterns: ["test/", "tests/", "__tests__/", ".test.", ".spec."],
            historyBasedAdjustment: true,
            changeFrequencyMultiplier: 1.5,
            ...severityConfig,
        };
        this.confidenceThresholds = {
            security: 0.7,
            bug: 0.6,
            performance: 0.5,
            smell: 0.4,
            style: 0.3,
            ...confidenceThresholds,
        };
        this.customRules = customRules || [];
        this.analysisContext = {
            fileHistory: new Map(),
            sessionStart: Date.now(),
        };
    }
    /**
     * Analyze a file with enhanced features.
     */
    analyze(path, content, options) {
        const startTime = Date.now();
        const findings = [];
        // Apply built-in rules with dynamic severity adjustment
        findings.push(...this.analyzeWithDynamicSeverity(path, content, options?.fileHistory));
        // Apply custom rules
        findings.push(...this.applyCustomRules(path, content));
        // Filter by confidence thresholds
        const filteredFindings = this.filterByConfidence(findings);
        return filteredFindings;
    }
    /**
     * Analyze with dynamic severity adjustment based on file context.
     */
    analyzeWithDynamicSeverity(path, content, fileHistory) {
        const findings = [];
        const lines = content.split("\n");
        // Determine base severity adjustment based on file risk
        const severityMultiplier = this.calculateSeverityMultiplier(path, fileHistory);
        lines.forEach((line, idx) => {
            // 1. Hardcoded secrets / API keys
            if (/api[_-]?key\s*=\s*["'][A-Za-z0-9_\-]{16,}/i.test(line)) {
                findings.push(this.createFinding(this.adjustSeverity("high", severityMultiplier), "security", path, idx + 1, "Possible hardcoded API key detected.", "Move secrets to environment variables or a secrets manager.", 0.9));
            }
            // 2. console.log left in source
            if (/\bconsole\.(log|debug)\(/.test(line) && !path.includes(".test.")) {
                findings.push(this.createFinding(this.adjustSeverity("low", severityMultiplier), "smell", path, idx + 1, "Debug logging left in source.", "Remove or replace with a proper logger.", 0.8));
            }
            // 3. eval usage
            if (/\beval\s*\(/.test(line)) {
                findings.push(this.createFinding(this.adjustSeverity("critical", severityMultiplier), "security", path, idx + 1, "Use of eval() is dangerous and can lead to code injection.", "Avoid eval; parse structured input instead.", 0.95));
            }
            // 4. TODO/FIXME without tracking
            if (/(TODO|FIXME|XXX)\b/.test(line)) {
                findings.push(this.createFinding(this.adjustSeverity("info", severityMultiplier), "smell", path, idx + 1, "Tech-debt marker (TODO/FIXME) found.", "Link to a tracked issue where possible.", 0.9));
            }
            // 5. Hardcoded passwords
            if (/password\s*=\s*["'][^"']+["']/i.test(line)) {
                findings.push(this.createFinding(this.adjustSeverity("high", severityMultiplier), "security", path, idx + 1, "Possible hardcoded password detected.", "Use environment variables or a secrets manager.", 0.85));
            }
            // 6. process.exit() usage
            if (/\bprocess\.exit\s*\(/.test(line)) {
                findings.push(this.createFinding(this.adjustSeverity("medium", severityMultiplier), "smell", path, idx + 1, "Direct process.exit() call found.", "Use exceptions or return codes for cleaner shutdown.", 0.9));
            }
        });
        // 7. Deep nesting detection
        findings.push(...this.detectDeepNesting(path, lines, severityMultiplier));
        // 8. Magic numbers detection
        findings.push(...this.detectMagicNumbers(path, lines, severityMultiplier));
        // 9. Missing error handling
        findings.push(...this.detectMissingErrorHandling(path, content, severityMultiplier));
        // 10. Long functions detection
        findings.push(...this.detectLongFunctions(path, lines, severityMultiplier));
        return findings;
    }
    /**
     * Calculate severity multiplier based on file risk level.
     */
    calculateSeverityMultiplier(path, fileHistory) {
        let multiplier = 1.0;
        // Check high-risk patterns
        if (this.severityConfig.highRiskPatterns.some(pattern => path.includes(pattern))) {
            multiplier *= 1.3;
        }
        // Check low-risk patterns
        if (this.severityConfig.lowRiskPatterns.some(pattern => path.includes(pattern))) {
            multiplier *= 0.7;
        }
        // Adjust based on file history if enabled
        if (this.severityConfig.historyBasedAdjustment && fileHistory) {
            // Increase severity for frequently changed files
            if (fileHistory.changeCount > 10) {
                multiplier *= this.severityConfig.changeFrequencyMultiplier;
            }
            // Increase severity for files with high finding density
            if (fileHistory.findingDensity > 0.1) { // More than 1 finding per 10 lines
                multiplier *= 1.2;
            }
        }
        return Math.min(Math.max(multiplier, 0.5), 2.0); // Clamp between 0.5 and 2.0
    }
    /**
     * Adjust severity based on multiplier.
     */
    adjustSeverity(baseSeverity, multiplier) {
        const severityOrder = ["info", "low", "medium", "high", "critical"];
        const baseIndex = severityOrder.indexOf(baseSeverity);
        // Apply multiplier to index
        const adjustedIndex = Math.round(baseIndex * multiplier);
        const clampedIndex = Math.min(Math.max(adjustedIndex, 0), severityOrder.length - 1);
        return severityOrder[clampedIndex];
    }
    /**
     * Create a finding with confidence metadata.
     */
    createFinding(severity, category, file, line, comment, suggestion, confidence) {
        return {
            severity,
            category,
            file,
            line,
            comment,
            suggestion,
            source: "static",
            // @ts-ignore - Adding confidence metadata
            confidence,
        };
    }
    /**
     * Apply custom rules to the file content.
     */
    applyCustomRules(path, content) {
        const findings = [];
        for (const rule of this.customRules) {
            // Check if rule applies to this file
            if (rule.filePatterns && !rule.filePatterns.some(pattern => path.includes(pattern))) {
                continue;
            }
            try {
                const regex = new RegExp(rule.pattern, "gi");
                const lines = content.split("\n");
                lines.forEach((line, idx) => {
                    if (regex.test(line)) {
                        findings.push(this.createFinding(rule.severity, rule.category, path, idx + 1, rule.comment, rule.suggestion || "", rule.confidence || 0.7));
                    }
                });
            }
            catch {
                // Skip invalid regex patterns
            }
        }
        return findings;
    }
    /**
     * Filter findings by confidence thresholds.
     */
    filterByConfidence(findings) {
        return findings.filter(finding => {
            // @ts-ignore - Using confidence metadata
            const confidence = finding.confidence || 0.5;
            const threshold = this.confidenceThresholds[finding.category] || 0.5;
            return confidence >= threshold;
        });
    }
    /**
     * Detect deep nesting with severity adjustment.
     */
    detectDeepNesting(path, lines, severityMultiplier) {
        const findings = [];
        const maxDepth = 4;
        let blockStart = -1;
        let blockDepth = 0;
        lines.forEach((line, idx) => {
            const indent = line.search(/\S/);
            if (indent >= 0) {
                const depth = Math.floor(indent / 2);
                if (depth > maxDepth) {
                    if (blockStart === -1) {
                        blockStart = idx + 1;
                        blockDepth = depth;
                    }
                    if (depth > blockDepth)
                        blockDepth = depth;
                    return;
                }
            }
            if (blockStart !== -1) {
                findings.push(this.createFinding(this.adjustSeverity("medium", severityMultiplier), "smell", path, blockStart, `Deep nesting detected (depth: ${blockDepth}, lines ${blockStart}-${idx}).`, "Consider extracting logic into separate functions.", Math.min(0.5 + (blockDepth - maxDepth) * 0.1, 0.9)));
                blockStart = -1;
                blockDepth = 0;
            }
        });
        if (blockStart !== -1) {
            findings.push(this.createFinding(this.adjustSeverity("medium", severityMultiplier), "smell", path, blockStart, `Deep nesting detected (depth: ${blockDepth}, lines ${blockStart}-${lines.length}).`, "Consider extracting logic into separate functions.", Math.min(0.5 + (blockDepth - maxDepth) * 0.1, 0.9)));
        }
        return findings;
    }
    /**
     * Detect magic numbers with severity adjustment.
     */
    detectMagicNumbers(path, lines, severityMultiplier) {
        const findings = [];
        const magicNumberRegex = /(?<![a-zA-Z_])\b(?!0\b|1\b|-1\b|2\b)\d{2,}\b(?![a-zA-Z_])/g;
        lines.forEach((line, idx) => {
            if (line.trim().startsWith("//") || line.trim().startsWith("import") || line.trim().startsWith("export")) {
                return;
            }
            let match;
            while ((match = magicNumberRegex.exec(line)) !== null) {
                findings.push(this.createFinding(this.adjustSeverity("low", severityMultiplier), "smell", path, idx + 1, `Magic number ${match[0]} detected.`, "Consider extracting to a named constant.", 0.7));
            }
        });
        return findings;
    }
    /**
     * Detect missing error handling with severity adjustment.
     */
    detectMissingErrorHandling(path, content, severityMultiplier) {
        const findings = [];
        const lines = content.split("\n");
        const inTryBlock = new Set();
        let tryStart = -1;
        let braceCount = 0;
        lines.forEach((line, idx) => {
            if (tryStart >= 0) {
                braceCount += (line.match(/{/g) || []).length;
                braceCount -= (line.match(/}/g) || []).length;
                if (braceCount <= 0) {
                    for (let i = tryStart; i <= idx; i++) {
                        inTryBlock.add(i);
                    }
                    tryStart = -1;
                }
            }
            else if (/\btry\s*\{/.test(line)) {
                tryStart = idx;
                braceCount = 1;
            }
        });
        lines.forEach((line, idx) => {
            if (inTryBlock.has(idx))
                return;
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("/*"))
                return;
            if (/\bawait\b/.test(line) && !/\b(try|catch)\b/.test(line)) {
                findings.push(this.createFinding(this.adjustSeverity("low", severityMultiplier), "smell", path, idx + 1, "Await call without error handling.", "Wrap in try/catch for proper error handling.", 0.8));
            }
        });
        return findings;
    }
    /**
     * Detect long functions with severity adjustment.
     */
    detectLongFunctions(path, lines, severityMultiplier) {
        const findings = [];
        let functionStart = -1;
        let functionName = "";
        let braceCount = 0;
        lines.forEach((line, idx) => {
            const functionMatch = line.match(/(?:function|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function))\s+(\w+)?/);
            if (functionMatch && functionStart === -1) {
                functionStart = idx;
                functionName = functionMatch[1] || "anonymous";
                braceCount = 0;
            }
            if (functionStart >= 0) {
                braceCount += (line.match(/{/g) || []).length;
                braceCount -= (line.match(/}/g) || []).length;
                if (braceCount <= 0 && idx > functionStart) {
                    const functionLength = idx - functionStart;
                    if (functionLength > 50) {
                        findings.push(this.createFinding(this.adjustSeverity("medium", severityMultiplier), "smell", path, functionStart + 1, `Long function "${functionName}" (${functionLength} lines).`, "Consider breaking into smaller functions.", Math.min(0.5 + (functionLength - 50) * 0.01, 0.9)));
                    }
                    functionStart = -1;
                }
            }
        });
        return findings;
    }
    /**
     * Analyze multiple files with enhanced features.
     */
    analyzeMany(files, options) {
        return files.flatMap(f => this.analyze(f.path, f.content, {
            fileHistory: options?.fileHistories?.get(f.path),
            previousFindings: options?.previousFindings?.get(f.path),
        }));
    }
    /**
     * Update analysis context with new file history.
     */
    updateContext(fileHistory) {
        this.analysisContext.fileHistory = fileHistory;
    }
    /**
     * Get analysis context for comparison.
     */
    getContext() {
        return { ...this.analysisContext };
    }
    /**
     * Add a custom rule.
     */
    addCustomRule(rule) {
        this.customRules.push(rule);
    }
    /**
     * Remove a custom rule by ID.
     */
    removeCustomRule(ruleId) {
        this.customRules = this.customRules.filter(rule => rule.id !== ruleId);
    }
    /**
     * Update confidence thresholds.
     */
    updateConfidenceThresholds(thresholds) {
        this.confidenceThresholds = { ...this.confidenceThresholds, ...thresholds };
    }
    /**
     * Update severity adjustment configuration.
     */
    updateSeverityConfig(config) {
        this.severityConfig = { ...this.severityConfig, ...config };
    }
}
//# sourceMappingURL=enhanced.js.map