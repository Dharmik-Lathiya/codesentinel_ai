import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve, sep } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER_MB = 64;
const MAX_BUFFER = MAX_BUFFER_MB * MEGABYTE;
const DIFF_CONCURRENCY = 8;

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

/** Map async work over an array with bounded concurrency. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
  return results;
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
    if (baseRef) {
      nameStatus = await git(
        ["diff", "--name-status", "-z", "--no-renames", baseRef + "..."],
        cwd,
      );
    } else {
      const [tracked, staged] = await Promise.all([
        git(["diff", "--name-status", "-z", "--no-renames"], cwd),
        git(["diff", "--cached", "--name-status", "-z", "--no-renames"], cwd),
      ]);
      nameStatus = [tracked, staged].filter(Boolean).join("");
    }
  } catch (err) {
    logger.warn(`Failed to collect diff against "${baseRef ?? "working tree"}":`, err);
    return [];
  }

  const records = nameStatus.split("\0").filter(Boolean);
  const files: DiffFile[] = [];
  const root = resolve(cwd);
  for (let i = 0; i < records.length; i += 2) {
    const statusCode = records[i];
    const path = records[i + 1];
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    let content = "";
    if (status !== "deleted") {
      const full = resolve(cwd, path);
      if (full !== root && !full.startsWith(root + sep)) {
        logger.warn(`Skipping path outside workspace: ${path}`);
        continue;
      }
      try {
        content = await readFile(full, "utf8");
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
    }
    files.push({ path, status, content, diff: "" });
  }

  const diffs = await mapLimit(files, DIFF_CONCURRENCY, async (file) => {
    try {
      if (baseRef) {
        return await git(["diff", baseRef + "...", "--", file.path], cwd);
      }
      return await git(["diff", "--", file.path], cwd);
    } catch {
      logger.debug(`Could not collect diff for ${file.path}`);
      return "";
    }
  });
  for (let i = 0; i < files.length; i++) {
    files[i].diff = diffs[i];
  }
  return files;
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
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
    } catch {
      logger.debug(`Could not resolve base ref ${ref}`);
    }
  }
  // No base ref resolves; collectDiff falls back to the working tree.
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

function mapStatus(code: string): DiffFile["status"] | null {
  // collectDiff always passes --no-renames, so rename detection is off and
  // renames surface as delete+add pairs; "renamed" is unreachable here.
  switch (code) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "M":
    case "T":
      return "modified";
    default:
      logger.warn(`Unknown git status code: ${code}`);
      return null;
  }
}
