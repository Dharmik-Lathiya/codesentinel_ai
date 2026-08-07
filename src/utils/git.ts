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
    throw new GitError(command, timedOut, err);
  }
}

/** Structured error carrying the git command and underlying exit code. */
export class GitError extends Error {
  readonly command: string;
  readonly exitCode: number | undefined;

  constructor(command: string, timedOut: boolean, cause: unknown) {
    const code = (cause as { code?: string | number }).code;
    const reason = timedOut
      ? `timed out after ${GIT_TIMEOUT_MS}ms`
      : typeof code === "number"
        ? `exited with code ${code}`
        : code != null
          ? `failed with ${String(code)}`
          : "failed";
    super(`git command ${reason}: ${command}`, { cause });
    this.name = "GitError";
    this.command = command;
    this.exitCode = typeof code === "number" ? code : undefined;
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

  // Phase 1: classify every NUL-terminated name/status record first. The -z
  // form keeps paths containing spaces, ` b/`, or newlines intact, so this is
  // the authoritative file list even when the patch headers are ambiguous.
  const pending: Array<{
    path: string;
    status: DiffFile["status"];
    full?: string;
  }> = [];
  const nameStatusEntries = nameStatus.split("\0");
  for (let i = 0; i + 1 < nameStatusEntries.length; i += 2) {
    const statusCode = nameStatusEntries[i];
    const path = nameStatusEntries[i + 1];
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    if (status === "deleted") {
      pending.push({ path, status });
      continue;
    }
    const full = resolve(workspaceRoot, path);
    const rel = relative(workspaceRoot, full);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      logger.warn(`Skipping path outside workspace: ${path}`);
      continue;
    }
    pending.push({ path, status, full });
  }

  // Phase 2: read all file contents in parallel for large changesets.
  const contents = await Promise.all(
    pending.map(async ({ path, status, full }) => {
      let content = "";
      if (full) {
        try {
          content = await readContent(full, baseRef, cwd);
        } catch {
          logger.debug(`Could not read content for ${path}`);
        }
      }
      return { path, status, content };
    }),
  );

  // Phase 3: validate every non-deleted entry has a matching diff entry.
  const missingDiffs = contents.filter(
    ({ path, status }) => status !== "deleted" && !diffByPath.has(path),
  );
  for (const { path } of missingDiffs) {
    logger.warn(`Could not collect diff for ${path}`);
  }
  return contents.map(({ path, status, content }) => ({
    path,
    status,
    content,
    diff: diffByPath.get(path) ?? "",
  }));
}

function splitDiffByPath(diffText: string): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const part of diffText.split(/(?=^diff --git )/m)) {
    if (!part.startsWith("diff --git ")) continue;
    const firstLine = part.slice("diff --git ".length).split("\n", 1)[0];
    const match = /^(?:a\/)?(.*) b\/(.*)$/.exec(firstLine);
    if (!match) {
      logger.warn(`Skipping diff with unparseable header: ${firstLine}`);
      continue;
    }
    const path = match[2] === "dev/null" ? match[1] : match[2];
    byPath.set(path, part);
  }
  return byPath;
}

async function readContent(
  full: string,
  baseRef?: string,
  cwd?: string,
): Promise<string> {
  if (baseRef && cwd) {
    try {
      const rel = relative(cwd, full);
      if (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)) {
        const blob = await git(["show", `${baseRef}:${rel}`], cwd, {
          quiet: true,
        });
        if (!blob.includes("\0")) return blob;
      }
    } catch {
      logger.debug(
        `No committed blob for ${full} at ${baseRef}; falling back to working tree`,
      );
    }
  }
  let text: string;
  try {
    const fileStat = await stat(full);
    if (fileStat.size > MAX_CONTENT_BYTES) {
      logger.debug(`Skipping oversized file content: ${full}`);
      return "";
    }
    text = await readFile(full, { encoding: "utf8" });
  } catch (err) {
    logger.debug(`Could not read content for ${full}`, err);
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
  // In GitHub Actions, use the PR base branch
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    try {
      if (await refExists(remoteBase, cwd)) return remoteBase;
      if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
    } catch {
      logger.debug("Could not resolve refs from GITHUB_BASE_REF");
    }
  }

  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    try {
      if (await refExists(ref, cwd)) return ref;
    } catch {
      logger.debug(`Could not resolve ref ${ref}; trying next candidate`);
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
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
