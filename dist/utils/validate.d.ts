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
export declare function validateConfig(config: Record<string, unknown>, rules: ValidationRule[]): ValidationResult;
export declare function validateConfigFile(filePath: string, schema: ValidationRule[]): ValidationResult;
