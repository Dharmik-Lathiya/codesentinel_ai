export type HookType = "pre-commit" | "post-commit";
export declare function installHook(root: string, type?: HookType): string;
