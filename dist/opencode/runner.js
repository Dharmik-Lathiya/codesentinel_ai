import { setupOpenCode, runOpenCode } from "./installer.js";
import { logger } from "../utils/logger.js";
export async function runReview(files, options) {
    const { version, cwd } = options ?? {};
    let installResult;
    try {
        installResult = await setupOpenCode(version);
    }
    catch (err) {
        throw new Error(`OpenCode binary is not available: ${err instanceof Error ? err.message : String(err)}`);
    }
    const { binaryPath } = installResult;
    const args = ["run", "--auto", "--format", "jsonl", ...files];
    logger.info(`OpenCode: running review with ${binaryPath}`);
    logger.info(`OpenCode: args: ${args.join(" ")}`);
    try {
        const rawOutput = runOpenCode(binaryPath, args, { cwd });
        return { rawOutput, exitCode: 0, binaryPath };
    }
    catch (err) {
        const execError = err;
        const rawOutput = execError.stderr ?? "";
        logger.error(`OpenCode: review failed: ${execError.message}`);
        return { rawOutput, exitCode: execError.status ?? 1, binaryPath };
    }
}
//# sourceMappingURL=runner.js.map