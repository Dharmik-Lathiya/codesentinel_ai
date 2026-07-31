import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = 1024 * BYTES_PER_KIB;
const MAX_BUFFER_MIB = 64;
const MAX_BUFFER = MAX_BUFFER_MIB * BYTES_PER_MIB;

/** Run a git command in the given cwd, returning stdout. */
export async function git(args: string[], cwd = process.cwd()): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: MAX_BUFFER });
    return stdout;
  } catch (err) {
    logger.error(`git command failed: git ${JSON.stringify(args)}`, err);
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
  /** Status: added | modified | deleted | renamed. */
  status: "added" | "modified" | "deleted" | "renamed";
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
    baseRef = await defaultBaseRef(cwd);
  }
  let nameStatus: string;
  try {
    nameStatus = await git(
      ["diff", "--name-status", "-z", "--no-renames", baseRef + "..."],
      cwd,
    );
  } catch (err) {
    logger.warn(`Failed to collect diff against "${baseRef}":`, err);
    return [];
  }

  const tokens = nameStatus.split("\0").filter(Boolean);

  const files: DiffFile[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const statusCode = tokens[i];
    const path = tokens[i + 1];
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    let content = "";
    if (status !== "deleted") {
      try {
        content = readFileSync(resolve(cwd, path), "utf8");
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
    }
    files.push({ path, status, content, diff: "" });
  }
  await Promise.all(
    files.map(async (file) => {
      try {
        file.diff = await git(["diff", baseRef + "...", "--", file.path], cwd);
      } catch {
        logger.debug(`Could not collect diff for ${file.path}`);
      }
    }),
  );
  return files;
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string> {
  // In GitHub Actions, use the PR base branch
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    try {
      if (await refExists(remoteBase, cwd)) return remoteBase;
    } catch {
      logger.debug(`Could not verify ref ${remoteBase}`);
    }
    try {
      if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
    } catch {
      logger.debug(`Could not verify ref ${githubBaseRef}`);
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
