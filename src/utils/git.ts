import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

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
    if (options.quiet) {
      logger.debug(`git command failed: git ${args.join(' ')}`, err);
    } else {
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
  const rangeArgs = baseRef === "HEAD" ? [] : [baseRef + "..."];

  let nameStatus: string;
  try {
    nameStatus = await git(
      ["diff", "--name-status", "--no-renames", ...rangeArgs],
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

  let treeDiff = "";
  try {
    treeDiff = await git(["diff", "--no-renames", ...rangeArgs], cwd);
  } catch {
    logger.debug("Could not collect tree diff");
  }
  const diffByPath = splitDiffByPath(treeDiff);

  const files: DiffFile[] = [];
  for (const line of lines) {
    const [statusCode, path] = line.split(/\t/);
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
    files.push({ path, status, content, diff: diffByPath.get(path) ?? "" });
  }
  return files;
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
    try {
      if (await refExists(ref, cwd)) return ref;
    } catch {
      logger.debug(`Could not check ref ${ref}`);
    }
  }
  // Fall back to the configured upstream branch.
  try {
    const upstream = await git(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      cwd,
      { quiet: true },
    );
    const branch = upstream.trim();
    if (branch) return branch;
  } catch {
    // no upstream configured
  }
  // Fall back to the working tree diff (collectDiff treats "HEAD" as unstaged).
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

/** Split a combined git diff into per-file diffs keyed by path. */
function splitDiffByPath(diffText: string): Map<string, string> {
  const byPath = new Map<string, string>();
  const chunks = diffText.split(/(?=^diff --git )/m);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const header = trimmed.split("\n")[0];
    const path = headerPath(header);
    if (path) byPath.set(path, chunk);
  }
  return byPath;
}

/** Extract the post-change path from a `diff --git` header line. */
function headerPath(header: string): string | undefined {
  const match = header.match(/^diff --git a\/.*? b\/(.*)$/);
  return match?.[1];
}

function mapStatus(code: string): DiffFile["status"] {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  return "modified";
}
