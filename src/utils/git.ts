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
const DEFAULT_CONCURRENCY = 10;
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
  /** Full (post-change) content of the file, or null if it could not be read. */
  content: string | null;
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
  const baseRef = base && (await refExists(base, cwd)) ? base : await defaultBaseRef(cwd);
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

  const pending: { path: string; status: DiffFile["status"]; diff: string }[] = [];
  const nameStatusEntries = nameStatus.split("\0");
  for (let i = 0; i < nameStatusEntries.length - 1; i += 2) {
    const statusCode = nameStatusEntries[i];
    const path = nameStatusEntries[i + 1];
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    const diff = diffByPath.get(path) ?? "";
    if (!diff && status !== "deleted") {
      logger.warn(`Could not collect diff for ${path}`);
    }
    pending.push({ path, status, diff });
  }

  const contents = await loadContents(pending, workspaceRoot);
  const contentByPath = new Map(
    contents.filter((c) => !c.skipped).map((c) => [c.path, c.content]),
  );

  const files: DiffFile[] = [];
  for (const entry of pending) {
    if (entry.status !== "deleted" && !contentByPath.has(entry.path)) continue;
    files.push({
      path: entry.path,
      status: entry.status,
      content: contentByPath.get(entry.path) ?? null,
      diff: entry.diff,
    });
  }
  return files;
}

/** Load file contents concurrently, skipping paths outside the workspace. */
async function loadContents(
  pending: { path: string; status: DiffFile["status"] }[],
  workspaceRoot: string,
): Promise<{ path: string; content: string | null; skipped: boolean }[]> {
  return mapWithConcurrency(pending, async (entry) => {
    if (entry.status === "deleted") {
      return { path: entry.path, content: null, skipped: false };
    }
    if (!isPathInsideWorkspace(workspaceRoot, entry.path)) {
      logger.warn(`Skipping path outside workspace: ${entry.path}`);
      return { path: entry.path, content: null, skipped: true };
    }
    const full = resolve(workspaceRoot, entry.path);
    try {
      return {
        path: entry.path,
        content: await readContent(full),
        skipped: false,
      };
    } catch {
      logger.debug(`Could not read content for ${entry.path}`);
      return { path: entry.path, content: null, skipped: false };
    }
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit = DEFAULT_CONCURRENCY,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    let index: number;
    while ((index = next++) < items.length) {
      results[index] = await fn(items[index]);
    }
  };
  const count = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

/** True when `path` (relative or absolute) resolves inside `root`. */
export function isPathInsideWorkspace(root: string, path: string): boolean {
  const full = resolve(root, path);
  const rel = relative(root, full);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Split a unified diff into per-file patches keyed by post-change path. */
export function splitDiffByPath(diffText: string): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const part of diffText.split(/(?=^diff --git )/m)) {
    if (!part.startsWith("diff --git ")) continue;
    const firstLine = part.slice("diff --git ".length).split("\n", 1)[0];
    const path = pathFromDiffHeader(firstLine);
    if (path === undefined) continue;
    byPath.set(path, part);
  }
  return byPath;
}

/** Parse the post-change path out of a `diff --git` header line. */
function pathFromDiffHeader(header: string): string | undefined {
  if (header.startsWith('"')) {
    const quoted = /^("(?:[^"\\]|\\.)*") ("(?:[^"\\]|\\.)*")$/.exec(header);
    if (!quoted) return undefined;
    const oldPath = stripPrefix(unquoteCString(quoted[1]));
    const newPath = stripPrefix(unquoteCString(quoted[2]));
    return newPath === "dev/null" ? oldPath : newPath;
  }
  const match = /^(?:a\/)?(.*) b\/(.*)$/.exec(header);
  if (!match) return undefined;
  return match[2] === "dev/null" ? match[1] : match[2];
}

function stripPrefix(label: string): string {
  if (label.startsWith("a/")) return label.slice(2);
  if (label.startsWith("b/")) return label.slice(2);
  return label;
}

/** C-quoting-aware unquoting of the labels in a `diff --git` header. */
function unquoteCString(label: string): string {
  if (label.length < 2 || label[0] !== '"' || label[label.length - 1] !== '"') {
    return label;
  }
  const body = label.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== "\\") {
      bytes.push(ch.charCodeAt(0));
      continue;
    }
    const next = body[i + 1];
    if (next === undefined) {
      bytes.push(ch.charCodeAt(0));
      continue;
    }
    i++;
    switch (next) {
      case "n": bytes.push(0x0a); break;
      case "t": bytes.push(0x09); break;
      case "r": bytes.push(0x0d); break;
      case "a": bytes.push(0x07); break;
      case "b": bytes.push(0x08); break;
      case "f": bytes.push(0x0c); break;
      case "v": bytes.push(0x0b); break;
      case "\\": bytes.push(0x5c); break;
      case '"': bytes.push(0x22); break;
      default:
        if (next >= "0" && next <= "7") {
          let octal = next;
          while (
            octal.length < 3 &&
            i + 1 < body.length &&
            body[i + 1] >= "0" &&
            body[i + 1] <= "7"
          ) {
            octal += body[i + 1];
            i++;
          }
          bytes.push(parseInt(octal, 8));
        } else {
          for (const c of next) bytes.push(c.charCodeAt(0));
        }
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

export async function readContent(full: string): Promise<string | null> {
  const fileStat = await stat(full);
  if (fileStat.size > MAX_CONTENT_BYTES) {
    logger.debug(`Skipping oversized file content: ${full}`);
    return null;
  }
  const text = await readFile(full, { encoding: "utf8" });
  if (text.includes("\0")) {
    logger.debug(`Skipping binary file content: ${full}`);
    return null;
  }
  return text;
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string | undefined> {
  // In GitHub Actions, use the PR base branch
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    try {
    if (await refExists(remoteBase, cwd)) return remoteBase;
    if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
    } catch {
      logger.debug(`Could not check base refs for ${githubBaseRef}`);
    }
  }

  // On push events GITHUB_BASE_REF is unset; compare against the previous commit.
  if (process.env.GITHUB_EVENT_NAME === "push") {
    const before = process.env.GITHUB_BEFORE;
    const emptySha = "0000000000000000000000000000000000000000";
    if (before && before !== emptySha && (await refExists(before, cwd))) {
      return before;
    }
  }

  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    try {
      if (await refExists(ref, cwd)) return ref;
    } catch {
      logger.debug(`Could not check ref ${ref}`);
    }
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
