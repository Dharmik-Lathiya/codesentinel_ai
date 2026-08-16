/** Mask string literal contents and line comments so literal text never matches code patterns. */
export function maskLiterals(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i += 1;
      while (i < line.length) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === "/" && line[i + 1] === "/") break;
    if (c === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      i = end === -1 ? line.length : end + 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** True for data files where numeric literals are values, not magic numbers. */
export function isDataFile(path: string): boolean {
  return /seed|fixture|mock|factory/i.test(path);
}