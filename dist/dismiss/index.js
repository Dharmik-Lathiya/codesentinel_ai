import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const MAX_RULE_ID_COMMENT_LENGTH = 40;
export class DismissalManager {
    filePath;
    dismissals = [];
    constructor(filePath) {
        this.filePath = filePath;
        this.load();
    }
    load() {
        if (existsSync(this.filePath)) {
            try {
                const raw = readFileSync(this.filePath, "utf8");
                this.dismissals = JSON.parse(raw);
            }
            catch {
                this.dismissals = [];
            }
        }
    }
    save() {
        const dir = dirname(this.filePath);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        writeFileSync(this.filePath, JSON.stringify(this.dismissals, null, 2), "utf8");
    }
    dismiss(finding, reason) {
        this.dismissals.push({
            file: finding.file,
            line: finding.line,
            ruleId: `${finding.category}:${finding.comment.slice(0, MAX_RULE_ID_COMMENT_LENGTH)}`,
            reason,
            dismissedAt: new Date(Date.now()).toISOString(),
        });
        this.save();
    }
    dismissByRule(ruleId, reason) {
        this.dismissals.push({
            file: "",
            line: null,
            ruleId,
            reason,
            dismissedAt: new Date(Date.now()).toISOString(),
        });
        this.save();
    }
    dismissByFinding(file, line, ruleId, reason) {
        this.dismissals.push({
            file,
            line,
            ruleId,
            reason,
            dismissedAt: new Date(Date.now()).toISOString(),
        });
        this.save();
    }
    isDismissed(finding) {
        const ruleId = `${finding.category}:${finding.comment.slice(0, MAX_RULE_ID_COMMENT_LENGTH)}`;
        return this.dismissals.some((d) => d.ruleId === ruleId &&
            d.file === finding.file &&
            (d.line === null || d.line === finding.line));
    }
    filterDismissed(findings) {
        return findings.filter((f) => !this.isDismissed(f));
    }
    listDismissals() {
        return [...this.dismissals];
    }
    clearDismissals() {
        this.dismissals = [];
        this.save();
    }
}
//# sourceMappingURL=index.js.map