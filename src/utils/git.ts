import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Run a git command in the given cwd, returning stdout. */
export async function git(args: string[], cwd = process.cwd()): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export interface DiffFile {
  /** Path of the file changed in the diff. */
  path: string;
  /** Unified diff text for this file. */
  diff: string;
  /** Full (post-change) content of the file, if it still exists. */
  content: string;
  /** Status: added | modified | deleted | renamed. */
  status: "added" | "modified" | "deleted" | "renamed";
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
  const baseRef = base || (await defaultBaseRef(cwd));
  const nameStatus = await git(
    ["diff", "--name-status", "--no-renames", baseRef + "..."],
    cwd,
  ).catch(() => "");

  const lines = nameStatus
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const files: DiffFile[] = [];
  for (const line of lines) {
    const [statusCode, path] = line.split(/\t/);
    const status = mapStatus(statusCode);
    let content = "";
    if (status !== "deleted") {
      content = await git(["show", `:${path}`], cwd).catch(() => "");
    }
    const diff = await git(["diff", baseRef + "...", "--", path], cwd).catch(
      () => "",
    );
    files.push({ path, status, content, diff });
  }
  return files;
}

/** Determine a sensible base ref (main/master/develop or upstream merge-base). */
async function defaultBaseRef(cwd: string): Promise<string> {
  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    if (await refExists(ref, cwd)) return ref;
  }
  // Fall back to merge-base with the default remote branch.
  return "HEAD";
}

async function refExists(ref: string, cwd: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--verify", ref], cwd);
    return true;
  } catch {
    return false;
  }
}

function mapStatus(code: string): DiffFile["status"] {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  if (code.startsWith("R")) return "renamed";
  return "modified";
}
