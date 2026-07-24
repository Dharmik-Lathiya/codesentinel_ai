export interface OpenCodeInstallResult {
    binaryPath: string;
    version: string;
    cached: boolean;
}
export declare function setupOpenCode(version?: string): Promise<OpenCodeInstallResult>;
export declare function runOpenCode(binaryPath: string, args: string[], opts?: {
    cwd?: string;
    env?: Record<string, string>;
}): string;
