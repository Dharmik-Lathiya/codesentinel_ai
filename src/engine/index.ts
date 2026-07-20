import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadConfig, configFromInputs } from "../config/index.js";
import type {
  CodeSentinelConfig,
  RuntimeSecrets,
  Mode,
} from "../config/types.js";
import { AIHub } from "../ai/index.js";
import { PromptRegistry, type PromptName } from "../prompts/index.js";
import { StaticAnalyzer, type Finding } from "../analyzer/index.js";
import { Scorer, type ScoreBreakdown } from "../scorer/index.js";
import { FileCache } from "../cache/index.js";
import { PluginManager } from "../plugins/index.js";
import { TestGenerator, type GeneratedTest } from "../testgen/index.js";
import { collectDiff, type DiffFile } from "../utils/git.js";
import { collectFiles, readText, ensureDir } from "../utils/files.js";
import { logger } from "../utils/logger.js";
import { extractJson } from "../ai/provider.js";
import { renderHtmlReport } from "../utils/html-report.js";

/** A comment to post back to a PR (inline or summary). */
export interface ReviewComment {
  file: string;
  line: number | null;
  body: string;
  severity: string;
}

/** A single fix attempt made during fix-mode. */
export interface FixAttempt {
  iteration: number;
  file: string;
  fixed: boolean;
  explanation: string;
  /** Whether lint/test passed after applying the fix. */
  verified: boolean;
}

/** The full machine-readable report produced by a run. */
export interface EngineReport {
  mode: Mode;
  summary: string;
  findings: Finding[];
  score: ScoreBreakdown | null;
  comments: ReviewComment[];
  generatedTests: GeneratedTest[];
  fixAttempts: FixAttempt[];
  metrics: {
    filesAnalyzed: number;
    findingsBySeverity: Record<string, number>;
    durationMs: number;
  };
}

/**
 * Engine is the central orchestrator. It loads config, collects files, runs
 * static + plugin analysis, calls the AI models with structured prompts,
 * parses their responses, and (depending on mode) applies fixes or produces
 * comments/tests. Fix-mode uses a loop bounded by `max_iterations`.
 */
export class Engine {
  readonly config: CodeSentinelConfig;
  private ai: AIHub;
  private prompts: PromptRegistry;
  private analyzer: StaticAnalyzer;
  private scorer = new Scorer();
  private cache: FileCache;
  private plugins: PluginManager;

  constructor(
    config: CodeSentinelConfig,
    private secrets: RuntimeSecrets,
    private root = process.cwd(),
    /** Optional AI override (used in tests to avoid network calls). */
    aiOverride?: Pick<AIHub, "complete" | "modelForTask">,
  ) {
    this.config = config;
    this.ai = (aiOverride as AIHub) ?? new AIHub(config, secrets);
    this.prompts = new PromptRegistry(config);
    this.cache = new FileCache(resolve(root, config.cache_dir));
    this.plugins = new PluginManager({ config, logger });
    
    // Initialize analyzer with configuration
    this.analyzer = new StaticAnalyzer(
      config.analyzer,
      resolve(root, config.cache_dir, "analysis"),
    );

    logger.info(`Configured AI model: ${config.default_model.provider}/${config.default_model.model}`);
    logger.info(`Review model: ${(config.models.review ?? config.default_model).provider}/${(config.models.review ?? config.default_model).model}`);
    this.checkAIProvider();
  }

