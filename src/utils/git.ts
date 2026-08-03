import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
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
      killSignal: "SIGTERM",
    });
    return stdout;
  } catch (err) {
    const timedOut =
      err instanceof Error && (err as { killed?: boolean }).killed === true;
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
  const rangeArgs = baseRef ? [baseRef + "..."] : [];
  let nameStatus: string;
  try {
    nameStatus = await git(
      [
        "-c",
        "core.quotepath=false",
        "diff",
        "--name-status",
        "-z",
        "--no-renames",
        ...rangeArgs,
      ],
      cwd,
    );
  } catch (err) {
    logger.warn(
      `Failed to collect diff against "${baseRef ?? "working tree"}":`,
      err,
    );
    throw err;
  }

  const workspaceRoot = resolve(cwd);

  let diffText: string;
  try {
    diffText = await git(
      ["-c", "core.quotepath=false", "diff", "--no-renames", ...rangeArgs],
      cwd,
    );
  } catch (err) {
    logger.warn(
      `Failed to collect diff output against "${baseRef ?? "working tree"}":`,
      err,
    );
    throw err;
  }
  const diffByPath = splitDiffByPath(diffText);

  const files: DiffFile[] = [];
  const nameStatusEntries = nameStatus.split("\0");
  for (let i = 0; i < nameStatusEntries.length - 1; i += 2) {
    const statusCode = nameStatusEntries[i];
    const path = nameStatusEntries[i + 1];
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    let content = "";
    if (status !== "deleted") {
      const full = resolveInside(workspaceRoot, path);
      if (!full) {
        logger.warn(`Skipping path outside workspace: ${path}`);
        continue;
      }
      try {
        content = await readContent(full);
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

/** Resolve a repo-relative path inside workspaceRoot, or null if it escapes. */
export function resolveInside(
  root: string,
  path: string,
): string | null {
  const full = resolve(root, path);
  const rel = relative(root, full);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return full;
}

export function splitDiffByPath(diffText: string): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const part of diffText.split(/(?=^diff --git )/m)) {
    if (!part.startsWith("diff --git ")) continue;
    const firstLine = part.slice("diff --git ".length).split("\n", 1)[0];
    const match = /^(?:a\/)?(.*) b\/(.*)$/.exec(firstLine);
    if (!match) continue;
    const path = match[2] === "dev/null" ? match[1] : match[2];
    byPath.set(path, part);
  }
  return byPath;
}

export async function readContent(full: string): Promise<string> {
  const fileStat = await stat(full);
  if (fileStat.size > MAX_CONTENT_BYTES) {
    logger.debug(`Skipping oversized file content: ${full}`);
    return "";
  }
  const text = await readFile(full, { encoding: "utf8" });
  if (text.includes("\0")) {
    logger.debug(`Skipping binary file content: ${full}`);
    return "";
  }
  return text;
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string | undefined> {
  // In GitHub Actions, use the PR base branch
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  const existing = await existingRefs(cwd);
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    if (existing.has(remoteBase)) return remoteBase;
    if (existing.has(githubBaseRef)) return githubBaseRef;
  }

  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    if (existing.has(ref)) return ref;
  }
  // No base ref found: fall back to a plain working-tree diff.
  return undefined;
}

/** Return short local/remote branch names via a single for-each-ref call. */
async function existingRefs(cwd: string): Promise<Set<string>> {
  const refs = new Set<string>();
  try {
    const out = await git(
      ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"],
      cwd,
      { quiet: true },
    );
    for (const line of out.split("\n")) {
      const name = line.trim();
      if (!name) continue;
      refs.add(name.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\//, ""));
    }
  } catch {
    logger.debug("Failed to enumerate refs");
  }
  return refs;
}

export function mapStatus(code: string): DiffFile["status"] | null {
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code === "M") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
