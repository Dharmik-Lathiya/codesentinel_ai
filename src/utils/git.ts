import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER = 64 * MEGABYTE;
const MAX_FILE_SIZE = 5 * MEGABYTE;

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
 *
 * `cwd` must be the repository root; git emits paths relative to the repo top.
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
  const diffBase = baseRef === "HEAD" ? "HEAD" : baseRef + "...";
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

  const lines = nameStatus
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const root = resolve(cwd);
  const entries = await Promise.all(
    lines.map(async (line) => {
      const [statusCode, path] = line.split(/\t/);
      if (!statusCode || !path) return null;
      const status = mapStatus(statusCode);
      if (!status) return null;
      let content = "";
      if (status !== "deleted") {
        const full = resolve(cwd, path);
        if (!full.startsWith(root)) {
          logger.warn(`Skipping path outside workspace: ${path}`);
          return null;
        }
        try {
          const st = await stat(full);
          if (st.size > MAX_FILE_SIZE) {
            logger.debug(`Skipping oversized file ${path} (${st.size} bytes)`);
          } else {
            content = await readFile(full, "utf8");
          }
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
  return entries.filter((e): e is DiffFile => e !== null);
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
  // Fall back to comparing against HEAD (no remote base ref found).
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
  if (code === "M" || code === "T") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
