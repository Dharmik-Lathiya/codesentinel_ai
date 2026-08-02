import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER_MEGABYTES = 64;
const MAX_BUFFER = MAX_BUFFER_MEGABYTES * MEGABYTE;

/** Run a git command in the given cwd, returning stdout. */
export async function git(
  args: string[],
  cwd = process.cwd(),
  options: { quiet?: boolean } = {},
): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: MAX_BUFFER });
    return stdout;
  } catch (err) {
    if (!options.quiet) {
      logger.error(`git command failed: git ${args.join(' ')}`, err);
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
  let baseRef: string | null;
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
  if (!baseRef) {
    logger.info("No base ref resolved - falling back to working tree diff");
    return collectWorkingTreeDiff(cwd);
  }
  let nameStatus: string;
  try {
    nameStatus = await git(
      ["diff", "--name-status", "--no-renames", baseRef + "..."],
      cwd,
    );
  } catch (err) {
    logger.warn(`Failed to collect diff against "${baseRef}":`, err);
    return [];
  }

  const lines = nameStatus
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const files: DiffFile[] = [];
  for (const line of lines) {
    const [statusCode, path] = line.split(/\t/);
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    let content = "";
    if (status !== "deleted") {
      const full = resolve(cwd, path);
      const rel = relative(cwd, full);
      if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
        logger.warn(`Skipping path outside workspace: ${path}`);
        continue;
      }
      try {
        content = readFileSync(full, "utf8");
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
    }
    let diff = "";
    try {
      diff = await git(["diff", baseRef + "...", "--", path], cwd);
    } catch {
      logger.debug(`Could not collect diff for ${path}`);
    }
    files.push({ path, status, content, diff });
  }
  return files;
}

/** Determine a sensible base ref (main/master/develop), or null if none exists. */
async function defaultBaseRef(cwd: string): Promise<string | null> {
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
    try {
      if (await refExists(ref, cwd)) return ref;
    } catch (err) {
      logger.debug(`Could not check ref ${ref}`, err);
    }
  }
  // No known base ref - signal the caller to fall back to the working tree.
  return null;
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

/**
 * Collect changed files from the working tree: staged, unstaged, and
 * untracked changes. Used when no base ref can be resolved.
 */
async function collectWorkingTreeDiff(cwd: string): Promise<DiffFile[]> {
  let porcelain: string;
  let unstaged: string;
  let staged: string;
  try {
    [porcelain, unstaged, staged] = await Promise.all([
      git(["status", "--porcelain"], cwd),
      git(["diff", "--name-status", "--no-renames"], cwd),
      git(["diff", "--cached", "--name-status", "--no-renames"], cwd),
    ]);
  } catch (err) {
    logger.warn("Failed to collect working tree diff:", err);
    return [];
  }

  const statuses = new Map<string, DiffFile["status"]>();
  for (const line of unstaged.split("\n")) {
    const [code, path] = line.split(/\t/);
    const status = code ? mapStatus(code) : null;
    if (status && path) statuses.set(path, status);
  }
  for (const line of staged.split("\n")) {
    const [code, path] = line.split(/\t/);
    const status = code ? mapStatus(code) : null;
    if (status && path) statuses.set(path, status);
  }
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("?? ")) {
      const path = line.slice(3).trim();
      if (path) statuses.set(path, "added");
    }
  }

  const files: DiffFile[] = [];
  for (const [path, status] of statuses) {
    let content = "";
    if (status !== "deleted") {
      const full = resolve(cwd, path);
      const rel = relative(cwd, full);
      if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
        logger.warn(`Skipping path outside workspace: ${path}`);
        continue;
      }
      try {
        content = readFileSync(full, "utf8");
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
    }
    let diff = "";
    try {
      const [unstagedDiff, stagedDiff] = await Promise.all([
        git(["diff", "--", path], cwd),
        git(["diff", "--cached", "--", path], cwd),
      ]);
      diff = [unstagedDiff, stagedDiff].filter(Boolean).join("\n");
    } catch {
      logger.debug(`Could not collect diff for ${path}`);
    }
    files.push({ path, status, content, diff });
  }
  return files;
}

function mapStatus(code: string): DiffFile["status"] | null {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  if (code.startsWith("R")) return "renamed";
  if (code === "M") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
