export declare const DEFAULT_FINDINGS_LIMIT = 100;
export declare const MAX_RELEVANT_LESSONS = 10;
export interface FindingRecord {
    id: string;
    file: string;
    line: number | null;
    severity: string;
    category: string;
    message: string;
    suggestion: string | null;
    source: string;
    created_at: string;
}
export interface PatternRecord {
    id: string;
    pattern_text: string;
    category: string;
    frequency: number;
    auto_rule_id: string | null;
}
export interface CustomRuleRecord {
    id: string;
    name: string;
    pattern: string;
    severity: string;
    category: string;
    comment: string | null;
    suggestion: string | null;
    status: string;
}
export declare class LearningStore {
    private db;
    private dbPath;
    private ready;
    constructor(dbPath?: string);
    init(): Promise<void>;
    recordFinding(finding: {
        file: string;
        line?: number | null;
        severity: string;
        category: string;
        message: string;
        suggestion?: string | null;
        source?: string;
    }): Promise<string>;
    getFindings(limit?: number): Promise<FindingRecord[]>;
    recordFeedback(findingId: string, feedbackType: string, comment?: string): Promise<void>;
    getRelevantLessons(fileExtension: string): Promise<string[]>;
    recordPattern(patternText: string, category: string): Promise<void>;
    private insertPatternRecord;
    getPendingRules(): Promise<CustomRuleRecord[]>;
    approveRule(ruleId: string): Promise<void>;
    declineRule(ruleId: string): Promise<void>;
    getFalsePositiveRate(): Promise<number>;
    /** Get rules with high false-positive rate (>= threshold) and minimum feedback count. */
    getHighFalsePositiveRules(minFeedback?: number, fpThreshold?: number): Promise<{
        ruleId: string;
        fpRate: number;
        total: number;
    }[]>;
    getActivePromptOverrides(taskType: string): Promise<string[]>;
    createPromptOverride(taskType: string, overrideText: string, reason?: string): Promise<void>;
    autoCreateRule(patternId: string, name: string, pattern: string, severity: string, category: string, comment?: string, suggestion?: string): Promise<string | null>;
    getPatternsAboveThreshold(minFrequency: number): Promise<PatternRecord[]>;
    close(): Promise<void>;
}
