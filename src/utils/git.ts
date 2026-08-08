import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
import { logger } from "./logger.js";
import { retry } from "./retry.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER = 64 * MEGABYTE;
const GIT_TIMEOUT_MS = 60_000;
const MAX_CONTENT_BYTES = MEGABYTE;

/** Matches transient git failures (lock contention, transient fs errors) that can be retried. */
function isRetryableGitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // A killed process means the command timed out; never mask that as retryable.
  if ((err as { killed?: boolean }).killed === true) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("index.lock") ||
    message.includes("cannot lock") ||
    message.includes("unable to lock") ||
    message.includes("another git process") ||
    message.includes("failed to lock") ||
    message.includes("eagain") ||
    message.includes("eintr") ||
    message.includes("econnreset") ||
    message.includes("temporarily unavailable")
  );
}

/** Run a git command in the given cwd, returning stdout. */
export async function git(
  args: string[],
  cwd = process.cwd(),
  options: { quiet?: boolean } = {},
): Promise<string> {
  try {
    const { stdout } = await retry(
      () =>
        exec("git", args, {
          cwd,
          maxBuffer: MAX_BUFFER,
          timeout: GIT_TIMEOUT_MS,
          killSignal: "SIGTERM",
        }),
      { shouldRetry: isRetryableGitError },
    );
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
  const rangeArgs = baseRef ? [baseRef + "..."] : ["HEAD"];
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

  if (baseRef === undefined) {
    const trackedPaths = new Set(files.map((f) => f.path));
    const untracked = await listUntrackedFiles(cwd);
    for (const path of untracked) {
      if (trackedPaths.has(path)) continue;
      const full = resolve(workspaceRoot, path);
      const rel = relative(workspaceRoot, full);
      if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
        logger.warn(`Skipping path outside workspace: ${path}`);
        continue;
      }
      let content = "";
      try {
        content = await readContent(full);
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
      files.push({ path, status: "added", content, diff: "" });
    }
  }
  return files;
}

function splitDiffByPath(diffText: string): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const part of diffText.split(/(?=^diff --git )/m)) {
    if (!part.startsWith("diff --git ")) continue;
    const firstLine = part.slice("diff --git ".length).split("\n", 1)[0];
    const parsed = parseDiffHeaderPaths(firstLine);
    if (!parsed) continue;
    const path = parsed.b === "dev/null" ? parsed.a : parsed.b;
    byPath.set(path, part);
  }
  return byPath;
}

/**
 * Parse `a/old-path b/new-path` (or git-quoted forms like
 * `"a/foo bar.ts" "b/foo bar.ts"`) from a diff header line.
 */
function parseDiffHeaderPaths(header: string): { a: string; b: string } | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < header.length) {
    while (i < header.length && header[i] === " ") i++;
    if (i >= header.length) break;
    if (header[i] === '"') {
      let token = "";
      for (i++; i < header.length && header[i] !== '"'; ) {
        if (header[i] === "\\") {
          const next = header[i + 1];
          if (next === "n") { token += "\n"; i += 2; }
          else if (next === "t") { token += "\t"; i += 2; }
          else if (next === "r") { token += "\r"; i += 2; }
          else if (next !== undefined && next >= "0" && next <= "7") {
            const oct = header.slice(i + 1, i + 4);
            if (oct.length === 3 && /^[0-7]{3}$/.test(oct)) {
              token += String.fromCharCode(parseInt(oct, 8));
              i += 4;
              continue;
            }
          }
          token += next ?? "";
          i += 2;
        } else {
          token += header[i];
          i++;
        }
      }
      i++;
      tokens.push(token);
    } else {
      const start = i;
      while (i < header.length && header[i] !== " ") i++;
      tokens.push(header.slice(start, i));
    }
  }
  if (tokens.length < 2) return null;
  const a = tokens[0].startsWith("a/") ? tokens[0].slice(2) : tokens[0];
  const b = tokens[1].startsWith("b/") ? tokens[1].slice(2) : tokens[1];
  return { a, b };
}

async function listUntrackedFiles(cwd: string): Promise<string[]> {
  try {
    const output = await git(
      [
        "-c",
        "core.quotepath=false",
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
      ],
      cwd,
      { quiet: true },
    );
    return output.split("\0").filter((p) => p.length > 0);
  } catch {
    logger.debug("Failed to list untracked files");
    return [];
  }
}

async function readContent(full: string): Promise<string> {
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(full);
  } catch {
    logger.debug(`Could not stat: ${full}`);
    return "";
  }
  if (fileStat.size > MAX_CONTENT_BYTES) {
    logger.debug(`Skipping oversized file content: ${full}`);
    return "";
  }
  let buf: Buffer;
  try {
    buf = await readFile(full);
  } catch {
    logger.debug(`Failed to read content of: ${full}`);
    return "";
  }
  if (buf.byteLength > MAX_CONTENT_BYTES) {
    logger.debug(`Skipping oversized file content: ${full}`);
    return "";
  }
  if (buf.includes(0)) {
    logger.debug(`Skipping binary file content: ${full}`);
    return "";
  }
  return buf.toString("utf8");
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string | undefined> {
  // In GitHub Actions, use the PR base branch
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    try {
      if (await refExists(remoteBase, cwd)) return remoteBase;
    } catch {
      logger.debug(`Failed to resolve base ref: ${remoteBase}`);
    }
    try {
      if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
    } catch {
      logger.debug(`Failed to resolve base ref: ${githubBaseRef}`);
    }
  }

  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    try {
      if (await refExists(ref, cwd)) return ref;
    } catch {
      logger.debug(`Failed to resolve base ref: ${ref}`);
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

function mapStatus(code: string): DiffFile["status"] | null {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  if (code === "M") return "modified";
  // Type-change (T) entries carry a diff; include them as best-effort entries.
  if (code.startsWith("T")) return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
