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
const CONCURRENCY = 8;

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
 *
 * Note: when a base ref is used, only committed changes are diffed; any
 * uncommitted working-tree edits are skipped.
 */
export async function collectDiff(
  base?: string,
  cwd = process.cwd(),
): Promise<DiffFile[]> {
  const baseRef = base ?? (await defaultBaseRef(cwd));
  const rangeArgs = baseRef ? [baseRef + "..."] : [];
  let rawStatus: string;
  try {
    rawStatus = await git(
      [
        "-c",
        "core.quotepath=false",
        "diff",
        "--raw",
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
  const realWorkspaceRoot = await realpath(workspaceRoot).catch(
    () => workspaceRoot,
  );

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

  const entries = parseRawStatus(rawStatus);
  const results: (DiffFile | null)[] = [];
  const queue = entries.map(({ code, path }, index) => ({
    status: mapStatus(code),
    path,
    index,
  }));
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      if (!item.status) {
        results[item.index] = null;
        continue;
      }
      let content = "";
      if (item.status !== "deleted") {
        const full = resolve(workspaceRoot, item.path);
        const real = await realpath(full).catch(() => full);
        const rel = relative(realWorkspaceRoot, real);
        if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
          logger.warn(`Skipping path outside workspace: ${item.path}`);
          results[item.index] = null;
          continue;
        }
        try {
          content = await readContent(full);
        } catch {
          logger.warn(`Could not read content for ${item.path}`);
          content = "";
        }
      }
      let diff = diffByPath.get(item.path) ?? "";
      if (!diff && item.status !== "deleted") {
        diff = await collectDiffForPath(item.path, rangeArgs, cwd);
        if (!diff) logger.warn(`Could not collect diff for ${item.path}`);
      }
      results[item.index] = {
        path: item.path,
        status: item.status,
        content,
        diff,
      };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker),
  );

  const files: DiffFile[] = [];
  for (const result of results) if (result) files.push(result);
  return files;
}

function parseRawStatus(raw: string): { code: string; path: string }[] {
  const records: { code: string; path: string }[] = [];
  const tokens = raw.split("\0");
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const header = tokens[i];
    const path = tokens[i + 1];
    if (!header || !path) continue;
    const spaceIdx = header.lastIndexOf(" ");
    if (spaceIdx < 0) continue;
    const code = header.slice(spaceIdx + 1);
    if (!code) continue;
    records.push({ code, path });
  }
  return records;
}

async function collectDiffForPath(
  path: string,
  rangeArgs: string[],
  cwd: string,
): Promise<string> {
  try {
    return await git(
      ["-c", "core.quotepath=false", "diff", "--no-renames", ...rangeArgs, "--", path],
      cwd,
    );
  } catch (err) {
    logger.warn(`Failed to collect diff for ${path}:`, err);
    return "";
  }
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
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    if (await refExists(remoteBase, cwd)) return remoteBase;
    if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
  }

  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    if (await refExists(ref, cwd)) return ref;
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
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
