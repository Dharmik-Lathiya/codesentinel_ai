import type { Finding } from "../analyzer/index.js";

interface ExportInfo {
  name: string;
  file: string;
  line: number;
}

interface ImportInfo {
  source: string;
  names: (string | undefined)[];
}

function parseExports(path: string, content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const lines = content.split("\n");
  const exportRe = /^export\s+(?:default\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/;
  const namedExportRe = /^export\s+\{\s*([^}]+)\s*\}/;

  lines.forEach((line, idx) => {
    const match = line.match(exportRe);
    if (match) {
      exports.push({ name: match[1], file: path, line: idx + 1 });
    }
    const namedMatch = line.match(namedExportRe);
    if (namedMatch) {
      for (const n of namedMatch[1].split(",")) {
        const name = n.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) exports.push({ name, file: path, line: idx + 1 });
      }
    }
  });
  return exports;
}

function parseImports(path: string, content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const importRe = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g;
  const defaultImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRe.exec(content)) !== null) {
    imports.push({
      source: match[2],
      names: match[1].split(",").map((n) => n.trim().split(/\s+as\s+/).pop()?.trim() ?? "").filter(Boolean),
    });
  }
  while ((match = defaultImportRe.exec(content)) !== null) {
    imports.push({
      source: match[2],
      names: [match[1]],
    });
  }
  return imports;
}

/**
 * Detect unused exports across files.
 * Reports exports that are defined but never imported by any other file.
 */
export function detectDeadCode(
  files: { path: string; content: string }[],
): Finding[] {
  const allExports: ExportInfo[] = [];
  const allImports: ImportInfo[] = [];
  const fileMap = new Map<string, string>();

  for (const f of files) {
    fileMap.set(f.path, f.content);
    allExports.push(...parseExports(f.path, f.content));
    allImports.push(...parseImports(f.path, f.content));
  }

  const importedNames = new Set<string>();
  for (const imp of allImports) {
    for (const name of imp.names) if (name) importedNames.add(name);
  }

  const findings: Finding[] = [];
  for (const exp of allExports) {
    if (exp.name === "default") continue;
    if (!importedNames.has(exp.name)) {
      findings.push({
        severity: "medium",
        category: "smell",
        file: exp.file,
        line: exp.line,
        comment: `Exported symbol "${exp.name}" is never imported by any other file.`,
        suggestion: "Remove the export if this code is unused, or verify it's used externally.",
        source: "static",
      });
    }
  }

  return findings;
}
