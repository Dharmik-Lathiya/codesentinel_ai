import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "./logger.js";
const exec = promisify(execFile);
/** Run a git command in the given cwd, returning stdout. */
export async function git(args, cwd = process.cwd()) {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
}
/**
 * Collect the changed files for the current PR/branch relative to a base ref.
 * Falls back to the working tree diff when no base ref is supplied and no
 * upstream branch is configured.
 */
export async function collectDiff(base, cwd = process.cwd()) {
    const baseRef = base || (await defaultBaseRef(cwd));
    let nameStatus;
    try {
        nameStatus = await git(["diff", "--name-status", "--no-renames", baseRef + "..."], cwd);
    }
    catch (err) {
        logger.warn(`Failed to collect diff against "${baseRef}":`, err);
        return [];
    }
    const lines = nameStatus
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const files = [];
    for (const line of lines) {
        const [statusCode, path] = line.split(/\t/);
        if (!statusCode || !path)
            continue;
        const status = mapStatus(statusCode);
        let content = "";
        if (status !== "deleted") {
            try {
                content = await git(["show", `:${path}`], cwd);
            }
            catch {
                logger.debug(`Could not read content for ${path}`);
            }
        }
        let diff = "";
        try {
            diff = await git(["diff", baseRef + "...", "--", path], cwd);
        }
        catch {
            logger.debug(`Could not collect diff for ${path}`);
        }
        files.push({ path, status, content, diff });
    }
    return files;
}
/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd) {
    // In GitHub Actions, use the PR base branch
    const githubBaseRef = process.env.GITHUB_BASE_REF;
    if (githubBaseRef) {
        const remoteBase = `origin/${githubBaseRef}`;
        if (await refExists(remoteBase, cwd))
            return remoteBase;
        if (await refExists(githubBaseRef, cwd))
            return githubBaseRef;
    }
    const candidates = ["origin/main", "origin/master", "main", "master"];
    for (const ref of candidates) {
        if (await refExists(ref, cwd))
            return ref;
    }
    // Fall back to merge-base with the default remote branch.
    return "HEAD";
}
async function refExists(ref, cwd) {
    try {
        await git(["rev-parse", "--verify", ref], cwd);
        return true;
    }
    catch {
        return false;
    }
}
function mapStatus(code) {
    if (code.startsWith("A"))
        return "added";
    if (code.startsWith("D"))
        return "deleted";
    if (code.startsWith("R"))
        return "renamed";
    return "modified";
}
//# sourceMappingURL=git.js.map