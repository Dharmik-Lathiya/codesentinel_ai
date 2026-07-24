import type { Finding } from "../analyzer/index.js";
import type { Dismissal } from "../config/types.js";
export declare class DismissalManager {
    private filePath;
    private dismissals;
    constructor(filePath: string);
    private load;
    private save;
    dismiss(finding: Finding, reason: string): void;
    dismissByRule(ruleId: string, reason: string): void;
    dismissByFinding(file: string, line: number | null, ruleId: string, reason: string): void;
    isDismissed(finding: Finding): boolean;
    filterDismissed(findings: Finding[]): Finding[];
    listDismissals(): Dismissal[];
    clearDismissals(): void;
}
