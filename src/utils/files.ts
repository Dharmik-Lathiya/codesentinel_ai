import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** Convert a glob pattern (subset) into a RegExp. Supports **, *, ?, {a,b}. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** matches across path separators
        re += ".*";
        i += 2;
        if (glob[i] === "/") i += 1;
        continue;
      }
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
      } else {
        const opts = glob.slice(i + 1, end).split(",");
        re += "(?:" + opts.map(escapeRe).join("|") + ")";
        i = end + 1;
        continue;
      }
    } else if (c === "." || c === "+" || c === "^" || c === "$") {
      re += "\\" + c;
    } else if (c === "/") {
      re += "/";
    } else {
      re += c;
    }
    i++;
  }
  return new RegExp("^" + re + "$");
}

function escapeRe(s: string): string {
  return s.replace(/[.+^$*?{}|\\]/g, "\\$&");
}

/** Recursively walk a directory yielding file paths (relative to root). */
export function walk(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(full);
      else out.push(relative(root, full));
    }
  }
  return out;
}

/** Read a .codesentinelignore file and return its patterns (one per line). */
export function readIgnoreFile(root: string): string[] {
  const ignorePath = resolve(root, ".codesentinelignore");
  if (!existsSync(ignorePath)) return [];
  try {
    const content = readFileSync(ignorePath, "utf8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  } catch {
    return [];
  }
}

/** Collect files under `root` matching include globs and not exclude globs. */
export function collectFiles(
  root: string,
  include: string[],
  exclude: string[],
): string[] {
  const ignorePatterns = readIgnoreFile(root);
  const allExclude = [...exclude, ...ignorePatterns];
  const incRe = include.map(globToRegExp);
  const excRe = allExclude.map(globToRegExp);
  const all = walk(root);
  return all.filter((rel) => {
    const normalized = rel.split("\\").join("/");
    if (!incRe.some((re) => re.test(normalized))) return false;
    if (excRe.some((re) => re.test(normalized))) return false;
    return true;
  });
}

/** Read a file as UTF-8 (returns "" on failure). */
export function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Map a file extension to a language label for prompt context. */
export function languageOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    go: "go",
    java: "java",
    rb: "ruby",
    rs: "rust",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
  };
  return map[ext] ?? "text";
}

/** Ensure a directory (and parents) exists. */
export function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}
