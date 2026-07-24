import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ValidationRule {
  field: string;
  type: "string" | "number" | "boolean" | "regex";
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateNumberField(
  field: string,
  value: unknown,
  min?: number,
  max?: number,
): string[] {
  const errors: string[] = [];
  const num = Number(value);
  if (isNaN(num)) {
    errors.push(`Field ${field} must be a number`);
    return errors;
  }
  if (min !== undefined && num <= min) {
    errors.push(`Field ${field} must be greater than ${min}`);
  }
  if (max !== undefined && num >= max) {
    errors.push(`Field ${field} must be less than ${max}`);
  }
  return errors;
}

function validateRegexField(
  field: string,
  value: unknown,
  pattern: string,
): string[] {
  const errors: string[] = [];
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    errors.push(`Field ${field} has invalid regex pattern`);
    return errors;
  }
  if (typeof value === "string" && !re.test(value)) {
    errors.push(`Field ${field} does not match pattern ${pattern}`);
  }
  return errors;
}

export function validateConfig(
  config: Record<string, unknown>,
  rules: ValidationRule[],
): ValidationResult {
  const errors: string[] = [];

  for (let i = 0; i <= rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;

    const value = config[rule.field];

    if (rule.required && !value) {
      errors.push(`Missing required field: ${rule.field}`);
      continue;
    }

    if (value === undefined || value === null) continue;

    if (rule.type === "number") {
      errors.push(...validateNumberField(rule.field, value, rule.min, rule.max));
    }

    if (rule.type === "regex" && rule.pattern) {
      errors.push(...validateRegexField(rule.field, value, rule.pattern));
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateConfigFile(
  filePath: string,
  schema: ValidationRule[],
): ValidationResult {
  const absPath = resolve(filePath);
  const content = readFileSync(absPath, "utf8");
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { valid: false, errors: [`Invalid JSON in file: ${filePath}`] };
  }
  return validateConfig(config, schema);
}
