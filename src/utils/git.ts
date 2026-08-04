import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER = 64 * MEGABYTE;
const GIT_TIMEOUT_MS = 60_000;
const MAX_CONTENT_BYTES = MEGABYTE;
const MAX_TOTAL_CONTENT_BYTES = 32 * MEGABYTE;

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
    const errInfo = err as {
      killed?: boolean;
      signal?: string | null;
      code?: string | number | null;
    };
    const timedOut =
      err instanceof Error &&
      errInfo.killed === true &&
      errInfo.signal === "SIGTERM" &&
      errInfo.code == null;
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
  const nameStatusEntries = nameStatus.split("\0");
  const diffPaths = nameStatusEntries
    .filter((_, i) => i % 2 === 1)
    .filter(Boolean);
  const diffByPath = splitDiffByPath(diffText, diffPaths);

  const files: DiffFile[] = [];
  let totalContentBytes = 0;
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
      if (totalContentBytes < MAX_TOTAL_CONTENT_BYTES) {
        try {
          content = await readContent(full);
          totalContentBytes += content.length;
        } catch {
          logger.debug(`Could not read content for ${path}`);
        }
      } else {
        logger.warn(
          `Skipping content for ${path}: total content budget (${MAX_TOTAL_CONTENT_BYTES} bytes) exceeded`,
        );
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

function splitDiffByPath(
  diffText: string,
  knownPaths: string[],
): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const part of diffText.split(/(?=^diff --git )/m)) {
    if (!part.startsWith("diff --git ")) continue;
    const firstLine = part.slice("diff --git ".length).split("\n", 1)[0];
    const header = unquoteHeader(firstLine);
    const path = knownPaths.find((p) => header === `a/${p} b/${p}`);
    if (!path) continue;
    byPath.set(path, part);
  }
  return byPath;
}

function unquoteHeader(line: string): string {
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') continue;
    if (ch === "\\" && i + 1 < line.length) {
      const esc = line[i + 1];
      if (esc >= "0" && esc <= "7") {
        const octal = line.slice(i + 1, i + 4);
        if (/^[0-7]{3}$/.test(octal)) {
          out += String.fromCharCode(parseInt(octal, 8));
          i += 3;
        } else {
          out += esc;
          i++;
        }
      } else {
        switch (esc) {
          case "a": out += "\a"; break;
          case "b": out += "\b"; break;
          case "t": out += "\t"; break;
          case "n": out += "\n"; break;
          case "v": out += "\v"; break;
          case "f": out += "\f"; break;
          case "r": out += "\r"; break;
          case "\\": out += "\\\\"; break;
          case '"': out += '"'; break;
          default: out += esc;
        }
        i++;
      }
      continue;
    }
    out += ch;
  }
  return out;
}

async function readContent(full: string): Promise<string> {
  const fileStat = await lstat(full);
  if (fileStat.isSymbolicLink()) {
    logger.debug(`Skipping symlink file content: ${full}`);
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
  if (code === "M" || code === "T") return "modified";
  logger.warn(`Unknown git status code: ${code}`);
  return null;
}
