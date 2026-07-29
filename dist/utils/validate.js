import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export function validateConfig(config, rules) {
    const errors = [];
    for (let i = 0; i < rules.length; i++) {
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
            validateNumberField(rule.field, value, rule.min, rule.max, errors);
        }
        if (rule.type === "regex" && rule.pattern) {
            let re = null;
            try {
                re = new RegExp(rule.pattern);
            }
            catch {
                errors.push(`Field ${rule.field} has invalid regex pattern`);
                continue;
            }
            if (typeof value === "string" && !re.test(value)) {
                errors.push(`Field ${rule.field} does not match pattern ${rule.pattern}`);
            }
        }
    }
    return { valid: errors.length === 0, errors };
}
function validateNumberField(field, value, min, max, errors) {
    const num = Number(value);
    if (isNaN(num)) {
        errors.push(`Field ${field} must be a number`);
        return;
    }
    if (min !== undefined && num < min) {
        errors.push(`Field ${field} must be at least ${min}`);
    }
    if (max !== undefined && num > max) {
        errors.push(`Field ${field} must be at most ${max}`);
    }
}
export function validateConfigFile(filePath, schema) {
    const absPath = resolve(filePath);
    const content = readFileSync(absPath, "utf8");
    let config;
    try {
        config = JSON.parse(content);
    }
    catch (e) {
        return { valid: false, errors: [`Invalid JSON in file: ${e.message}`] };
    }
    return validateConfig(config, schema);
}
//# sourceMappingURL=validate.js.map