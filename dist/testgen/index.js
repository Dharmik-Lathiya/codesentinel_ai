import { writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { languageOf, ensureDir } from "../utils/files.js";
import { extractJson } from "../ai/provider.js";
/**
 * detectFunctions performs lightweight, language-agnostic detection of
 * top-level/explicitly-declared functions so we can find untested code. This is
 * heuristic (regex based) and intentionally fast/cheap.
 */
export function detectFunctions(root, files) {
    const testSet = new Set(files.map((f) => f.path).filter((p) => /\.(test|spec)\./.test(p)));
    const out = [];
    const fnRe = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;
    for (const { path, content } of files) {
        if (/\.(test|spec)\./.test(path))
            continue;
        const base = path.replace(/\.[^.]+$/, "");
        const hasTest = [...testSet].some((t) => t.startsWith(base));
        let m;
        fnRe.lastIndex = 0;
        while ((m = fnRe.exec(content)) !== null) {
            out.push({
                name: m[1],
                line: content.slice(0, m.index).split("\n").length,
                file: path,
                hasTest,
            });
        }
    }
    return out;
}
/**
 * TestGenerator uses the AI model to produce unit tests for source files that
 * lack coverage. It writes generated tests into a sibling `__tests__` folder
 * (or co-located, depending on runner conventions).
 */
export class TestGenerator {
    config;
    ai;
    prompts;
    constructor(config, ai, prompts) {
        this.config = config;
        this.ai = ai;
        this.prompts = prompts;
    }
    /**
     * Generate and save tests for the given source files. Returns the list of
     * written tests. Skips files that already appear to have tests unless
     * `force` is set.
     */
    async generate(root, files, opts = {}) {
        const detected = detectFunctions(root, files);
        const targets = detected.filter((d) => opts.force || !d.hasTest);
        const uniqueFiles = [...new Set(targets.map((d) => d.file))];
        const results = [];
        for (const rel of uniqueFiles) {
            const file = files.find((f) => f.path === rel);
            if (!file)
                continue;
            let gen;
            try {
                gen = await this.generateForFile(root, file);
            }
            catch (e) {
                console.error(`Failed to generate tests for ${rel}:`, e);
                continue;
            }
            if (gen)
                results.push(gen);
        }
        return results;
    }
    async generateForFile(root, file) {
        const framework = this.config.test_runner === "jest"
            ? "Jest with describe/it/expect"
            : "Vitest with describe/it/expect";
        const targetPath = this.testPathFor(root, file.path);
        const prompt = this.prompts.render("testgen", {
            test_runner: this.config.test_runner,
            test_framework: framework,
            file: file.path,
            language: languageOf(file.path),
            code: file.content,
            project_context: this.config.project_context || "(none)",
        });
        let res;
        try {
            res = await this.ai.complete("testgen", [
                { role: "system", content: "You generate precise unit tests." },
                { role: "user", content: prompt },
            ]);
        }
        catch (e) {
            console.error(`AI completion failed for ${file.path}:`, e);
            return null;
        }
        const parsed = extractJson(res.content);
        if (!parsed?.content)
            return null;
        const outPath = parsed.test_file_path
            ? resolve(root, parsed.test_file_path)
            : targetPath;
        ensureDir(dirname(outPath));
        writeFileSync(outPath, parsed.content, "utf8");
        return { file: file.path, testFilePath: relative(root, outPath), content: parsed.content };
    }
    /** Determine the conventional test file path for a source file. */
    testPathFor(root, srcPath) {
        const abs = resolve(root, srcPath);
        const dir = dirname(abs);
        const ext = srcPath.match(/\.([^.]+)$/)?.[1] ?? "ts";
        const base = srcPath.replace(/\.[^.]+$/, "");
        if (this.config.test_runner === "jest") {
            return join(dir, "__tests__", (base.split("/").pop() ?? "index") + `.test.${ext}`);
        }
        return join(root, base + `.test.${ext}`);
    }
}
/** Determine if a path's test already exists on disk. */
export function testExists(root, srcPath) {
    const base = srcPath.replace(/\.[^.]+$/, "");
    return existsSync(resolve(root, base + ".test.ts"));
}
//# sourceMappingURL=index.js.map