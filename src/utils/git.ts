import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

/** Run a git command in the given cwd, returning stdout. */
export async function git(args: string[], cwd = process.cwd()): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: MAX_BUFFER });
    return stdout;
  } catch (err) {
    logger.error(`git command failed: git ${args.join(' ')}`, err);
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
  let baseRef: string;
  if (base) {
    baseRef = base;
  } else {
    try {
      baseRef = await defaultBaseRef(cwd);
    } catch (err) {
      logger.error("Failed to determine default base ref", err);
      throw err;
    }
  }
  if (baseRef.startsWith("-")) {
    throw new Error(`Invalid base ref: ${baseRef}`);
  }
  if (!(await refExists(baseRef, cwd))) {
    throw new Error(`Base ref does not exist: ${baseRef}`);
  }
  // The three-dot form collapses to an empty diff when the base is HEAD, so
  // diff against the working tree directly in that fallback case.
  const diffBase = baseRef === "HEAD" ? baseRef : baseRef + "...";
  let nameStatus: string;
  try {
    nameStatus = await git(
      ["diff", "--name-status", "--no-renames", diffBase],
      cwd,
    );
  } catch (err) {
    logger.warn(`Failed to collect diff against "${baseRef}":`, err);
    return [];
  }

  const lines = nameStatus.split("\n").filter(Boolean);

  const files = await Promise.all(
    lines.map(async (line): Promise<DiffFile | null> => {
      const tab = line.indexOf("\t");
      if (tab < 0) return null;
      const statusCode = line.slice(0, tab);
      const path = line.slice(tab + 1);
      if (!statusCode || !path) return null;
      const status = mapStatus(statusCode);
      let content = "";
      if (status !== "deleted") {
        try {
          content = await readFile(resolve(cwd, path), "utf8");
        } catch {
          logger.debug(`Could not read content for ${path}`);
        }
      }
      let diff = "";
      try {
        diff = await git(["diff", diffBase, "--", path], cwd);
      } catch {
        logger.debug(`Could not collect diff for ${path}`);
      }
      return { path, status, content, diff };
    }),
  );
  return files.filter((f): f is DiffFile => f !== null);
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string> {
  // In GitHub Actions, use the PR base branch
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    if (await refExists(remoteBase, cwd)) return remoteBase;
    if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
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
    await git(["rev-parse", "--verify", ref], cwd);
    return true;
  } catch {
    logger.debug(`Ref ${ref} does not exist`);
    return false;
  }
}

function mapStatus(code: string): DiffFile["status"] {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  return "modified";
}
