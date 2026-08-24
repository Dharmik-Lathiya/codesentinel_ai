import type { Finding } from "../analyzer/index.js";
export interface LinterTool {
    name: string;
    detect(root: string): boolean;
    run(root: string, extraArgs: string[]): Finding[];
}
export declare function runLinters(root: string, config: {
    tools: string[];
    args: Record<string, string[]>;
}): Finding[];
