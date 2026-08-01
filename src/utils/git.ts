import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER_MB = 64;
const MAX_BUFFER = MAX_BUFFER_MB * MEGABYTE;

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
  let baseRef: string | undefined;
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
  const baseArg = baseRef ? baseRef + "..." : undefined;
  let nameStatus: string;
  try {
    nameStatus = await git(
      [
        "-c",
        "core.quotepath=false",
        "diff",
        "--name-status",
        "--no-renames",
        ...(baseArg ? [baseArg] : []),
      ],
      cwd,
    );
  } catch (err) {
    logger.warn(
      `Failed to collect diff against "${baseRef ?? "working tree"}":`,
      err,
    );
    return [];
  }

  const lines = nameStatus
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const files: DiffFile[] = [];
  const root = resolve(cwd);
  for (const line of lines) {
    const [statusCode, path] = line.split(/\t/);
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    let content = "";
    if (status !== "deleted") {
      const full = resolve(cwd, path);
      const rel = relative(root, full);
      if (rel.startsWith("..") || isAbsolute(rel)) {
        logger.warn(`Skipping path outside workspace: ${path}`);
        continue;
      }
      try {
        content = await readFile(full, "utf8");
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
    }
    let diff = "";
    try {
      diff = await git(
        [
          "-c",
          "core.quotepath=false",
          "diff",
          ...(baseArg ? [baseArg] : []),
          "--",
          path,
        ],
        cwd,
      );
    } catch {
      logger.debug(`Could not collect diff for ${path}`);
    }
    files.push({ path, status, content, diff });
  }
  return files;
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string | undefined> {
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
    } catch {
      logger.debug(`Could not resolve base ref ${ref}`);
    }
  }
  // No candidate base ref found; fall back to the working-tree diff.
  return undefined;
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
  if (code === "M" || code === "T") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
