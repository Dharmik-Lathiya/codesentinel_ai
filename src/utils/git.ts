import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const BYTES_PER_KILOBYTE = 1024;
const KILOBYTE = BYTES_PER_KILOBYTE;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER_MEGABYTES = 64;
const MAX_BUFFER = MAX_BUFFER_MEGABYTES * MEGABYTE;
const GIT_TIMEOUT_MS = 60_000;
const MAX_CONTENT_BYTES = MEGABYTE;
/**
 * Memoized result of `defaultBaseRef` so repeated `collectDiff` calls do not
 * re-spawn git merely to re-resolve the same base ref.
 */
let cachedBaseRef: string | undefined;
let baseRefResolved = false;


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
    if (!options.quiet) {
      logGitFailure(`git ${args.join(" ")}`, timedOut, err);
    }
    throw err;
  }
}

function logGitFailure(
  command: string,
  timedOut: boolean,
  err: unknown,
): void {
  logger.error(
    timedOut
      ? `git command timed out after ${GIT_TIMEOUT_MS}ms: ${command}`
      : `git command failed: ${command}`,
    err,
  );
}

/**
 * Log a git diff-collection failure, giving a clearer message when the output
 * exceeds the child-process buffer ceiling, then rethrow.
 */
function failCollect(
  opName: string,
  baseRef: string | undefined,
  err: unknown,
): never {
  const maxBuffer =
    err instanceof Error &&
    (err as { code?: string }).code ===
      "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
  if (maxBuffer) {
    logger.warn(
      `git ${opName} output exceeded the ${MAX_BUFFER_MEGABYTES}MB buffer ` +
      `against "${baseRef ?? "working tree"}": change set too large.`,
    );
  } else {
    logger.warn(
      `Failed to run git ${opName} against "${baseRef ?? "working tree"}":`,
      err,
    );
  }
  throw err;
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
  try {
    baseRef = base ?? (await defaultBaseRef(cwd));
  } catch {
    logger.debug("Failed to determine base ref; falling back to working-tree diff");
  }
  if (!(await refExists("HEAD", cwd))) {
    logger.warn(
      "Repository has no commits yet (unborn HEAD); nothing to diff.",
    );
    return [];
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
    failCollect("diff --name-status", baseRef, err);
  }

  const workspaceRoot = resolve(cwd);

  let diffText: string;
  try {
    diffText = await git(
      ["-c", "core.quotepath=false", "diff", "--no-renames", ...rangeArgs],
      cwd,
    );
  } catch (err) {
    failCollect("diff --no-renames", baseRef, err);
  }
  const diffByPath = splitDiffByPath(diffText);

  const files: DiffFile[] = [];
  const nameStatusEntries = nameStatus.split("\0");
  // git -z NUL-terminates each --name-status record, so the trailing NUL
  // leaves an empty last element that `length - 1` skips. Keep the bound
  // in case a future version stops emitting the trailing NUL.

  for (let i = 0; i < nameStatusEntries.length - 1; i += 2) {
    const statusCode = nameStatusEntries[i];
    const path = nameStatusEntries[i + 1];
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    let content = "";
    if (status !== "deleted") {
      const full = resolve(workspaceRoot, path);
      const rel = relative(workspaceRoot, full);
      if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
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

/**
 * Split combined git diff --no-renames output into per-file diffs.
 *
 * Only the statuses these calls produce (added/modified/deleted) are
 * handled here. If rename support is ever needed, key the map by
 * `match[1] || match[2]` (rename lines differ in the a/ and b/ paths)
 * and reconcile with the actual status.
 */

function splitDiffByPath(diffText: string): Map<string, string> {
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

async function readContent(full: string): Promise<string> {
  let fileStat: { size: number };
  try {
    fileStat = await stat(full);
  } catch {
    logger.debug(`Could not stat file: ${full}`);
    return "";
  }
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

/** Determine a sensible base ref (main/master/develop or origin/HEAD). */
async function defaultBaseRef(cwd: string): Promise<string | undefined> {
  // In GitHub Actions, use the PR base branch
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    if (await refExists(remoteBase, cwd)) return remoteBase;
    if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
  }

  if (baseRefResolved) return cachedBaseRef;

  // One for-each-ref call instead of up to 5 rev-parse spawns; set-compare
  // against the candidates in the same precedence as before.
  const available = await existingRefs(cwd);
  const candidates = ["origin/main", "origin/master", "main", "master"];
  cachedBaseRef = candidates.find((ref) => available.has(ref));
  baseRefResolved = true;
  // No base ref found: fall back to a plain working-tree diff.
  return cachedBaseRef;
}

/**
 * List local branches and the origin/HEAD default ref in a single git call.
 */
async function existingRefs(cwd: string): Promise<Set<string>> {
  try {
    const out = await git(
      [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
        "refs/remotes/origin/HEAD",
      ],
      cwd,
      { quiet: true },
    );
    return new Set(out.split("\n").filter(Boolean));
  } catch {
    logger.debug("Failed to list refs");
    return new Set();
  }
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
  if (code === "M") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
