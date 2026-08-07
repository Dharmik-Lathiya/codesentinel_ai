import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
import { logger } from "./logger.js";

const exec = promisify(execFile);
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const MAX_BUFFER_MB = Number(process.env.GITSENTINEL_MAX_BUFFER_MB ?? 64) || 64;
const MAX_BUFFER = MAX_BUFFER_MB * MEGABYTE;
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
      err instanceof Error &&
      (err as { code?: string | null; signal?: string | null }).code === null &&
      (err as { code?: string | null; signal?: string | null }).signal === "SIGTERM";
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
  const jobs: Array<{ path: string; status: DiffFile["status"] }> = [];

  const nameStatusEntries = nameStatus.split("\0");
  for (let i = 0; i < nameStatusEntries.length - 1; i += 2) {
    const statusCode = nameStatusEntries[i];
    const path = nameStatusEntries[i + 1];
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    if (!status) continue;
    jobs.push({ path, status });
  }

  if (!baseRef) {
    let untracked = "";
    try {
      untracked = await git(
        ["-c", "core.quotepath=false", "ls-files", "--others", "--exclude-standard", "-z"],
        cwd,
      );
    } catch {
      logger.debug("Could not list untracked files");
    }
    for (const path of untracked.split("\0")) {
      if (path) jobs.push({ path, status: "added" });
    }
  }

  const outside = async (path: string): Promise<boolean> => {
    const full = await realpath(resolve(workspaceRoot, path));
    const rel = relative(workspaceRoot, full);
    return rel === "" || rel.startsWith("..") || isAbsolute(rel);
  };

  await Promise.all(
    jobs.map(async ({ path, status }) => {
      let content = "";
      if (status !== "deleted") {
        if (await outside(path)) {
          logger.warn(`Skipping path outside workspace: ${path}`);
          return;
        }
        try {
          content = await readContent(resolve(workspaceRoot, path));
        } catch {
          logger.debug(`Could not read content for ${path}`);
        }
      }
      const diff = diffByPath.get(path) ?? "";
      if (!diff && status !== "deleted") {
        logger.warn(`Could not collect diff for ${path}`);
      }
      files.push({ path, status, content, diff });
    }),
  );

  return files;
}

function splitDiffByPath(diffText: string): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const part of diffText.split(/(?=^diff --git )/m)) {
    if (!part.startsWith("diff --git ")) continue;
    const firstLine = part.slice("diff --git ".length).split("\n", 1)[0];
    const sep = firstLine.lastIndexOf(" b/");
    if (sep === -1) continue;
    const fromPath = unquotePath(firstLine.slice(0, sep)).replace(/^a\//, "");
    const toPath = unquotePath(firstLine.slice(sep + 3)).replace(/^b\//, "");
    const path = toPath === "dev/null" ? fromPath : toPath;
    byPath.set(path, part);
  }
  return byPath;
}
function unquotePath(s: string): string {
  if (s.length < 2 || s[0] !== '"') return s;
  let out = "";
  const simple: Record<string, string> = {
    a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", "\\": "\\", '"': '"',
  };
  let i = 1;
  const end = s.length - 1;
  while (i < end) {
    const ch = s[i];
    if (ch !== "\\") {
      out += ch;
      i += 1;
      continue;
    }
    const next = s[i + 1];
    if (next in simple) {
      out += simple[next];
      i += 2;
      continue;
    }
    const oct = s.slice(i + 1, i + 4);
    if (/^[0-7]{3}$/.test(oct)) {
      out += String.fromCharCode(parseInt(oct, 8));
      i += 4;
      continue;
    }
    out += next;
    i += 2;
  }
  return out;
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

  const candidates = ["origin/main", "origin/master", "origin/develop", "main", "master"];
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
