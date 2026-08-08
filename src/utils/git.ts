import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER = 64 * MEGABYTE;
const GIT_TIMEOUT_MS = 60_000;
const MAX_CONTENT_BYTES = MEGABYTE;
const READ_LIMIT = 8;

function isMaxBufferError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as { code?: string }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
  );
}

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
    const oversized = isMaxBufferError(err);
    const command = `git ${args.join(" ")}`;
    if (!options.quiet) {
      if (timedOut) {
        logger.error(
          `git command timed out after ${GIT_TIMEOUT_MS}ms: ${command}`,
          err,
        );
      } else if (oversized) {
        logger.error(`git command output exceeds maxBuffer size: ${command}`, err);
      } else {
        logger.error(`git command failed: ${command}`, err);
      }
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

function parseNameStatus(
  nameStatus: string,
): Array<{ path: string; status: DiffFile["status"] }> {
  const entries: Array<{ path: string; status: DiffFile["status"] }> = [];
  const parts = nameStatus.split("\0");
  for (let i = 0; i < parts.length - 1; i += 2) {
    const statusCode = parts[i];
    const path = parts[i + 1];
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    entries.push({ path, status });
  }
  return entries;
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
  const workspaceRoot = resolve(cwd);
  let range = baseRef ? `${baseRef}...` : "";

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
        ...(range ? [range] : []),
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

  let entries = parseNameStatus(nameStatus);
  if (entries.length === 0 && baseRef) {
    // A triple-dot range can be empty when HEAD is already merged into the
    // base ref, silently producing a valid run with zero files.
    logger.warn(
      `No changes in "${baseRef}..."; retrying with a two-dot range "${baseRef}..".`,
    );
    range = `${baseRef}..`;
    try {
      nameStatus = await git(
        [
          "-c",
          "core.quotepath=false",
          "diff",
          "--name-status",
          "-z",
          "--no-renames",
          range,
        ],
        cwd,
      );
    } catch (err) {
      logger.warn(`Failed to collect two-dot diff against "${baseRef}":`, err);
      throw err;
    }
    if (entries.length === 0) {
      logger.warn(
        `No differences found between the checkout and "${baseRef}".`,
      );
    }
  }

  let diffByPath = new Map<string, string>();
  let perFileDiff = false;
  try {
    const diffText = await git(
      [
        "-c",
        "core.quotepath=false",
        "diff",
        "--no-renames",
        ...(range ? [range] : []),
      ],
      cwd,
    );
    diffByPath = splitDiffByPath(diffText);
  } catch (err) {
    if (!isMaxBufferError(err)) {
      logger.warn(
        `Failed to collect diff output against "${baseRef ?? "working tree"}":`,
        err,
      );
      throw err;
    }
    // Diff output exceeded the eager buffer limit: fall back to per-file diffs.
    perFileDiff = true;
  }

  const results: Array<DiffFile | undefined> = new Array(entries.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= entries.length) break;
      const { status, path } = entries[i];
      let diff = diffByPath.get(path) ?? "";
      if (!diff && perFileDiff) {
        try {
          diff = await git(
            [
              "-c",
              "core.quotepath=false",
              "diff",
              "--no-renames",
              ...(range ? [range] : []),
              "--",
              path,
            ],
            cwd,
          );
        } catch (err) {
          logger.warn(`Could not collect per-file diff for ${path}:`, err);
        }
      }
      if (!diff && status !== "deleted") {
        logger.warn(`Could not collect diff for ${path}`);
      }
      let content = "";
      if (status !== "deleted") {
        const full = resolve(workspaceRoot, path);
        const rel = relative(workspaceRoot, full);
        if (
          rel === "" ||
          rel === ".." ||
          rel.startsWith(`..${sep}`) ||
          isAbsolute(rel)
        ) {
          logger.warn(`Skipping path outside workspace: ${path}`);
          continue;
        }
        try {
          content = await readContent(full);
        } catch {
          logger.debug(`Could not read content for ${path}`);
        }
      }
      results[i] = { path, status, content, diff };
    }
  };
  const workers = Array.from(
    { length: Math.min(READ_LIMIT, entries.length) },
    () => worker(),
  );
  await Promise.all(workers);

  const files: DiffFile[] = [];
  for (const result of results) {
    if (result) files.push(result);
  }
  return files;
}

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
  const fileStat = await stat(full);
  if (fileStat.size > MAX_CONTENT_BYTES) {
    logger.debug(`Skipping oversized file content: ${full}`);
    return "";
  }
let text: string;
try {
  text = await readFile(full, { encoding: "utf8" });
} catch {
  logger.debug(`Skipping unreadable file content: ${full}`);
  return "";
}
if (text.includes("\0")) {
  logger.debug(`Skipping binary file content: ${full}`);
  return "";
}
return text;
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string | undefined> {
  try {
    // In GitHub Actions, use the PR base branch
    const githubBaseRef = process.env.GITHUB_BASE_REF;
    if (githubBaseRef) {
      const remoteBase = `origin/${githubBaseRef}`;
      if (await refExists(remoteBase, cwd)) return remoteBase;
      if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
    }

    const candidates = ["origin/main", "origin/master", "main", "master"];
    for (const ref of candidates) {
      if (await refExists(ref, cwd)) return ref;
    }
  } catch (err) {
    logger.warn(`Failed to determine base ref:`, err);
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
  if (code === "M" || code === "T" || code === "U") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
