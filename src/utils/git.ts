import { execFile } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER = 64 * MEGABYTE;
const GIT_TIMEOUT_MS = 60_000;
const MAX_CONTENT_BYTES = MEGABYTE;

/** Run a git command in the given cwd, returning stdout. */
export async function git(
  args: string[],
  cwd = process.cwd(),
  options: { quiet?: boolean } = {},
): Promise<string> {
  try {
    const { stdout } = await exec("git", args, {
      cwd,
      maxBuffer: MAX_BUFFER,
      timeout: GIT_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    return stdout;
  } catch (err) {
    const timedOut = err instanceof Error && "killed" in err;
    const command = `git ${args.join(" ")}`;
    if (!options.quiet) {
      logger.error(
        timedOut
          ? `git command timed out after ${GIT_TIMEOUT_MS}ms: ${command}`
          : `git command failed: ${command}`,
        err,
      );
    }
    throw err;
  }
}

export interface DiffFile {
  /** Path of the file changed in the diff. */
  path: string;
  /** Unified diff text for this file. */
  diff: string;
  /** Full (post-change) content of the file, if it still exists. */
  content: string;
  /** Status: added | modified | deleted. */
  status: "added" | "modified" | "deleted";
}

/**
 * Collect the changed files for the current PR/branch relative to a base ref.
 * Falls back to the working tree diff when no base ref is supplied and no
 * upstream branch is configured.
 */
export async function collectDiff(
  base?: string,
  cwd = process.cwd(),
): Promise<DiffFile[]> {
  const baseRef = base ?? (await defaultBaseRef(cwd));
  let nameStatus: string;
  try {
    nameStatus = await git(
      ["diff", "--name-status", "--no-renames", baseRef + "..."],
      cwd,
    );
  } catch (err) {
    logger.warn(`Failed to collect diff against "${baseRef}":`, err);
    throw err;
  }

  const workspaceRoot = resolve(cwd);

  let diffText: string;
  try {
    diffText = await git(["diff", "--no-renames", baseRef + "..."], cwd);
  } catch (err) {
    logger.warn(`Failed to collect diff output against "${baseRef}":`, err);
    throw err;
  }
  const diffByPath = splitDiffByPath(diffText);

  const files: DiffFile[] = [];
  for (const line of nameStatus
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)) {
    const [statusCode, path] = line.split(/\t/);
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    let content = "";
    if (status !== "deleted") {
      const full = resolve(workspaceRoot, path);
      if (!full.startsWith(workspaceRoot)) {
        logger.warn(`Skipping path outside workspace: ${path}`);
        continue;
      }
      try {
        content = readContent(full);
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
    }
    const diff = diffByPath.get(path) ?? "";
    if (!diff && status !== "deleted") {
      logger.warn(`Could not collect diff for ${path}`);
    }
    files.push({ path, status, content, diff });
  }
  return files;
}

function splitDiffByPath(diffText: string): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const part of diffText.split(/(?=^diff --git )/m)) {
    if (!part.startsWith("diff --git ")) continue;
    const firstLine = part.slice("diff --git ".length).split("\n", 1)[0];
    const match = /^(?:a\/)?(.+?)\s+b\//.exec(firstLine);
    if (!match) continue;
    byPath.set(match[1], part);
  }
  return byPath;
}

function readContent(full: string): string {
  const stat = statSync(full);
  if (stat.size > MAX_CONTENT_BYTES) {
    logger.debug(`Skipping oversized file content: ${full}`);
    return "";
  }
  const buffer = readFileSync(full);
  if (buffer.includes(0)) {
    logger.debug(`Skipping binary file content: ${full}`);
    return "";
  }
  return buffer.toString("utf8");
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string> {
  // In GitHub Actions, use the PR base branch
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    try {
      if (await refExists(remoteBase, cwd)) return remoteBase;
      if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
    } catch {
      logger.debug(`Could not resolve base ref ${githubBaseRef}`);
    }
  }

  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    if (await refExists(ref, cwd)) return ref;
  }
  // Fall back to merge-base with the default remote branch.
  return "HEAD";
}

async function refExists(ref: string, cwd: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--verify", ref], cwd, { quiet: true });
    return true;
  } catch {
    logger.debug(`Ref ${ref} does not exist`);
    return false;
  }
}

function mapStatus(code: string): DiffFile["status"] | null {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  if (code === "M") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
