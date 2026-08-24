import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER = 64 * MEGABYTE;
const MAX_CONTENT_BYTES = MEGABYTE;
const GIT_TIMEOUT_MS = 60_000;

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
    logger.error(`Failed to collect diff against "${baseRef}":`, err);
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
    let diff = "";
    if (status !== "deleted") {
      const full = resolve(workspaceRoot, path);
      const rel = relative(workspaceRoot, full);
      if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
        logger.warn(`Skipping path outside workspace: ${path}`);
        continue;
      }
      try {
        const raw = await readFile(resolve(cwd, path));
        if (raw.includes(0)) {
          diff = "Binary file (diff not shown)";
        } else {
          content = raw.toString("utf8");
        }
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
    }
    if (!diff) {
      try {
        diff = await git(["diff", baseRef + "...", "--", path], cwd);
      } catch {
        logger.debug(`Could not collect diff for ${path}`);
        continue;
      }
    }
    files.push({ path, status, content, diff });
  }
  return files;
}

function splitDiffByPath(diffText: string): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const part of diffText.split(/(?=^diff --git )/m)) {
    if (!part.startsWith("diff --git ")) continue;
    const firstLine = part.slice("diff --git ".length).split("\n", 1)[0];
    const paths = diffHeaderPaths(firstLine);
    if (!paths) continue;
    const path = paths.b === "dev/null" ? paths.a : paths.b;
    byPath.set(path, part);
  }
  return byPath;
}

/**
 * Extract the `a/<path>` and `b/<path>` paths from a `diff --git` header
 * line, decoding Git's C-style quoting so the returned paths are raw bytes
 * that align with `--name-status` / `--name-status -z` output.
 */
function diffHeaderPaths(header: string): { a: string; b: string } | null {
  const quoted = header.includes('"');
  if (!quoted) {
    const match = /^(?:a\/)?(.*) b\/(.*)$/.exec(header);
    if (!match) return null;
    return { a: match[1], b: match[2] };
  }
  const tokens: string[] = [];
  let i = 0;
  while (i < header.length) {
    if (header[i] === " ") {
      i++;
      continue;
    }
    if (header[i] === '"') {
      const token = unquoteGitToken(header, i);
      tokens.push(token.value);
      i = token.end;
    } else {
      const next = header.indexOf(" ", i);
      tokens.push(header.slice(i, next === -1 ? undefined : next));
      i = next === -1 ? header.length : next;
    }
  }
  if (tokens.length !== 2) return null;
  const a = tokens[0];
  const b = tokens[1];
  return {
    a: a.startsWith("a/") ? a.slice(2) : a,
    b: b.startsWith("b/") ? b.slice(2) : b,
  };
}

/** Decode a single Git C-quoted token starting at the opening double quote. */
function unquoteGitToken(
  source: string,
  start: number,
): { value: string; end: number } {
  let value = "";
  let i = start + 1;
  while (i < source.length && source[i] !== '"') {
    const ch = source[i];
    if (ch !== "\\") {
      value += ch;
      i++;
      continue;
    }
    const next = source[i + 1];
    let consumed = 2;
    if (next !== undefined && next >= "0" && next <= "7") {
      let octal = "";
      let j = i + 1;
      while (
        j < source.length &&
        octal.length < 3 &&
        source[j] >= "0" &&
        source[j] <= "7"
      ) {
        octal += source[j];
        j++;
      }
      value += String.fromCharCode(parseInt(octal, 8));
      consumed = j - i;
    } else {
      const escapes: Record<string, string> = {
        a: "\x07",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
        v: "\v",
        "\\": "\\",
        '"': '"',
      };
      value += escapes[next] ?? next;
    }
    i += consumed;
  }
  return {
    // Quoted tokens hold one character per raw byte; re-decode those bytes as
    // UTF-8 so the key matches the (UTF-8 decoded) --name-status output.
    value: Buffer.from(value, "latin1").toString("utf8"),
    end: Math.min(i + 1, source.length),
  };
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
  const fileStat = await stat(full);
  if (fileStat.size > MAX_CONTENT_BYTES) {
    logger.debug(`Skipping oversized file content: ${full}`);
    return "";
  }
  let text: string;
  try {
    text = await readFile(full, { encoding: "utf8" });
  } catch {
    logger.debug(`Failed to read content of: ${full}`);
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
    try {
      const remoteBase = `origin/${githubBaseRef}`;
      if (await refExists(remoteBase, cwd)) return remoteBase;
      if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
    } catch (err) {
      logger.warn(`Failed to resolve GitHub base ref ${githubBaseRef}`, err);
    }
  }

  const candidates = ["origin/main", "origin/master", "origin/develop", "main", "master"];
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
  return "modified";
}
