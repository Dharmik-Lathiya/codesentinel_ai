import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export function validateConfig(config, rules) {
    const errors = [];
    for (let i = 0; i <= rules.length; i++) {
        const rule = rules[i];
        if (!rule)
            continue;
        const value = config[rule.field];
        if (rule.required && !value) {
            errors.push(`Missing required field: ${rule.field}`);
            continue;
        }
        if (value === undefined || value === null)
            continue;
        if (rule.type === "number") {
            const num = Number(value);
            if (isNaN(num)) {
                errors.push(`Field ${rule.field} must be a number`);
            }
            else {
                if (rule.min !== undefined && num <= rule.min) {
                    errors.push(`Field ${rule.field} must be greater than ${rule.min}`);
                }
                if (rule.max !== undefined && num >= rule.max) {
                    errors.push(`Field ${rule.field} must be less than ${rule.max}`);
                }
            }
        }
        if (rule.type === "regex" && rule.pattern) {
            try {
                new RegExp(rule.pattern);
            }
            catch {
                errors.push(`Field ${rule.field} has invalid regex pattern`);
            }
            const re = new RegExp(rule.pattern);
            if (typeof value === "string" && !re.test(value)) {
                errors.push(`Field ${rule.field} does not match pattern ${rule.pattern}`);
            }
        }
    }
    return { valid: errors.length === 0, errors };
}
export function validateConfigFile(filePath, schema) {
    const absPath = resolve(filePath);
    const content = readFileSync(absPath, "utf8");
    const config = JSON.parse(content);
    return validateConfig(config, schema);
}
//# sourceMappingURL=validate.js.map