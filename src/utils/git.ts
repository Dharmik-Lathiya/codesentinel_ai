import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
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
  /** How `content` was produced: 'ok' | 'oversize' | 'binary' | 'unreadable'. */
  contentStatus: "ok" | "oversize" | "binary" | "unreadable";
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
  if (!baseRef && process.env.GITHUB_ACTIONS === "true") {
    throw new Error(
      'No git base ref found. In CI you must diff against a ref: pass an explicit base (e.g. collectDiff("origin/main")) or run "git fetch --unshallow" / "git fetch origin <base>" before collecting the diff, otherwise already-committed head changes are silently missed.',
    );
  }
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

  if (!baseRef) {
    await warnUntrackedFiles(cwd);
  }
  const workspaceRoot = await realpath(resolve(cwd));

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
  const nameStatusEntries = nameStatus.split("\0");
  const changes: Array<{ status: DiffFile["status"]; path: string }> = [];
  for (let i = 0; i < nameStatusEntries.length - 1; i += 2) {
    const statusCode = nameStatusEntries[i];
    const path = nameStatusEntries[i + 1];
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    changes.push({ status, path });
  }
  const knownPaths = new Set(changes.map((c) => c.path));
  const diffByPath = splitDiffByPath(diffText, knownPaths);

  const files: DiffFile[] = [];
  for (const { status, path } of changes) {
    if (status === "deleted") {
      const diff = diffByPath.get(path) ?? "";
      files.push({ path, status, content: "", contentStatus: "ok", diff });
      continue;
    }
    let full: string;
    try {
      full = await realpath(resolve(workspaceRoot, path));
    } catch {
      logger.debug(`Could not resolve real path for ${path}`);
      continue;
    }
    const rel = relative(workspaceRoot, full);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      logger.warn(
        `Skipping path outside workspace (symlink escape): ${path}`,
      );
      continue;
    }
    const { content, contentStatus } = await readContent(full);
    const diff = diffByPath.get(path) ?? "";
    if (!diff) {
      logger.warn(`Could not collect diff for ${path}`);
    }
    files.push({ path, status, content, contentStatus, diff });
  }
  return files;
}

export function splitDiffByPath(
  diffText: string,
  knownPaths: Set<string>,
): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const part of diffText.split(/(?=^diff --git )/m)) {
    if (!part.startsWith("diff --git ")) continue;
    const firstLine = part.slice("diff --git ".length).split("\n", 1)[0];
    const path = matchDiffHeader(firstLine, knownPaths);
    if (!path) continue;
    byPath.set(path, part);
  }
  return byPath;
}

function matchDiffHeader(
  header: string,
  knownPaths: Set<string>,
): string | undefined {
  for (const path of knownPaths) {
    const aPath = `a/${path}`;
    const bPath = `b/${path}`;
    if (header === `${aPath} ${bPath}`) return path;
    if (header === `/dev/null ${bPath}`) return path;
    if (header === `${aPath} /dev/null`) return path;
  }
  return undefined;
}

async function readContent(
  full: string,
): Promise<{ content: string; contentStatus: DiffFile["contentStatus"] }> {
  let text: string;
  try {
    const fileStat = await stat(full);
    if (fileStat.size > MAX_CONTENT_BYTES) {
      logger.debug(`Skipping oversized file content: ${full}`);
      return { content: "", contentStatus: "oversize" };
    }
    text = await readFile(full, { encoding: "utf8" });
  } catch (err) {
    logger.debug(`Could not read file: ${full}`, err);
    return { content: "", contentStatus: "unreadable" };
  }
  if (text.includes("\0")) {
    logger.debug(`Skipping binary file content: ${full}`);
    return { content: "", contentStatus: "binary" };
  }
  return { content: text, contentStatus: "ok" };
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string | undefined> {
  // In GitHub Actions, use the PR base branch
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    try {
      if (await refExists(remoteBase, cwd)) return remoteBase;
    } catch (err) {
      logger.debug(`Failed to check ref ${remoteBase}:`, err);
    }
    try {
      if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
    } catch (err) {
      logger.debug(`Failed to check ref ${githubBaseRef}:`, err);
    }
  }

  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    try {
      if (await refExists(ref, cwd)) return ref;
    } catch (err) {
      logger.debug(`Failed to check ref ${ref}:`, err);
    }
  }
  // No base ref found: fall back to a plain working-tree diff.
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

export function mapStatus(code: string): DiffFile["status"] | null {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  if (code === "M") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}

async function warnUntrackedFiles(cwd: string): Promise<void> {
  try {
    const untracked = await git(
      ["ls-files", "--others", "--exclude-standard"],
      cwd,
      { quiet: true },
    );
    const paths = untracked.split("\n").filter(Boolean);
    if (paths.length > 0) {
      logger.warn(
        `Working-tree diff: ${paths.length} untracked file(s) will be missing because they are not yet added to git: ${paths.slice(0, 5).join(", ")}${paths.length > 5 ? ", ..." : ""}`,
      );
    }
  } catch {
    logger.debug("Could not list untracked files");
  }
}
