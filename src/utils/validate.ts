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
      validateNumberField(rule.field, value, rule.min, rule.max, errors);
    }

    if (rule.type === "regex" && rule.pattern) {
      try {
        new RegExp(rule.pattern);
      } catch {
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

function validateNumberField(
  field: string,
  value: unknown,
  min: number | undefined,
  max: number | undefined,
  errors: string[],
): void {
  const num = Number(value);
  if (isNaN(num)) {
    errors.push(`Field ${field} must be a number`);
    return;
  }
  if (min !== undefined && num <= min) {
    errors.push(`Field ${field} must be greater than ${min}`);
  }
  if (max !== undefined && num >= max) {
    errors.push(`Field ${field} must be less than ${max}`);
  }
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
  } catch (e) {
    return { valid: false, errors: [`Invalid JSON in file: ${(e as Error).message}`] };
  }
  return validateConfig(config, schema);
}
