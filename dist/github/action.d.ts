/**
 * GitHub Action entrypoint. Reads inputs from the environment (set by action.yml
 * as INPUT_<NAME>), runs the engine, posts PR comments and writes the job
 * summary + metrics. Designed to be dependency-light (uses fetch for API).
 */
export declare function runAction(): Promise<void>;