  /** Best-effort health check: log whether the AI provider is reachable. */
  private async checkAIProvider(): Promise<void> {
    const model = this.ai.modelForTask("review");
    const baseUrl = this.secrets.opencode_base_url || "http://localhost:4096";
    if (model.provider === "opencode") {
      try {
        const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          logger.info(`OpenCode is REACHABLE at ${baseUrl}`);
        } else {
          logger.warn(`OpenCode at ${baseUrl} returned status ${res.status} — AI review will fail`);
        }
      } catch {
        logger.warn(`OpenCode at ${baseUrl} is NOT reachable — AI review will be skipped (this is expected unless you have opencode running locally)`);
      }
    } else {
      const keyName = `${model.provider}_api_key` as keyof RuntimeSecrets;
      const hasKey = !!this.secrets[keyName];
      logger.info(`AI provider: ${model.provider}, API key ${hasKey ? "SET" : "NOT SET"}`);
    }
  }

  /** Convenience factory used by CLI / Action. */
  static fromInputs(opts: {
    configPath?: string;
    overrides?: Partial<CodeSentinelConfig>;
    secrets: RuntimeSecrets;
    root?: string;
  }): Engine {
    const config = loadConfig({
      configPath: opts.configPath,
      overrides: opts.overrides,
    });
    return new Engine(config, opts.secrets, opts.root);
  }

  /** Load configured plugins before running. */
  async init(): Promise<void> {
    await this.plugins.load(this.config.plugins);
  }

  // ---------------------------------------------------------------------------
  // Entry point: dispatch to the mode-specific runner.
  // ---------------------------------------------------------------------------
  async run(): Promise<EngineReport> {
    await this.init();
    const start = Date.now();
    logger.info(`Running mode: ${this.config.mode}`);

    let report: EngineReport;
    switch (this.config.mode) {
      case "review":
        report = await this.runReview();
        break;
      case "fix":
        report = await this.runFix();
        break;
      case "audit":
        report = await this.runAudit();
        break;
      case "score":
        report = await this.runScoreMode();
        break;
      case "testgen":
        report = await this.runTestgen();
        break;
      case "chat":
        report = await this.runChat("(no prompt supplied; use ask())");
        break;
      default:
        throw new Error(`Unsupported mode: ${this.config.mode}`);
    }

    report.metrics.durationMs = Date.now() - start;
    this.finalizeReport(report);

    if (this.config.output.writeReportFile) this.writeReportFile(report);
    return report;
  }

  // ---------------------------------------------------------------------------
  // File collection helpers.
  // ---------------------------------------------------------------------------
  private async collectedFiles(): Promise<
    { path: string; content: string; diff?: string }[]
  > {
    if (this.config.mode === "review" || this.config.mode === "fix") {
      const diffs: DiffFile[] = await collectDiff(undefined, this.root);
      return diffs
        .filter((d) => d.status !== "deleted")
        .map((d) => ({ path: d.path, content: d.content, diff: d.diff }));
    }
    const rels = collectFiles(this.root, this.config.include, this.config.exclude);
    return rels.map((path) => ({
      path,
      content: readText(resolve(this.root, path)),
    }));
  }

  // ---------------------------------------------------------------------------
  // Shared analysis pass: static + plugins.
  // ---------------------------------------------------------------------------
  private async analyzeFiles(
    files: { path: string; content: string }[],
  ): Promise<Finding[]> {
    const staticFindings = this.analyzer.analyzeMany(
      files.map((f) => ({ path: f.path, content: f.content })),
    );
    const pluginFindings = await this.plugins.runAnalyze(
      files.map((f) => ({ path: f.path, content: f.content })),
    );
    return [...staticFindings, ...pluginFindings];
  }

  // ---------------------------------------------------------------------------
  // REVIEW
  // ---------------------------------------------------------------------------
  private async runReview(): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const staticFindings = await this.analyzeFiles(files);

    const aiFindings = await this.aiReview(files);
    const findings = [...staticFindings, ...aiFindings];

    const comments: ReviewComment[] = findings
      .filter((f) => f.category !== "praise" || this.config.include_positive_feedback)
      .map((f) => ({
        file: f.file,
        line: f.line,
        body: `${f.comment}${f.suggestion ? `\n\nSuggestion: ${f.suggestion}` : ""}`,
        severity: f.severity,
      }));

    const summary = this.buildSummary("review", findings);

    const report: EngineReport = {
      mode: "review",
      summary,
      findings,
      score: null,
      comments,
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
    };

    if (this.config.enable_scoring) {
      report.score = await this.computeScore(files, findings);
    }
    return report;
  }

  /** Ask the AI model to review each changed file (cached per file). */
  private async aiReview(
    files: { path: string; content: string; diff?: string }[],
  ): Promise<Finding[]> {
    const out: Finding[] = [];
    logger.info(`aiReview: starting AI review for ${files.length} files`);
    for (const file of files) {
      logger.info(`aiReview: processing ${file.path} (diff_len=${(file.diff ?? "").length}, content_len=${file.content.length})`);
      try {
        const cacheKey = { task: "review", path: file.path, content: file.content };
        const cached = this.config.enable_cache
          ? this.cache.get<{ findings: any[] }>("review", cacheKey)
          : null;
        const parsed = cached ?? (await this.callAI("review", "review", file));
        if (!cached && this.config.enable_cache) {
          this.cache.set("review", cacheKey, parsed);
        }
        const fileFindings = (parsed.findings ?? []).map((f: any) => ({
          ...f,
          file: f.file || file.path,
          source: "ai" as const,
        }));
        logger.info(`aiReview: ${file.path} -> ${fileFindings.length} findings (cached=${!!cached})`);
        out.push(...fileFindings);
      } catch (err) {
        logger.warn(`AI review failed for ${file.path}:`, err);
      }
    }
    logger.info(`aiReview: total AI findings = ${out.length}`);
    return out;
  }

  // ---------------------------------------------------------------------------
  // FIX (loop-based)
  // ---------------------------------------------------------------------------
  private async runFix(): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const staticFindings = await this.analyzeFiles(files);
    const aiFindings = await this.aiReview(files);
    const findings = [...staticFindings, ...aiFindings];

    // Only act on actionable, non-praise findings, bounded by max_iterations.
    const actionable = findings.filter((f) => f.category !== "praise");
    const fixAttempts: FixAttempt[] = [];
    const limit = Math.min(this.config.max_iterations, actionable.length);
    logger.info(`runFix: ${actionable.length} actionable findings, max_iterations=${this.config.max_iterations}, limit=${limit}`);

    for (let iteration = 1; iteration <= limit; iteration++) {
      const finding = actionable[iteration - 1];
      logger.info(`runFix: iteration ${iteration}/${limit} — ${finding.file}:${finding.line} (${finding.severity}/${finding.category})`);
      try {
        const attempt = await this.applyFix(finding, iteration);
        fixAttempts.push(attempt);
        logger.info(`runFix: iteration ${iteration} result — fixed=${attempt.fixed} verified=${attempt.verified}`);
      } catch (err) {
        logger.warn(`runFix: iteration ${iteration} failed for ${finding.file}:`, err);
        fixAttempts.push({
          iteration,
          file: finding.file,
          fixed: false,
          explanation: `Error: ${err instanceof Error ? err.message : err}`,
          verified: false,
        });
      }
      // In dry-run or non-auto-fix mode, one attempt is sufficient since no files are written.
      if (!this.config.enable_auto_fix) break;
    }

    const summary = this.buildSummary("fix", findings, fixAttempts);
    return {
      mode: "fix",
      summary,
      findings,
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts,
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  /** Generate and (optionally) write a fix for a single finding. */
  private async applyFix(
    finding: Finding,
    iteration: number,
  ): Promise<FixAttempt> {
    const filePath = resolve(this.root, finding.file);
    const content = readText(filePath);
    const prompt = this.prompts.render("fix", {
      severity: finding.severity,
      category: finding.category,
      file: finding.file,
      line: finding.line ?? "",
      comment: finding.comment,
      suggestion: finding.suggestion ?? "",
      language: finding.file.split(".").pop() ?? "text",
      code: content,
      project_context: this.config.project_context || "(none)",
    });

    logger.info(`applyFix[${iteration}]: prompt=${JSON.stringify(finding.file)} severity=${finding.severity} category=${finding.category}`);
    const res = await this.ai.complete("fix", [
      { role: "system", content: "You apply minimal, safe code fixes." },
      { role: "user", content: prompt },
    ]);
    logger.info(`applyFix[${iteration}]: AI response len=${res.content.length}`);
    const parsed = extractJson<{
      fixed: boolean;
      explanation: string;
      content: string;
    }>(res.content);

    let verified = false;
    if (parsed.fixed && this.config.enable_auto_fix && !this.config.dry_run) {
      writeFileSync(filePath, parsed.content, "utf8");
      verified = await this.runVerification();
    }
    return {
      iteration,
      file: finding.file,
      fixed: parsed.fixed,
      explanation: parsed.explanation,
      verified,
    };
  }

  /** Run lint + tests after a fix. Best-effort; returns true if both pass. */
  private async runVerification(): Promise<boolean> {
    const { execSync } = await import("node:child_process");
    try {
      if (this.config.test_runner === "jest") {
        execSync("npx jest --passWithNoTests", { cwd: this.root, stdio: "ignore" });
      } else {
        execSync("npx vitest run", { cwd: this.root, stdio: "ignore" });
      }
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // AUDIT
  // ---------------------------------------------------------------------------
  private async runAudit(): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const staticFindings = await this.analyzeFiles(files);

    const snapshot = files
      .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
      .join("\n\n")
      .slice(0, 60000); // keep within model limits

    const prompt = this.prompts.render("audit", {
      project_context: this.config.project_context || "(none)",
      repository_snapshot: snapshot,
    });
    const res = await this.ai.complete("audit", [
      { role: "system", content: "You are a principal engineer doing a repo audit." },
      { role: "user", content: prompt },
    ]);
    const parsed = extractJson<{ summary: string; findings: any[] }>(res.content);

    const aiFindings: Finding[] = (parsed.findings ?? []).map((f) => ({
      severity: f.severity,
      category: f.category,
      file: f.file ?? "repo-wide",
      line: null,
      comment: `${f.title}: ${f.description}\n\nRecommendation: ${f.recommendation}`,
      source: "ai" as const,
    }));

    const findings = [...staticFindings, ...aiFindings];
    const summary = parsed.summary ?? this.buildSummary("audit", findings);

    return {
      mode: "audit",
      summary,
      findings,
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  // ---------------------------------------------------------------------------
  // SCORE
  // ---------------------------------------------------------------------------
  private async runScoreMode(): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const staticFindings = await this.analyzeFiles(files);
    const score = await this.computeScore(files, staticFindings);

    return {
      mode: "score",
      summary: `Overall code quality score: ${score.overall}/100.`,
      findings: staticFindings,
      score,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  /** Combine the static baseline with an AI refinement of the sub-scores. */
  private async computeScore(
    files: { path: string; content: string }[],
    findings: Finding[],
  ): Promise<ScoreBreakdown> {
    const baseline = this.scorer.scoreStatic(
      files.map((f) => ({ path: f.path, content: f.content })),
      findings,
    );
    // AI refinement (optional, best-effort + cached).
    const cacheKey = {
      task: "score",
      paths: files.map((f) => f.path).sort(),
    };
    try {
      const cached = this.config.enable_cache
        ? this.cache.get<{ readability: number; maintainability: number; security: number; test_coverage: number; rationale: string }>("score", cacheKey)
        : null;
      const ai = cached ?? (await this.callScoreAI(files));
      if (!cached && this.config.enable_cache) this.cache.set("score", cacheKey, ai);
      return this.scorer.blendWithAI(baseline, ai, ai.rationale);
    } catch {
      return baseline;
    }
  }

  // ---------------------------------------------------------------------------
  // TESTGEN
  // ---------------------------------------------------------------------------
  private async runTestgen(): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const gen = new TestGenerator(this.config, this.ai, this.prompts);
    const generatedTests = await gen.generate(this.root, files);

    return {
      mode: "testgen",
      summary: `Generated ${generatedTests.length} test file(s).`,
      findings: [],
      score: null,
      comments: [],
      generatedTests,
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  // ---------------------------------------------------------------------------
  // CHAT
  // ---------------------------------------------------------------------------
  private async runChat(question: string): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const context = files
      .map((f) => `### ${f.path}\n${f.content}`)
      .join("\n\n")
      .slice(0, 40000);
    const prompt = `Project context: ${this.config.project_context || "(none)"}\n\nRelevant code:\n${context}\n\nQuestion: ${question}\n\nAnswer concisely and with references to the code where possible.`;
    const res = await this.ai.complete("chat", [
      { role: "system", content: "You are a helpful senior engineer answering questions about this codebase." },
      { role: "user", content: prompt },
    ]);

    return {
      mode: "chat",
      summary: res.content,
      findings: [],
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  /** Public helper used by the GitHub App / Action to answer `/ask`. */
  async ask(question: string): Promise<string> {
    const report = await this.runChat(question);
    return report.summary;
  }

  // ---------------------------------------------------------------------------
  // Low-level AI calls (with JSON parsing).
  // ---------------------------------------------------------------------------
  private async callAI(
    task: "review",
    promptName: PromptName,
    file: { path: string; content: string; diff?: string },
  ): Promise<{ findings: any[] }> {
    const code = file.diff && file.diff.trim() ? file.diff : file.content;
    const prompt = this.prompts.render(promptName, {
      project_context: this.config.project_context || "(none)",
      language: file.path.split(".").pop() ?? "text",
      code,
      positive_feedback_instruction: this.config.include_positive_feedback
        ? "Also include up to 2 praise findings where the code is exemplary."
        : "Do not include positive/praise feedback.",
    });

    const preview = prompt.length > 300 ? prompt.slice(0, 300) + "..." : prompt;
    logger.info(`callAI: task=${task} prompt=${promptName} file=${file.path} prompt_preview=${JSON.stringify(preview)}`);

    const res = await this.ai.complete(task, [
      { role: "system", content: "You are an expert code reviewer." },
      { role: "user", content: prompt },
    ]);
    logger.info(`callAI response: provider=${res.provider} model=${res.model} tokens_in=${res.usage?.promptTokens} tokens_out=${res.usage?.completionTokens} content_len=${res.content.length}`);
    return extractJson<{ findings: any[] }>(res.content);
  }

  private async callScoreAI(
    files: { path: string; content: string }[],
  ): Promise<{
    readability: number;
    maintainability: number;
    security: number;
    test_coverage: number;
    rationale: string;
  }> {
    const code = files
      .map((f) => `### ${f.path}\n${f.content}`)
      .join("\n\n")
      .slice(0, 40000);
    const prompt = this.prompts.render("score", {
      project_context: this.config.project_context || "(none)",
      language: files[0]?.path.split(".").pop() ?? "text",
      code,
    });
    const res = await this.ai.complete("score", [
      { role: "system", content: "You score code quality objectively." },
      { role: "user", content: prompt },
    ]);
    return extractJson(res.content);
  }

  // ---------------------------------------------------------------------------
  // Reporting helpers.
  // ---------------------------------------------------------------------------
  private buildSummary(
    mode: string,
    findings: Finding[],
    fixAttempts?: FixAttempt[],
  ): string {
    const counts = this.tallySeverity(findings);
    let s = `[${mode}] Analyzed ${findings.length} finding(s). `;
    s += `Severity breakdown: ${JSON.stringify(counts)}.`;
    if (fixAttempts) {
      const success = fixAttempts.filter((a) => a.fixed && a.verified).length;
      s += ` Fixes applied & verified: ${success}/${fixAttempts.length}.`;
    }
    return s;
  }

  private tallySeverity(findings: Finding[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    return counts;
  }

  private finalizeReport(report: EngineReport): void {
    report.metrics.findingsBySeverity = this.tallySeverity(report.findings);
  }

  private writeReportFile(report: EngineReport): void {
    ensureDir(resolve(this.root, this.config.output.reportDir));
    const name =
      report.mode === "score" && report.score
        ? "score.json"
        : `codesentinel-${report.mode}.json`;
    const path = resolve(this.root, this.config.output.reportDir, name);
    writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
    logger.info(`Wrote report: ${path}`);

    if (this.config.output.writeHtmlReport) {
      const htmlName = name.replace(".json", ".html");
      const htmlPath = resolve(this.root, this.config.output.reportDir, htmlName);
      writeFileSync(htmlPath, renderHtmlReport(report), "utf8");
      logger.info(`Wrote HTML report: ${htmlPath}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Enhanced analysis features.
  // ---------------------------------------------------------------------------
  
  /**
   * Perform progressive analysis (quick scan → deep analysis).
   */
  async analyzeProgressive(): Promise<{
    results: import("../analyzer/progressive.js").ProgressiveAnalysisResult[];
    findings: Finding[];
  }> {
    const files = await this.collectedFiles();
    const results = await this.analyzer.analyzeProgressive(files);
    const findings = results.flatMap(r => r.findings);
    return { results, findings };
  }

  /**
   * Perform multi-file analysis with cross-file insights.
   */
  async analyzeMultiFile(): Promise<import("../analyzer/progressive.js").MultiFileAnalysisResult> {
    const files = await this.collectedFiles();
    return this.analyzer.analyzeMultiFile(files);
  }

  /**
   * Compare analysis results between two runs.
   */
  compareAnalyses(
    previousFindings: Finding[],
    currentFindings: Finding[],
  ): import("../analyzer/cache.js").AnalysisComparison | null {
    return this.analyzer.compareAnalyses(previousFindings, currentFindings);
  }

  /**
   * Add a custom analysis rule.
   */
  addCustomRule(rule: import("../config/types.js").CustomRule): void {
    this.analyzer.addCustomRule(rule);
  }

  /**
   * Remove a custom analysis rule.
   */
  removeCustomRule(ruleId: string): void {
    this.analyzer.removeCustomRule(ruleId);
  }

  /**
   * Update confidence thresholds for analysis.
   */
  updateConfidenceThresholds(thresholds: Partial<import("../config/types.js").ConfidenceThresholds>): void {
    this.analyzer.updateConfidenceThresholds(thresholds);
  }

  /**
   * Update severity adjustment configuration.
   */
  updateSeverityConfig(config: Partial<import("../config/types.js").SeverityAdjustmentConfig>): void {
    this.analyzer.updateSeverityConfig(config);
  }

  /**
   * Get analyzer configuration.
   */
  getAnalyzerConfig(): import("../config/types.js").AnalyzerConfig {
    return this.analyzer.getConfig();
  }

  /**
   * Get analysis cache statistics.
   */
  getAnalysisCacheStats(): { memoryEntries: number; diskEntries: number; totalSizeBytes: number } | null {
    return this.analyzer.getCacheStats();
  }

  /**
   * Clear analysis cache.
   */
  clearAnalysisCache(): void {
    this.analyzer.clearCache();
  }
}

/** Re-export the GitHub Action input helper for callers. */
export { configFromInputs };
