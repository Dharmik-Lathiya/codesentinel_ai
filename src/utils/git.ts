import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { resolve, sep } from "node:path";
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
  let nameStatus: string;
  try {
    nameStatus = await git(
      ["diff", "--name-status", "--no-renames", baseRef === "HEAD" ? "HEAD" : baseRef + "..."],
      cwd,
    );
  } catch (err) {
    logger.warn(`Failed to collect diff against "${baseRef}":`, err);
    throw err;
  }

  const lines = nameStatus
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: { path: string; status: DiffFile["status"]; content: string }[] = [];
  for (const line of lines) {
    const [statusCode, path] = line.split(/\t/);
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    let content = "";
    if (status !== "deleted") {
      const root = resolve(cwd) + sep;
      const full = resolve(cwd, path);
      if (!full.startsWith(root)) {
        logger.warn(`Skipping path outside workspace: ${path}`);
        continue;
      }
      try {
        content = readFileSync(full, "utf8");
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
    }
    entries.push({ path, status, content });
  }

  return Promise.all(
    entries.map(async ({ path, status, content }) => {
      let diff = "";
      try {
        diff = await git(["diff", baseRef === "HEAD" ? "HEAD" : baseRef + "...", "--", path], cwd);
      } catch {
        logger.debug(`Could not collect diff for ${path}`);
      }
      return { path, status, content, diff };
    }),
  );
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
  try {
    for (const ref of candidates) {
      if (await refExists(ref, cwd)) return ref;
    }
  } catch (err) {
    logger.debug(`Could not resolve default base ref`, err);
  }
  // Fall back to a working-tree diff against HEAD when no base ref is available.
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
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code === "M") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
