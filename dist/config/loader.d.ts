export interface ConfigOverride {
    path?: string;
    branch?: string;
    review?: {
        inline?: boolean;
    };
    fix?: {
        maxIterations?: number;
    };
}
export interface OpenCodeReviewerConfig {
    project?: {
        name?: string;
        description?: string;
        conventions?: string[];
        commandReference?: string;
    };
    review?: {
        customRules?: {
            id: string;
            pattern: string;
            severity: string;
            category: string;
            comment: string;
        }[];
        inline?: boolean;
    };
    fix?: {
        maxIterations?: number;
        runChecks?: string[];
        checkAllowlist?: string[];
    };
    audit?: {
        promptsDir?: string;
        categories?: string[];
        targetDirs?: string[];
        createIssues?: boolean;
        autoFix?: boolean;
    };
    learning?: {
        enabled?: boolean;
        metaReview?: boolean;
        patternDiscovery?: boolean;
    };
    overrides?: ConfigOverride[];
    mcpServers?: {
        name: string;
        type: "local" | "remote";
        command?: string[];
        url?: string;
        environment?: Record<string, string>;
    }[];
}
export declare function searchConfigPaths(cwd?: string): string | null;
export declare function loadYamlConfig(filePath: string): Record<string, unknown>;
export declare function getApplicableOverrides(overrides: ConfigOverride[] | undefined, filePath: string, branchName?: string): ConfigOverride[];
