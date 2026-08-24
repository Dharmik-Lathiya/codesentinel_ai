import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadConfig, configFromInputs } from "../config/index.js";
import type {
  CodeSentinelConfig,
  RuntimeSecrets,
  Mode,
} from "../config/types.js";
import { GitHubReporter } from "../github/reporter.js";
import { AIHub } from "../ai/index.js";
import type { EngineAI } from "../ai/providers/opencode-cli.js";
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
import { scanSecrets, redactSecrets } from "../secrets/index.js";
import { DismissalManager } from "../dismiss/index.js";
import { DashboardServer } from "../dashboard/index.js";
import { detectDeadCode } from "../deadcode/index.js";
import { buildSuggestionsComment } from "../suggestions/index.js";
import { evaluateGate } from "../gate/index.js";
import { runLinters } from "../linters/index.js";
import { runThirdPartySecrets } from "../scanners/index.js";
import { concurrentMap } from "../utils/concurrency.js";
import { MCPManager } from "../mcp/client.js";
import { getDefaultMCPServers } from "../mcp/servers.js";
import { LearningStore } from "../learning/store.js";
import { EventBus } from "../event-bus/bus.js";
import { parseJsonlString, validateAndNormalize, buildInlineComments } from "../jsonl-parser.js";
import { groupIntoBatches } from "./batcher.js";

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
  /** New findings introduced by the fix (if any). */
  newIssuesIntroduced: Finding[];
}

/** A single hunk (line-based patch) returned by the AI. */
export interface Hunk {
  startLine: number;
  deleteCount: number;
  newLines: string[];
}

/** Apply hunks to file content (sorts bottom-to-top to preserve line numbers). */
export function applyHunks(content: string, hunks: Hunk[]): string {
  const lines = content.split("\n");
  const sorted = [...hunks].sort((a, b) => b.startLine - a.startLine);
  for (const hunk of sorted) {
    const idx = hunk.startLine - 1;
    if (idx < 0 || idx > lines.length) {
      logger.warn(`applyHunks: skipping hunk startLine=${hunk.startLine} (file has ${lines.length} lines)`);
      continue;
    }
    lines.splice(idx, hunk.deleteCount, ...hunk.newLines);
  }
  return lines.join("\n");
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
  /** Typed gate result — only set when mode is "gate". */
  gatePassed?: boolean;
  metrics: {
    filesAnalyzed: number;
    findingsBySeverity: Record<string, number>;
    durationMs: number;
    truncatedResponses?: number;
    repairedResponses?: number;
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
  private ai: EngineAI;
  private prompts: PromptRegistry;
  private analyzer: StaticAnalyzer;
  private scorer = new Scorer();
  private cache: FileCache;
  private plugins: PluginManager;
  private dismissals: DismissalManager;
  private dashboard: DashboardServer | null = null;
  private readonly mcp: MCPManager | null = null;
  private readonly learning: LearningStore | null = null;
  private readonly eventBus: EventBus;
  private aiAvailable = true;
  /** Count of AI responses that were truncated (unterminated JSON). */
  private truncatedCount = 0;
  /** Count of truncated responses successfully repaired via extractJson. */
  private repairedCount = 0;

  constructor(
    config: CodeSentinelConfig,
    private secrets: RuntimeSecrets,
    private root = process.cwd(),
    /** Optional AI override (used in tests to avoid network calls). */
    private readonly aiOverride?: EngineAI,
  ) {
    this.config = config;
    if (config.use_opencode_cli && !aiOverride) {
      secrets = { ...secrets, use_opencode_cli: "true" };
    }
    this.ai = aiOverride ?? new AIHub(config, secrets, root);
    if (aiOverride) this.aiAvailable = true;
    this.prompts = new PromptRegistry(config);
    this.cache = new FileCache(resolve(root, config.cache_dir));
    this.plugins = new PluginManager({ config, logger });
    this.eventBus = new EventBus();

    // Initialize analyzer with configuration
    this.analyzer = new StaticAnalyzer(
      config.analyzer,
      resolve(root, config.cache_dir, "analysis"),
    );

    this.dismissals = new DismissalManager(resolve(root, config.dismissalsFile));
    this.dashboard = new DashboardServer(config.dashboard.port, resolve(root, config.dashboard.dataDir));

    // Wire up custom rules from config
    for (const rule of config.analyzer.customRules) {
      this.analyzer.addCustomRule(rule);
    }

    // Initialize MCP Manager
    if (config.mcp.enabled) {
      this.mcp = new MCPManager(
        config.mcp.servers.length ? config.mcp.servers : getDefaultMCPServers(),
      );
    }

    // Initialize Learning Store
    if (config.learning.enabled) {
      this.learning = new LearningStore(config.learning.dbPath);
    }

    logger.info(`Configured AI model: ${config.default_model.provider}/${config.default_model.model}`);
    logger.info(`Review model: ${(config.models.review ?? config.default_model).provider}/${(config.models.review ?? config.default_model).model}`);

    // Emit engine ready event
    this.eventBus.emit({ type: "ready", payload: { timestamp: Date.now() } });
  }

  /** Best-effort health check: log whether the AI provider is reachable. */
  private async checkAIProvider(): Promise<void> {
    if (this.aiOverride || this.config.use_opencode_cli) return;
    const model = this.ai.modelForTask("review");
    const baseUrl = (this.secrets.opencode_base_url || "http://localhost:4096").replace(/\/v1$/, "");
    if (model.provider === "opencode") {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          logger.info(`OpenCode is REACHABLE at ${baseUrl}`);
        } else {
          this.aiAvailable = false;
          logger.warn(`OpenCode at ${baseUrl} returned status ${res.status} — AI review will fail`);
        }
      } catch {
        this.aiAvailable = false;
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
    if (this.learning) await this.learning.init();
  }

  // ---------------------------------------------------------------------------
  // Entry point: dispatch to the mode-specific runner.
  // ---------------------------------------------------------------------------
  async run(): Promise<EngineReport> {
    await this.init();
    const start = Date.now();
    logger.info(`Running mode: ${this.config.mode}`);
    await this.checkAIProvider();

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
      case "gate":
        report = await this.runGate();
        break;
      case "describe":
        report = await this.runDescribe();
        break;
      case "chat":
        report = await this.runChat("(no prompt supplied; use ask())");
        break;
      case "improve":
        report = await this.runImprove();
        break;
      case "plan":
        report = await this.runPlan();
        break;
      default:
        throw new Error(`Unsupported mode: ${this.config.mode}`);
    }

    report.metrics.durationMs = Date.now() - start;
    this.finalizeReport(report);
    report.metrics.durationMs = Date.now() - start;

    if (this.config.output.writeReportFile) this.writeReportFile(report);
    return report;
  }

  // ---------------------------------------------------------------------------
  // GATE
  // ---------------------------------------------------------------------------
  private async runGate(): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const findings = await this.analyzeFiles(files);

    const score = this.config.enable_scoring ? await this.computeScore(files, findings) : null;
    const gateResult = evaluateGate(findings, score, this.config.gate);

    const summary = gateResult.passed
      ? `[gate] PASSED — ${gateResult.reason}`
      : `[gate] FAILED — ${gateResult.reason}`;

    if (!gateResult.passed) {
      logger.warn(`Gate FAILED: ${gateResult.reason}`);
    }

    this.recordDashboardRun("gate", findings, score, 0);

    return {
      mode: "gate",
      summary,
      findings,
      score,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      gatePassed: gateResult.passed,
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  // ---------------------------------------------------------------------------
  // DEAD CODE
  // ---------------------------------------------------------------------------
  async runDeadCode(files: { path: string; content: string }[]): Promise<Finding[]> {
    return detectDeadCode(files);
  }

  // ---------------------------------------------------------------------------
  // COMMITTABLE SUGGESTIONS
  // ---------------------------------------------------------------------------
  buildSuggestions(findings: Finding[], fileContents: Map<string,string>): string {
    return buildSuggestionsComment(findings, fileContents);
  }

  // ---------------------------------------------------------------------------
  // DISMISSAL
  // ---------------------------------------------------------------------------
  getDismissalManager(): DismissalManager {
    return this.dismissals;
  }

  /** Dismiss by rule and record feedback in learning store. */
  async dismissByRule(ruleId: string, reason: string): Promise<void> {
    this.dismissals.dismissByRule(ruleId, reason);
    if (this.learning) {
      try { await this.learning.recordFeedback(ruleId, "false_positive", reason); }
      catch { /* best-effort */ }
    }
  }

  /** Dismiss by file+line and record feedback in learning store. */
  async dismissByFinding(file: string, line: number | null, ruleId: string, reason: string): Promise<void> {
    this.dismissals.dismissByFinding(file, line, ruleId, reason);
    if (this.learning) {
      try { await this.learning.recordFeedback(ruleId, "false_positive", reason); }
      catch { /* best-effort */ }
    }
  }

  // ---------------------------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------------------------
  getDashboard(): DashboardServer | null {
    return this.dashboard;
  }

  private recordDashboardRun(
    mode: string,
    findings: Finding[],
    score: ScoreBreakdown | null,
    durationMs: number,
  ): void {
    if (!this.dashboard) return;
    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    }
    this.dashboard.recordRun({
      timestamp: new Date().toISOString(),
      mode,
      totalFindings: findings.length,
      score: score?.overall ?? null,
      findingsBySeverity: bySeverity,
      findingsByCategory: byCategory,
      durationMs,
    });
  }

  // ---------------------------------------------------------------------------
  // File collection helpers.
  // ---------------------------------------------------------------------------
  private async collectedFiles(): Promise<
    { path: string; content: string; diff?: string }[]
  > {
    if (this.config.mode === "review" || this.config.mode === "fix") {
      const diffs: DiffFile[] = await collectDiff(undefined, this.root);
      if (diffs.length > 0) {
        return diffs
          .filter((d) => d.status !== "deleted")
          .map((d) => ({ path: d.path, content: d.content, diff: d.diff }));
      }
      logger.info("No diff found — falling back to full repo scan");
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
    const allFindings: Finding[] = [];

    const linterResults: Finding[] =
      this.config.linters.enabled
        ? runLinters(this.root, { tools: this.config.linters.tools, args: this.config.linters.args })
        : [];
    const scannerResults: Finding[] =
      this.config.enableSecretScanner
        ? runThirdPartySecrets(this.root)
        : [];

    for (const file of files) {
      const ch = this.cache.contentHash(file.content);
      const cacheKey = { task: "static", path: file.path, hash: ch };
      const cached = this.config.enable_cache
        ? this.cache.get<Finding[]>("static", cacheKey)
        : null;

      if (cached) {
        allFindings.push(...cached);
        continue;
      }

      const staticFindings = this.analyzer.analyzeMany([file]);
      const pluginFindings = await this.plugins.runAnalyze([file]);
      const secretFindings = scanSecrets(file.path, file.content, this.config.secretPatterns);

      // Repo-wide linter/scanner findings are appended once after the loop,
      // not per file — otherwise each one would be duplicated N times.
      const fileFindings = [
        ...staticFindings,
        ...pluginFindings,
        ...secretFindings,
      ];

      if (this.config.enable_cache) {
        this.cache.set("static", cacheKey, fileFindings);
      }
      allFindings.push(...fileFindings);
    }

    // Repo-wide findings (linters, third-party secret scanners) exactly once.
    allFindings.push(...linterResults, ...scannerResults);

    const filtered = this.dismissals.filterDismissed(allFindings);

    // Auto-mute rules with persistently high false-positive rates
    if (this.learning && this.config.learning.enabled) {
      try {
        const highFp = await this.learning.getHighFalsePositiveRules();
        if (highFp.length) {
          const mutedRuleIds = new Set(highFp.map((r) => r.ruleId));
          const result = filtered.filter((f) => {
            const ruleId = `${f.category}:${f.comment.slice(0, 40)}`;
            return !mutedRuleIds.has(ruleId);
          });
          if (result.length < filtered.length) {
            logger.info(`analyzeFiles: auto-muted ${filtered.length - result.length} finding(s) from ${highFp.length} high-FP rule(s)`);
          }
          return result;
        }
      } catch { /* best-effort */ }
    }

    return filtered;
  }

  // ---------------------------------------------------------------------------
  // REVIEW
  // ---------------------------------------------------------------------------
  private async runReview(): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const staticFindings = await this.analyzeFiles(files);

    // Send redacted content to AI — secrets are flagged as findings in static scan
    const aiFiles = this.redactFilesForAI(files);
    const { findings: aiFindings, summaries: aiSummaries } = await this.aiReview(aiFiles);
    const findings = [...staticFindings, ...aiFindings];

    this.recordPatterns(findings).catch(() => {});

    // Auto-fix actionable findings when auto-fix is enabled
    let fixAttempts: FixAttempt[] = [];
    if (this.config.enable_auto_fix && !this.config.dry_run) {
      const actionable = findings.filter((f) => f.category !== "praise");
      if (actionable.length > 0) {
        logger.info(`runReview: auto-fixing ${actionable.length} issue(s)`);
        const fixReport = await this.runFixLoopFor(actionable);
        fixAttempts = fixReport.fixAttempts;
        // Re-read files to get updated findings after fixes
        const updatedFiles = await this.collectedFiles();
        const updatedStatic = await this.analyzeFiles(updatedFiles);
        const updatedAiFiles = this.redactFilesForAI(updatedFiles);
        const { findings: updatedAi } = await this.aiReview(updatedAiFiles);
        const updatedFindings = [...updatedStatic, ...updatedAi];
        const summary = this.buildSummary("review", updatedFindings, fixAttempts, aiSummaries);
        return {
          mode: "review",
          summary,
          findings: updatedFindings,
          score: this.config.enable_scoring ? await this.computeScore(updatedFiles, updatedFindings) : null,
          comments: [],
          generatedTests: [],
          fixAttempts,
          metrics: { filesAnalyzed: updatedFiles.length, findingsBySeverity: {}, durationMs: 0 },
        };
      }
    }

    const comments: ReviewComment[] = findings
      .filter((f) => f.category !== "praise" || this.config.include_positive_feedback)
      .map((f) => ({
        file: f.file,
        line: f.line,
        body: `${f.comment}${f.suggestion ? `\n\nSuggestion: ${f.suggestion}` : ""}`,
        severity: f.severity,
      }));

    const truncInfo = this.truncatedCount
      ? ` | ⚠ ${this.truncatedCount} truncated, ${this.repairedCount} repaired`
      : "";
    logger.info(`runReview: ${findings.length} total findings (${staticFindings.length} static, ${aiFindings.length} AI)${truncInfo}`);

    const summary = this.buildSummary("review", findings, undefined, aiSummaries);

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

  /**
   * Create a deep copy of the file list with secrets redacted from `content`
   * before sending to the AI provider. Never mutates files on disk.
   */
  private redactFilesForAI(
    files: { path: string; content: string; diff?: string }[],
  ): { path: string; content: string; diff?: string }[] {
    const patterns = this.config.secretPatterns;
    if (!patterns.length) return files;
    return files.map((f) => ({
      ...f,
      content: redactSecrets(f.content, patterns),
      diff: f.diff ? redactSecrets(f.diff, patterns) : f.diff,
    }));
  }

  /** Ask the AI model to review each changed file (cached per file). */
  private async aiReview(
    files: { path: string; content: string; diff?: string }[],
  ): Promise<{ findings: Finding[]; summaries: string[] }> {
    if (!this.aiAvailable) {
      logger.warn("aiReview: AI provider not reachable — skipping AI review");
      return { findings: [], summaries: [] };
    }
    logger.info(`aiReview: starting AI review for ${files.length} files`);

    // Split large files into chunks by maxLinesPerFile
    const maxLines = this.config.batch.maxLinesPerFile;
    const expandedFiles: { path: string; content: string; diff?: string; chunk?: number }[] = [];
    for (const file of files) {
      const lines = file.content.split("\n");
      if (maxLines > 0 && lines.length > maxLines) {
        const nChunks = Math.ceil(lines.length / maxLines);
        logger.info(`aiReview: splitting ${file.path} (${lines.length} lines) into ${nChunks} chunks of ${maxLines} lines`);
        for (let i = 0; i < nChunks; i++) {
          const chunkLines = lines.slice(i * maxLines, (i + 1) * maxLines);
          expandedFiles.push({
            path: file.path,
            content: chunkLines.join("\n"),
            diff: file.diff,
            chunk: i + 1,
          });
        }
      } else {
        expandedFiles.push({ ...file });
      }
    }

    // Group into batches if batching is enabled
    const batches = this.config.batch.enabled
      ? groupIntoBatches(expandedFiles, this.config.batch.batchSize)
      : expandedFiles.map((f) => [f]);

    const allResults: Finding[] = [];
    const allSummaries: string[] = [];
    for (const batch of batches) {
      logger.info(`aiReview: batch size=${batch.length}`);
      const results = await concurrentMap(batch, async (file) => {
        const chunkLabel = file.chunk ? ` (chunk ${file.chunk})` : "";
        logger.info(`aiReview: processing ${file.path}${chunkLabel} (content_len=${file.content.length})`);
        try {
          const cacheKey = { task: "review", path: file.path, content: file.content, chunk: file.chunk };
          const cached = this.config.enable_cache
            ? this.cache.get<{ findings: any[]; summary?: string }>("review", cacheKey)
            : null;
          const parsed = cached ?? (await this.callAI("review", "review", file));
          if (!cached && this.config.enable_cache) {
            this.cache.set("review", cacheKey, parsed);
          }
          if ("summary" in parsed && parsed.summary) allSummaries.push(parsed.summary);
          const fileFindings = (parsed.findings ?? []).map((f: any) => ({
            ...f,
            file: file.path,
            source: "ai" as const,
          }));
          logger.info(`aiReview: ${file.path}${chunkLabel} -> ${fileFindings.length} findings (cached=${!!cached})`);
          return fileFindings;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`AI review failed for ${file.path}${chunkLabel}: ${msg}`);
          return [];
        }
      }, 5);
      allResults.push(...results.flat());
    }

    const out = allResults;
    logger.info(`aiReview: total AI findings = ${out.length} | truncated=${this.truncatedCount} repaired=${this.repairedCount}`);
    return { findings: out, summaries: allSummaries };
  }

  /** Record recurring patterns and auto-create rules. */
  private async recordPatterns(findings: Finding[]): Promise<void> {
    if (!this.learning || !this.config.learning.patternDiscovery) return;
    try {
      const groups = new Map<string, { count: number; category: string; comment: string; suggestion?: string }>();
      for (const f of findings) {
        const key = `${f.category}:${f.comment.slice(0, 60)}`;
        const existing = groups.get(key);
        if (existing) {
          existing.count++;
        } else {
          groups.set(key, { count: 1, category: f.category, comment: f.comment, suggestion: f.suggestion });
        }
      }
      for (const [, g] of groups) {
        if (g.count < 2) continue;
        await this.learning.recordPattern(g.comment, g.category);
      }

      // Auto-create rules for patterns with frequency >= 3
      const freqPatterns = await this.learning.getPatternsAboveThreshold(3);
      for (const p of freqPatterns) {
        const ruleName = `auto-${p.category}-${p.pattern_text.slice(0, 30).replace(/\s+/g, "_")}`;
        await this.learning.autoCreateRule(p.id, ruleName, p.pattern_text, "medium", p.category, `Auto-generated from recurring pattern (frequency: ${p.frequency})`);
        logger.info(`recordPatterns: auto-created rule "${ruleName}" from pattern ${p.id} (freq=${p.frequency})`);
      }
    } catch { /* best-effort */ }
  }

  // ---------------------------------------------------------------------------
  // FIX — Review-Fix Loop Engineering
  // ---------------------------------------------------------------------------
  private async runFix(): Promise<EngineReport> {
    if (!this.aiAvailable) {
      logger.warn("runFix: AI provider not available — cannot apply fixes");
      return {
        mode: "fix",
        summary: "AI provider not reachable. Cannot apply fixes without an AI provider.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 },
      };
    }
    const allFixAttempts: FixAttempt[] = [];
    const allFindings: Finding[] = [];
    const modifiedFiles = new Set<string>();
    const maxCycles = this.config.max_iterations;
    let cycle = 0;

    while (cycle < maxCycles) {
      cycle++;
      logger.info(`runFix: === cycle ${cycle}/${maxCycles} ===`);

      const files = await this.collectedFiles();
      if (files.length === 0) {
        logger.info("runFix: no files to analyze, exiting loop");
        break;
      }

      const staticFindings = await this.analyzeFiles(files);
      let findings = staticFindings;
      if (cycle === 1 && this.aiAvailable) {
        const aiFiles = this.redactFilesForAI(files);
        const { findings: aiFindings } = await this.aiReview(aiFiles);
        if (aiFindings.length) findings = [...staticFindings, ...aiFindings];
      }
      allFindings.length = 0;
      allFindings.push(...findings);

      const actionable = findings.filter((f) => f.category !== "praise");
      logger.info(`runFix: cycle ${cycle} — ${actionable.length} actionable findings`);

      // Capture linter baseline before first fix in this cycle for delta comparison
      if (this.config.linters.enabled) {
        const baselineFindings = runLinters(this.root, {
          tools: this.config.linters.tools,
          args: this.config.linters.args,
        });
        this._linterBaseline = new Set(baselineFindings.map(f => `${f.file}:${f.line}:${f.comment}`));
      }

      if (actionable.length === 0) {
        logger.info("runFix: all issues resolved, fix successful");
        break;
      }

      if (!this.config.enable_auto_fix) {
        logger.info("runFix: auto-fix disabled, exiting after review");
        break;
      }

      const fileGroups = new Map<string, Finding[]>();
      for (const f of actionable) {
        const list = fileGroups.get(f.file);
        if (list) {
          list.push(f);
        } else {
          fileGroups.set(f.file, [f]);
        }
      }

      let anyFixed = false;
      // Try single-pass fix first (all files in one AI call)
      const singlePassAttempts = await this.batchApplyFixAll(fileGroups);
      if (singlePassAttempts.length > 0) {
        for (const attempt of singlePassAttempts) {
          allFixAttempts.push(attempt);
          if (attempt.fixed === true && this.config.enable_auto_fix && !this.config.dry_run) {
            modifiedFiles.add(attempt.file);
            anyFixed = true;
          }
        }
      } else {
        // Fall back to per-file batching
        const MAX_FINDINGS_PER_FILE = 5;
        const groups: [string, Finding[]][] = [];
        for (const [filePath, findings] of fileGroups) {
          for (let pos = 0; pos < findings.length; pos += MAX_FINDINGS_PER_FILE) {
            groups.push([filePath, findings.slice(pos, pos + MAX_FINDINGS_PER_FILE)]);
          }
        }
        const PHASE_SIZE = 5;
        for (let phase = 0; phase < groups.length; phase += PHASE_SIZE) {
          const phaseGroups = groups.slice(phase, phase + PHASE_SIZE);
          logger.info(`runFix: phase ${phase / PHASE_SIZE + 1}/${Math.ceil(groups.length / PHASE_SIZE)} (${phaseGroups.length} files)`);
          const batchResults = await concurrentMap(phaseGroups, async ([filePath, fileFindings], idx) => {
            logger.info(`runFix: batch ${phase + idx + 1}/${fileGroups.size} — ${filePath} (${fileFindings.length} issues)`);
            try {
              const attempt = await this.batchApplyFix(filePath, fileFindings, phase + idx + 1);
              logger.info(`runFix: batch result — fixed=${attempt.fixed} verified=${attempt.verified}`);
              return attempt;
            } catch (err) {
              logger.warn(`runFix: batch fix failed for ${filePath}: ${err instanceof Error ? err.message : err}`);
              return {
                iteration: phase + idx + 1,
                file: filePath,
                fixed: false,
                explanation: `Error: ${err instanceof Error ? err.message : err}`,
                verified: false,
                newIssuesIntroduced: [],
              } as FixAttempt;
            }
          }, 3);
          for (const attempt of batchResults as FixAttempt[]) {
            allFixAttempts.push(attempt);
            if (attempt.fixed === true && this.config.enable_auto_fix && !this.config.dry_run) {
              modifiedFiles.add(attempt.file);
              anyFixed = true;
            }
          }
          if (modifiedFiles.size > 0 && phase + PHASE_SIZE < groups.length) {
            const branch = await this.pushFixes(modifiedFiles, `[skip ci] phase ${phase / PHASE_SIZE + 1}/${Math.ceil(groups.length / PHASE_SIZE)}`);
            const isDirectPush = branch === process.env.GITHUB_REF_NAME && !process.env.GITHUB_HEAD_REF;
            if (branch && !isDirectPush) {
              await this.createFixPR(branch);
            }
            modifiedFiles.clear();
          }
        }
      }

      if (!anyFixed) {
        logger.info("runFix: no files were modified in this cycle — fix loop cannot make progress, exiting");
        break;
      }
    }

    if (modifiedFiles.size > 0 && !this.config.dry_run) {
      const branch = await this.pushFixes(modifiedFiles);
      const isDirectPush = branch === process.env.GITHUB_REF_NAME && !process.env.GITHUB_HEAD_REF;
      if (branch && !isDirectPush) {
        await this.createFixPR(branch);
      }
    }

    const summary = this.buildSummary("fix", allFindings, allFixAttempts);
    return {
      mode: "fix",
      summary,
      findings: allFindings,
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: allFixAttempts,
      metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  /** Commit and push fixed files, returning the target branch name. */
  private async pushFixes(modifiedFiles: Set<string>, tag?: string): Promise<string> {
    const { execFileSync } = await import("node:child_process");
    try {
      const fileArray = [...modifiedFiles];
      execFileSync("git", ["add", "--", ...fileArray], { cwd: this.root, stdio: "pipe" });

      try {
        execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: this.root, stdio: "pipe" });
        logger.info("pushFixes: no changes to commit — skipping");
        return "";
      } catch {
        // diff exists — we can commit
      }

      const headRef = process.env.GITHUB_HEAD_REF || "";
      const refName = process.env.GITHUB_REF_NAME || "";
      let target: string;

      if (headRef) {
        target = headRef;
      } else if (refName) {
        target = refName;
      } else {
        target = `codesentinel/fix-${Date.now()}`;
        execFileSync("git", ["checkout", "-b", target], { cwd: this.root, stdio: "pipe" });
      }

      const msg = tag ? `CodeSentinel: auto-fix issues ${tag}` : 'CodeSentinel: auto-fix issues [skip ci]';
      const gitName = process.env.CODESENTINEL_GIT_NAME || "CodeSentinel Bot";
      const gitEmail = process.env.CODESENTINEL_GIT_EMAIL || "bot@codesentinel.ai";
      execFileSync("git", ["config", "user.email", gitEmail], { cwd: this.root, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", gitName], { cwd: this.root, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", msg], { cwd: this.root, stdio: "pipe" });
      try {
        execFileSync("git", ["fetch", "origin", target], { cwd: this.root, stdio: "pipe", timeout: 30000 });
        execFileSync("git", ["rebase", `origin/${target}`], { cwd: this.root, stdio: "pipe", timeout: 30000 });
      } catch {
        logger.warn(`pushFixes: rebase failed for ${target}, will push to fix branch instead`);
        target = `codesentinel/fix-${Date.now()}`;
        execFileSync("git", ["checkout", "-b", target], { cwd: this.root, stdio: "pipe" });
      }
      execFileSync("git", ["push", "origin", `HEAD:${target}`, "--set-upstream"], { cwd: this.root, stdio: "pipe", timeout: 60000 });
      logger.info(`pushFixes: pushed ${fileArray.length} file(s) to ${target}`);
      return target;
    } catch (err) {
      logger.warn("pushFixes: failed to push:", err);
      return "";
    }
  }

  /** Create a PR from the fix branch and optionally enable auto-merge. */
  private async createFixPR(fixBranch: string): Promise<void> {
    // PAT (higher permissions) overrides the default GITHUB_TOKEN
    const token = process.env.CODESENTINEL_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    if (!fixBranch || !token) return;

    const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
    const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (!owner || !repo) return;

    const reporter = new GitHubReporter({ token, owner, repo });
    // Resolve the repo's actual default branch instead of assuming "main"
    let defaultBranch = process.env.GITHUB_BASE_REF;
    try {
      const { name } = await reporter.getDefaultBranch();
      defaultBranch = name;
    } catch {
      defaultBranch = defaultBranch || "main";
    }

    try {
      const prNumber = await reporter.createPR({
        title: "CodeSentinel: auto-fix issues",
        body: "This PR was automatically created by CodeSentinel AI to fix code quality issues.",
        head: fixBranch,
        base: defaultBranch,
      });
      logger.info(`createFixPR: created PR #${prNumber} from ${fixBranch} to ${defaultBranch}`);

      if (this.config.autoMerge) {
        await reporter.enableAutoMerge(prNumber, "squash");
        logger.info(`createFixPR: enabled auto-merge on PR #${prNumber}`);
      }
    } catch (err) {
      logger.warn("createFixPR: failed:", err);
    }
  }

  /** Generate and (optionally) write a fix for a single finding. */
  private async applyFix(
    finding: Finding,
    iteration: number,
  ): Promise<FixAttempt> {
    const filePath = resolve(this.root, finding.file);
    const content = readText(filePath);
    if (!content.trim()) {
      return {
        iteration,
        file: finding.file,
        fixed: false,
        explanation: "File content is empty or file not found.",
        verified: false,
        newIssuesIntroduced: [],
      };
    }

    const numberedContent = content.split("\n").map((line, idx) => `${idx + 1}: ${line}`).join("\n");
    const redactedContent = redactSecrets(numberedContent, this.config.secretPatterns);
    const MAX_FILE_CHARS = 30000;
    const truncatedContent = redactedContent.length > MAX_FILE_CHARS
      ? redactedContent.slice(0, redactedContent.lastIndexOf("\n", MAX_FILE_CHARS)) + `\n\n// ... [file truncated from ${redactedContent.length} to ${MAX_FILE_CHARS} chars]`
      : redactedContent;

    const prompt = `You are an expert engineer fixing an issue in ${finding.file}.

## File Content
\`\`\`${finding.file.split(".").pop() ?? "text"}
${truncatedContent}
\`\`\`

## Issue
Severity: ${finding.severity}
Category: ${finding.category}
Line: ${finding.line ?? "N/A"}
Feedback: ${finding.comment}
Suggestion: ${finding.suggestion ?? ""}

## Rules
- Fix the listed issue with minimal changes.
- Return changes as "hunks" (line-based patch), NOT the complete file.
- Set "fixed": false if you cannot safely fix any issue.
- hunks format: { startLine: <1-indexed>, deleteCount: <lines to remove>, newLines: ["replacement", "lines"] } (Do NOT include the line number prefix in newLines)
- Output ONLY valid JSON inside \`\`\`json ... \`\`\` with NO other text.  
- JSON format: { "fixed": bool, "explanation": "...", "hunks": [...] }`;

    logger.info(`applyFix[${iteration}]: prompt=${JSON.stringify(finding.file)} severity=${finding.severity} category=${finding.category}`);
    let parsed: { fixed: boolean; explanation: string; hunks: Hunk[] } | null = null;
    for (let attempt = 0; attempt < 1; attempt++) {
      if (attempt > 0) {
        logger.info(`applyFix[${iteration}]: retry ${attempt + 1} for ${finding.file}`);
      }
      const res = await this.ai.complete("fix", [
        { role: "system", content: "You apply minimal, safe code fixes." },
        { role: "user", content: prompt + (attempt > 0 ? "\n\nIMPORTANT: You MUST output ONLY valid JSON. No explanations, no markdown, no extra text. The JSON must parse correctly." : "") },
      ], { responseFormat: "json_object" });

      const snippet = res.content.length > 500 ? res.content.slice(0, 500) + "..." : res.content;
      logger.info(`applyFix[${iteration}]: AI response len=${res.content.length} preview=${JSON.stringify(snippet)}`);

      parsed = extractJson<{ fixed: boolean; explanation: string; hunks: Hunk[] }>(res.content);
      if (parsed) break;
      logger.warn(`applyFix[${iteration}]: unparseable response (attempt ${attempt + 1}/1) — raw snippet: ${JSON.stringify(snippet)}`);
    }
    if (!parsed) {
      return { iteration, file: finding.file, fixed: false, explanation: "AI returned unparseable response after 1 attempts", verified: false, newIssuesIntroduced: [] };
    }

    let verified = false;
    let newIssuesIntroduced: Finding[] = [];
    if (parsed.fixed && this.config.enable_auto_fix && !this.config.dry_run) {
      const fixedContent = applyHunks(content, parsed.hunks ?? []);
      if (fixedContent === content) {
        logger.info(`applyFix[${iteration}]: hunks produced no changes — treating as not fixed`);
        return { iteration, file: finding.file, fixed: false, explanation: "AI returned hunks that produced no changes", verified: false, newIssuesIntroduced: [] };
      }

      const findingsBefore = this.analyzer.analyzeMany([{ path: finding.file, content }]);
      writeFileSync(filePath, fixedContent, "utf8");
      verified = await this.runVerification();
      if (!verified) {
        writeFileSync(filePath, content, "utf8");
        logger.warn(`applyFix[${iteration}]: verification failed — rolled back ${finding.file}`);
        return { iteration, file: finding.file, fixed: false, explanation: "Fix failed verification (typecheck/tests), rolled back", verified: false, newIssuesIntroduced: [] };
      }

      // Re-analyze the fixed file to detect new issues introduced
      const contentAfter = readText(filePath);
      const findingsAfter = this.analyzer.analyzeMany([{ path: finding.file, content: contentAfter }]);
      const beforeIds = new Set(findingsBefore.map((f) => `${f.category}:${f.line}:${f.comment}`));
      newIssuesIntroduced = findingsAfter.filter((f) => {
        const id = `${f.category}:${f.line}:${f.comment}`;
        return !beforeIds.has(id);
      });
      if (newIssuesIntroduced.length > 0) {
        logger.warn(`applyFix[${iteration}]: fix introduced ${newIssuesIntroduced.length} new finding(s)`);
      }
    }
    return {
      iteration,
      file: finding.file,
      fixed: parsed.fixed === true,
      explanation: parsed.explanation,
      verified,
      newIssuesIntroduced,
    };
  }

  /** Apply fixes for ALL findings in a single file in ONE AI call. */
  private async batchApplyFix(
    filePath: string,
    findings: Finding[],
    iteration: number,
  ): Promise<FixAttempt> {
    const absPath = resolve(this.root, filePath);
    const content = readText(absPath);
    if (!content.trim()) {
      return { iteration, file: filePath, fixed: false, explanation: "File content is empty or file not found.", verified: false, newIssuesIntroduced: [] };
    }
    const issuesMd = findings.map((f, i) =>
      `### Issue ${i + 1}\nSeverity: ${f.severity}\nCategory: ${f.category}\nLine: ${f.line ?? "N/A"}\nFeedback: ${f.comment}\nSuggestion: ${f.suggestion ?? ""}`
    ).join("\n\n");

    // Redact secrets before sending fix prompt to AI provider
    const numberedContent = content.split("\n").map((line, idx) => `${idx + 1}: ${line}`).join("\n");
    const redactedContent = redactSecrets(numberedContent, this.config.secretPatterns);

    const MAX_FILE_CHARS = 30000;
    const truncatedContent = redactedContent.length > MAX_FILE_CHARS
      ? redactedContent.slice(0, redactedContent.lastIndexOf("\n", MAX_FILE_CHARS)) + `\n\n// ... [file truncated from ${redactedContent.length} to ${MAX_FILE_CHARS} chars]`
      : redactedContent;

    const prompt = `You are an expert engineer fixing ${findings.length} issue(s) in ${filePath}.

## File Content
\`\`\`${filePath.split(".").pop() ?? "text"}
${truncatedContent}
\`\`\`

## Issues to Fix
${issuesMd}

## Rules
- Fix ALL listed issues with minimal changes.
- Return changes as "hunks" (line-based patch), NOT the complete file.
- Set "fixed": false if you cannot safely fix any issue.
- hunks format: { startLine: <1-indexed>, deleteCount: <lines to remove>, newLines: ["replacement", "lines"] } (Do NOT include the line number prefix in newLines)
- Output ONLY valid JSON inside \`\`\`json ... \`\`\` with NO other text.  
- JSON format: { "fixed": bool, "explanation": "...", "hunks": [...] }`;

    logger.info(`batchApplyFix[${iteration}]: ${filePath} — ${findings.length} issues`);
    let parsed: { fixed: boolean; explanation: string; hunks: Hunk[] } | null = null;
    for (let attempt = 0; attempt < 1; attempt++) {
      if (attempt > 0) {
        logger.info(`batchApplyFix[${iteration}]: retry ${attempt + 1} for ${filePath}`);
      }
      const res = await this.ai.complete("fix", [
        { role: "system", content: "You apply minimal, safe code fixes." },
        { role: "user", content: prompt + (attempt > 0 ? "\n\nIMPORTANT: You MUST output ONLY valid JSON. No explanations, no markdown, no extra text. The JSON must parse correctly." : "") },
      ], { responseFormat: "json_object" });

      const snippet = res.content.length > 500 ? res.content.slice(0, 500) + "..." : res.content;
      logger.info(`batchApplyFix[${iteration}]: AI response len=${res.content.length} preview=${JSON.stringify(snippet)}`);

      parsed = extractJson<{ fixed: boolean; explanation: string; hunks: Hunk[] }>(res.content);
      if (parsed) break;
      logger.warn(`batchApplyFix[${iteration}]: unparseable response (attempt ${attempt + 1}/1) — raw snippet: ${JSON.stringify(snippet)}`);
    }
    if (!parsed) {
      return { iteration, file: filePath, fixed: false, explanation: "AI returned unparseable response after 1 attempts", verified: false, newIssuesIntroduced: [] };
    }

    let verified = false;
    let newIssuesIntroduced: Finding[] = [];
    if (parsed.fixed && this.config.enable_auto_fix && !this.config.dry_run) {
      const fixedContent = applyHunks(content, parsed.hunks ?? []);
      if (fixedContent === content) {
        logger.info(`batchApplyFix[${iteration}]: hunks produced no changes — treating as not fixed`);
        return { iteration, file: filePath, fixed: false, explanation: "AI returned hunks that produced no changes", verified: false, newIssuesIntroduced: [] };
      }
      const findingsBefore = this.analyzer.analyzeMany([{ path: filePath, content }]);
      writeFileSync(absPath, fixedContent, "utf8");
      verified = await this.runVerification();
      if (!verified) {
        // Rollback: verification failed (typecheck/tests), restore original content
        writeFileSync(absPath, content, "utf8");
        logger.warn(`batchApplyFix[${iteration}]: verification failed — rolled back ${filePath}`);
        return { iteration, file: filePath, fixed: false, explanation: "Fix failed verification (typecheck/tests), rolled back", verified: false, newIssuesIntroduced: [] };
      }
      const contentAfter = readText(absPath);
      const findingsAfter = this.analyzer.analyzeMany([{ path: filePath, content: contentAfter }]);
      const beforeIds = new Set(findingsBefore.map((f) => `${f.category}:${f.line}:${f.comment}`));
      newIssuesIntroduced = findingsAfter.filter((f) => !beforeIds.has(`${f.category}:${f.line}:${f.comment}`));
    }
    return { iteration, file: filePath, fixed: parsed.fixed === true, explanation: parsed.explanation, verified, newIssuesIntroduced };
  }

  /** Single-pass fix: one prompt for ALL files, one AI response, then apply every fix. */
  private async batchApplyFixAll(
    fileGroups: Map<string, Finding[]>,
  ): Promise<FixAttempt[]> {
    const MAX_TOTAL_CHARS = 120_000;
    const fileEntries: { path: string; content: string; findings: Finding[] }[] = [];

    for (const [filePath, findings] of fileGroups) {
      const absPath = resolve(this.root, filePath);
      const rawContent = readText(absPath);
      if (!rawContent.trim()) continue;
      const numberedContent = rawContent.split("\n").map((line, idx) => `${idx + 1}: ${line}`).join("\n");
      const redactedContent = redactSecrets(numberedContent, this.config.secretPatterns);
      const truncatedContent = redactedContent.length > 30000
        ? redactedContent.slice(0, redactedContent.lastIndexOf("\n", 30000)) + `\n\n// ... [file truncated]`
        : redactedContent;
      fileEntries.push({ path: filePath, content: truncatedContent, findings });
    }

    const promptBody = fileEntries.map((fe) => {
      const ext = fe.path.split(".").pop() ?? "text";
      const issuesMd = fe.findings.map((f, i) =>
        `  ${i + 1}. [${f.severity}] ${f.category}${f.line ? ` (line ${f.line})` : ""}\n     Feedback: ${f.comment}\n     Suggestion: ${f.suggestion ?? ""}`
      ).join("\n");
      return `## ${fe.path}\n\`\`\`${ext}\n${fe.content}\n\`\`\`\n\nIssues:\n${issuesMd}`;
    }).join("\n\n---\n\n");

    if (promptBody.length > MAX_TOTAL_CHARS) {
      logger.info(`batchApplyFixAll: prompt too large (${promptBody.length} chars > ${MAX_TOTAL_CHARS}), falling back to per-file batching`);
      return [];
    }

    const prompt = `You are an expert engineer fixing issues across ${fileEntries.length} file(s).

${promptBody}

## Rules
- Fix ALL listed issues with minimal changes.
- Return changes per file as hunks (line-based patches), NOT complete files.
- Set "fixed" to false per-file if you cannot safely fix any issue.
- hunks format: { startLine: <1-indexed>, deleteCount: <lines to remove>, newLines: ["replacement", "lines"] }
- Output ONLY valid JSON inside \`\`\`json ... \`\`\` with NO other text.
- JSON format: { "fixed": bool, "explanation": "...", "fileFixes": [ { "file": "...", "explanation": "...", "hunks": [...] } ] }`;

    logger.info(`batchApplyFixAll: ${fileEntries.length} files, ${promptBody.length} chars`);

    const res = await this.ai.complete("fix", [
      { role: "system", content: "You apply minimal, safe code fixes across multiple files." },
      { role: "user", content: prompt },
    ], { responseFormat: "json_object" });

    type FileFix = { file: string; explanation: string; hunks: Hunk[] };
    const parsed = extractJson<{ fixed: boolean; explanation: string; fileFixes: FileFix[] }>(res.content);
    if (!parsed?.fileFixes) {
      logger.warn(`batchApplyFixAll: unparseable response`);
      return [];
    }

    const allFixes: FixAttempt[] = [];
    for (const ff of parsed.fileFixes) {
      if (!ff.hunks?.length) {
        allFixes.push({ iteration: 0, file: ff.file, fixed: false, explanation: ff.explanation || "No hunks returned", verified: false, newIssuesIntroduced: [] });
        continue;
      }
      const absPath = resolve(this.root, ff.file);
      const originalContent = readText(absPath);
      if (!originalContent.trim()) {
        allFixes.push({ iteration: 0, file: ff.file, fixed: false, explanation: "File not found", verified: false, newIssuesIntroduced: [] });
        continue;
      }
      const fixedContent = applyHunks(originalContent, ff.hunks ?? []);
      if (fixedContent === originalContent) {
        allFixes.push({ iteration: 0, file: ff.file, fixed: false, explanation: "Hunks produced no changes", verified: false, newIssuesIntroduced: [] });
        continue;
      }
      writeFileSync(absPath, fixedContent, "utf8");
      const verified = await this.runVerification();
      if (!verified) {
        writeFileSync(absPath, originalContent, "utf8");
        allFixes.push({ iteration: 0, file: ff.file, fixed: false, explanation: "Fix failed verification, rolled back", verified: false, newIssuesIntroduced: [] });
      } else {
        const newIssues = this.analyzer.analyzeMany([{ path: ff.file, content: fixedContent }])
          .filter((f) => !fileGroups.get(ff.file)?.some((of) => `${of.category}:${of.line}:${of.comment}` === `${f.category}:${f.line}:${f.comment}`));
        allFixes.push({ iteration: 0, file: ff.file, fixed: true, explanation: ff.explanation, verified, newIssuesIntroduced: newIssues });
      }
    }
    return allFixes;
  }

  /** Apply fixes for a batch of findings without the full re-analysis loop. */
  private async runFixLoopFor(actionable: Finding[]): Promise<{ fixAttempts: FixAttempt[] }> {
    const allFixAttempts: FixAttempt[] = [];
    const modifiedFiles = new Set<string>();
    const maxFixesPerFinding = 3;

    for (const finding of actionable) {
      let success = false;
      for (let attempt = 1; attempt <= maxFixesPerFinding; attempt++) {
        try {
          const result = await this.applyFix(finding, attempt);
          allFixAttempts.push(result);
          if (result.fixed && result.verified) {
            modifiedFiles.add(finding.file);
            success = true;
            break;
          }
          if (result.fixed) {
            modifiedFiles.add(finding.file);
          }
        } catch (err) {
          allFixAttempts.push({
            iteration: attempt,
            file: finding.file,
            fixed: false,
            explanation: `Error: ${err instanceof Error ? err.message : err}`,
            verified: false,
            newIssuesIntroduced: [],
          });
        }
      }
      if (!success) {
        logger.warn(`runFixLoopFor: failed to fix ${finding.file}:${finding.line} after ${maxFixesPerFinding} attempts`);
      }
    }

    if (modifiedFiles.size > 0) {
      await this.pushFixes(modifiedFiles);
    }

    return { fixAttempts: allFixAttempts };
  }

  /** Run lint + tests after a fix. Best-effort; returns true if both pass. */
  private async runVerification(): Promise<boolean> {
    const { execSync } = await import("node:child_process");
    let allPassed = true;

    // Run typecheck
    try {
      execSync("npx tsc --noEmit", { cwd: this.root, stdio: "ignore", timeout: 30000 });
    } catch {
      logger.warn("runVerification: typecheck failed — fix introduced syntax/type errors");
      allPassed = false;
    }

    // Run tests
    try {
      if (this.config.test_runner === "jest") {
        execSync("npx jest --passWithNoTests", { cwd: this.root, stdio: "ignore" });
      } else {
        execSync("npx vitest run --passWithNoTests", { cwd: this.root, stdio: "ignore" });
      }
    } catch {
      allPassed = false;
    }

    // Run linters if enabled — only fail if new findings were introduced
    if (this.config.linters.enabled) {
      const linterFindings = runLinters(this.root, {
        tools: this.config.linters.tools,
        args: this.config.linters.args,
      });
      if (linterFindings.length > 0) {
        const beforeCount = (this._linterBaseline?.size ?? 0);
        const newCount = linterFindings.filter(f => !this._linterBaseline?.has(`${f.file}:${f.line}:${f.comment}`)).length;
        if (newCount > 0) {
          logger.warn(`runVerification: linter reported ${linterFindings.length} finding(s) (${newCount} new) after fix`);
          allPassed = false;
        }
      }
    }

    return allPassed;
  }

  /** Pre-fix linter baseline for delta comparison. */
  private _linterBaseline: Set<string> | null = null;

  // ---------------------------------------------------------------------------
  // AUDIT
  // ---------------------------------------------------------------------------
  private async runAudit(): Promise<EngineReport> {
    let files = await this.collectedFiles();
    const targetDirs = this.config.auditTargetDirs;
    if (targetDirs && targetDirs.length > 0) {
      files = files.filter((f) => targetDirs.some((d) => f.path.startsWith(d)));
      if (files.length === 0) {
        return {
          mode: "audit",
          summary: "No files matched the configured audit target directories.",
          findings: [],
          score: null,
          comments: [],
          generatedTests: [],
          fixAttempts: [],
          metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 },
        };
      }
    }

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
    const parsed = extractJson<{ summary: string; findings: any[] }>(res.content) ?? { summary: "", findings: [] };

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
      hashes: files.map((f) => this.cache.contentHash(f.content)).sort(),
    };
    try {
      const cached = this.config.enable_cache
        ? this.cache.get<{ readability: number; maintainability: number; security: number; test_coverage: number; rationale: string }>("score", cacheKey)
        : null;
      const ai = cached ?? (await this.callScoreAI(files));
      if (!cached && this.config.enable_cache) this.cache.set("score", cacheKey, ai);
      return this.scorer.blendWithAI(baseline, ai, ai.rationale, this.config.securityBlendStrategy);
    } catch {
      return baseline;
    }
  }

  // ---------------------------------------------------------------------------
  // TESTGEN
  // ---------------------------------------------------------------------------
  private async runTestgen(): Promise<EngineReport> {
    if (!this.aiAvailable) {
      return {
        mode: "testgen",
        summary: "AI provider not reachable. Start opencode (`opencode`) or set another provider via `--provider`.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 },
      };
    }
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
    if (!this.aiAvailable) {
      return {
        mode: "chat",
        summary: "AI provider not reachable. Start opencode (`opencode`) or set another provider via `--provider`.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 },
      };
    }
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

  // ---------------------------------------------------------------------------
  // DESCRIBE
  // ---------------------------------------------------------------------------
  private async runDescribe(): Promise<EngineReport> {
    if (!this.aiAvailable) {
      return {
        mode: "describe",
        summary: "AI provider not reachable. Start opencode (`opencode`) or set another provider via `--provider`.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 },
      };
    }
    const files = await this.collectedFiles();
    const diff = files
      .map((f) => `### ${f.path}${f.diff ? `\n\`\`\`diff\n${f.diff}\n\`\`\`` : ""}`)
      .join("\n\n")
      .slice(0, 60000);

    const prompt = this.prompts.render("describe", {
      project_context: this.config.project_context || "(none)",
      diff,
    });
    const res = await this.ai.complete("describe", [
      { role: "system", content: "You write concise, structured PR descriptions." },
      { role: "user", content: prompt },
    ]);
    const parsed = extractJson<{
      title: string;
      description: string;
      type: string;
      breakingChanges: boolean;
      highlights: string[];
      todo: string[];
    }>(res.content) ?? { title: "PR Description", description: "", type: "chore", breakingChanges: false, highlights: [], todo: [] };

    const summary = [
      `## ${parsed.title ?? "PR Description"}`,
      "",
      `**Type:** ${parsed.type ?? "chore"}`,
      parsed.breakingChanges ? "**⚠ Breaking Changes**" : "",
      "",
      parsed.description ?? "",
      "",
      parsed.highlights?.length ? "### Highlights\n- " + parsed.highlights.join("\n- ") : "",
      "",
      parsed.todo?.length ? "### TODO\n- " + parsed.todo.join("\n- ") : "",
    ].filter(Boolean).join("\n");

    return {
      mode: "describe",
      summary,
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

  /** Generate an implementation plan from an issue title + description. */
  async generatePlan(title: string, description: string): Promise<string> {
    if (!this.aiAvailable) return "AI provider not reachable.";
    const prompt = this.prompts.render("plan", {
      title,
      description,
      project_context: this.config.project_context || "(none)",
    });
    const res = await this.ai.complete("plan", [
      { role: "system", content: "You generate structured implementation plans for GitHub issues." },
      { role: "user", content: prompt },
    ]);
    return res.content;
  }

  private async runPlan(): Promise<EngineReport> {
    const title = this.config.issue_title || "Untitled Issue";
    const description = this.config.issue_body || "No description provided.";
    const planContent = await this.generatePlan(title, description);
    const parsed = extractJson<{
      title: string; priority: string; summary: string; rootCause: string;
      affectedFiles: { path: string; lines: string; change: string }[];
      steps: { step: number; file: string; action: string }[];
      questions: string[];
    }>(planContent);

    const summaryParts: string[] = [];
    if (parsed) {
      summaryParts.push(`## Implementation Plan: ${parsed.title}`);
      summaryParts.push(`**Priority:** ${parsed.priority}`);
      summaryParts.push("");
      summaryParts.push(parsed.summary);
      summaryParts.push("");
      summaryParts.push("### Root Cause");
      summaryParts.push(parsed.rootCause);
      summaryParts.push("");
      summaryParts.push("### Affected Files");
      for (const f of parsed.affectedFiles) {
        summaryParts.push(`- \`${f.path}\` (${f.lines}) — ${f.change}`);
      }
      summaryParts.push("");
      summaryParts.push("### Steps");
      for (const s of parsed.steps) {
        summaryParts.push(`${s.step}. **${s.file}**: ${s.action}`);
      }
      if (parsed.questions?.length) {
        summaryParts.push("");
        summaryParts.push("### ❓ Clarifying Questions");
        for (const q of parsed.questions) {
          summaryParts.push(`- ${q}`);
        }
        summaryParts.push("");
        summaryParts.push("Reply to answer questions, then comment `/fix` to start implementation.");
      }
    } else {
      summaryParts.push("## Implementation Plan");
      summaryParts.push("");
      summaryParts.push(planContent);
    }

    return {
      mode: "plan",
      summary: summaryParts.join("\n"),
      findings: [],
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  // ---------------------------------------------------------------------------
  // IMPROVE — auto-improvement mode (testgen / utility gen / doc gen)
  // ---------------------------------------------------------------------------
  private async runImprove(): Promise<EngineReport> {
    const type = this.config.improve_type || "test";
    logger.info(`runImprove: type=${type}`);

    switch (type) {
      case "test":
        return this.runTestgen();
      case "util":
        return this.runGenerateUtilities();
      case "doc":
        return this.runGenerateDocs();
      default:
        return {
          mode: "improve",
          summary: `Unknown improve type: ${type}`,
          findings: [],
          score: null,
          comments: [],
          generatedTests: [],
          fixAttempts: [],
          metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 },
        };
    }
  }

  /** AI-powered utility function generation. */
  private async runGenerateUtilities(): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const code = files.map((f) => `### ${f.path}\n${f.content}`).join("\n\n").slice(0, 60000);

    const prompt = this.prompts.render("generate-utils", {
      project_context: this.config.project_context || "(none)",
      code,
    });
    const res = await this.ai.complete("testgen", [
      { role: "system", content: "You generate utility functions for TypeScript/Node.js projects." },
      { role: "user", content: prompt },
    ]);
    const parsed = extractJson<{ files: { path: string; content: string }[]; summary: string }>(res.content);

    if (!parsed || !parsed.files?.length) {
      return {
        mode: "improve",
        summary: "No utilities generated. AI returned no valid output.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
      };
    }

    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    for (const f of parsed.files) {
      const abs = resolve(this.root, f.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.content, "utf8");
      logger.info(`runGenerateUtilities: wrote ${f.path}`);
    }

    return {
      mode: "improve",
      summary: parsed.summary || `Generated ${parsed.files.length} utility file(s).`,
      findings: [],
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  /** AI-powered documentation generation. */
  private async runGenerateDocs(): Promise<EngineReport> {
    const files = await this.collectedFiles();
    const code = files.map((f) => `### ${f.path}\n${f.content}`).join("\n\n").slice(0, 60000);

    const prompt = this.prompts.render("generate-docs", {
      project_context: this.config.project_context || "(none)",
      code,
    });
    const res = await this.ai.complete("testgen", [
      { role: "system", content: "You generate JSDoc/TSDoc documentation for TypeScript functions." },
      { role: "user", content: prompt },
    ]);
    const parsed = extractJson<{ files: { path: string; content: string }[]; summary: string }>(res.content);

    if (!parsed || !parsed.files?.length) {
      return {
        mode: "improve",
        summary: "No documentation generated. AI returned no valid output.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
      };
    }

    const { writeFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const f of parsed.files) {
      const abs = resolve(this.root, f.path);
      writeFileSync(abs, f.content, "utf8");
      logger.info(`runGenerateDocs: updated ${f.path}`);
    }

    return {
      mode: "improve",
      summary: parsed.summary || `Updated ${parsed.files.length} file(s) with documentation.`,
      findings: [],
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 },
    };
  }

  // ---------------------------------------------------------------------------
  // Low-level AI calls (with JSON parsing).
  // ---------------------------------------------------------------------------
  private async callAI(
    task: "review",
    promptName: PromptName,
    file: { path: string; content: string; diff?: string },
    maxTokensOverride?: number,
  ): Promise<{ findings: any[]; outputFormat?: string }> {
    const code = file.diff && file.diff.trim() ? file.diff : file.content;
    let projectContext = this.config.project_context || "(none)";

    // Enrich with MCP context if available
    if (this.mcp) {
      const libs = projectContext.split(/[,;\s]+/).filter(Boolean);
      const mcpCtx = libs.length ? await this.mcp.getLibraryDocs(libs) : [];
      if (mcpCtx.length) {
        projectContext += `\n\n### MCP Library Context\n${mcpCtx.map((e) => e.content).join("\n")}`;
      }
    }

    // Inject past lessons from the learning store
    if (this.learning) {
      try {
        const ext = file.path.split(".").pop() ?? "";
        const lessons = await this.learning.getRelevantLessons(ext);
        if (lessons.length) {
          projectContext += `\n\n### Historical Lessons (frequent past issues in ${ext} files)\n- ${lessons.join("\n- ")}`;
        }
      } catch { /* best-effort */ }
    }

    // Inject active prompt overrides
    if (this.learning && this.config.learning.metaReview) {
      try {
        const overrides = await this.learning.getActivePromptOverrides(task);
        if (overrides.length) {
          projectContext += `\n\n### Custom Instructions\n${overrides.join("\n")}`;
        }
      } catch { /* best-effort */ }
    }

    const prompt = this.prompts.render(promptName, {
      project_context: projectContext,
      language: file.path.split(".").pop() ?? "text",
      code,
      positive_feedback_instruction: this.config.include_positive_feedback
        ? "Also include up to 2 praise findings where the code is exemplary."
        : "Do not include positive/praise feedback.",
      output_format: this.config.jsonl_output ? "JSONL" : "JSON",
    });

    const preview = prompt.length > 300 ? prompt.slice(0, 300) + "..." : prompt;
    logger.info(`callAI: task=${task} prompt=${promptName} file=${file.path} prompt_preview=${JSON.stringify(preview)}`);

    const res = await this.ai.complete(task, [
      { role: "system", content: "You are an expert code reviewer." },
      { role: "user", content: prompt },
    ], { maxTokens: maxTokensOverride });
    logger.info(`callAI response: provider=${res.provider} model=${res.model} tokens_in=${res.usage?.promptTokens} tokens_out=${res.usage?.completionTokens} content_len=${res.content.length}`);

    const parsed = extractJson<{ findings: any[] }>(res.content, { detailed: true });

    // Detect truncation — retry once with double tokens
    if (parsed.truncated && !parsed.parsed) {
      this.truncatedCount++;
      const modelConfig = this.ai.modelForTask(task);
      const currentTokens = maxTokensOverride ?? modelConfig.maxTokens ?? 65536;
      const doubledTokens = Math.min(currentTokens * 2, 32768);
      logger.warn(`callAI: truncated response for ${file.path} — retrying with maxTokens=${doubledTokens} (was ${currentTokens})`);
      const res2 = await this.ai.complete(task, [
        { role: "system", content: "You are an expert code reviewer." },
        { role: "user", content: prompt },
      ], { maxTokens: doubledTokens });
      logger.info(`callAI retry response: provider=${res2.provider} model=${res2.model} tokens_in=${res2.usage?.promptTokens} tokens_out=${res2.usage?.completionTokens} content_len=${res2.content.length}`);

      const parsed2 = extractJson<{ findings: any[] }>(res2.content, { detailed: true });
      if (parsed2.parsed) {
        if (parsed2.repaired) this.repairedCount++;
        const finalFindings = this.#processFindings(file, parsed2.parsed, res2.content);
        return { findings: finalFindings };
      }
      // Even truncated retry failed — fall through to original attempt
      if (parsed2.truncated) this.truncatedCount++;
    }

    if (parsed.parsed) {
      if (parsed.repaired) this.repairedCount++;
    }

    const parsedFindings = parsed.parsed?.findings ?? [];

    // Try JSONL if configured
    let finalFindings = parsedFindings;
    if (this.config.jsonl_output && !parsedFindings.length) {
      const jsonlResult = parseJsonlString(res.content);
      if (jsonlResult.length) {
        const normalized = validateAndNormalize(jsonlResult);
        finalFindings = normalized.issues.map((i) => ({
          file: i.file,
          line: i.line,
          severity: i.severity,
          message: i.message,
          category: i.category,
          suggestion: i.suggestion,
          source: "ai" as const,
        }));
      }
    }

    // Record in learning store if enabled
    if (this.learning && finalFindings.length) {
      try {
        for (const f of finalFindings) {
          await this.learning.recordFinding({
            file: file.path,
            line: f.line,
            severity: f.severity || "info",
            category: f.category || f.type || "unknown",
            message: f.message || f.comment || "",
            suggestion: f.suggestion,
            source: "ai",
          });
        }
      } catch { /* best-effort */ }
    }

    return { findings: finalFindings };
  }

  /** Helper: process findings from extracted JSON, including JSONL fallback. */
  #processFindings(
    file: { path: string },
    parsed: { findings?: any[] },
    rawContent: string,
  ): any[] {
    const pf = parsed.findings ?? [];
    if (pf.length || !this.config.jsonl_output) return pf;
    const jsonlResult = parseJsonlString(rawContent);
    if (!jsonlResult.length) return pf;
    const normalized = validateAndNormalize(jsonlResult);
    return normalized.issues.map((i: any) => ({
      file: i.file,
      line: i.line,
      severity: i.severity,
      message: i.message,
      category: i.category,
      suggestion: i.suggestion,
      source: "ai" as const,
    }));
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
    return extractJson(res.content) ?? { readability: 50, maintainability: 50, security: 50, test_coverage: 50, rationale: "fallback" };
  }

  // ---------------------------------------------------------------------------
  // Reporting helpers.
  // ---------------------------------------------------------------------------
  private buildSummary(
    mode: string,
    findings: Finding[],
    fixAttempts?: FixAttempt[],
    aiSummaries?: string[],
  ): string {
    const counts = this.tallySeverity(findings);
    const strengths = findings.filter((f) => f.category === "praise");
    const issues = findings.filter((f) => f.category !== "praise");
    const criticalCount = counts["critical"] ?? 0;
    const highCount = counts["high"] ?? 0;
    const readyToMerge = criticalCount === 0 && highCount === 0;

    const parts: string[] = [];

    const narrative = aiSummaries?.filter(Boolean).join(" ") ?? "";
    if (narrative) {
      parts.push(narrative);
      parts.push("");
    }

    if (findings.length === 0) {
      parts.push("No issues found. The code looks clean.");
    } else {
      parts.push(`Found **${issues.length}** issue(s) and **${strengths.length}** positive observation(s).`);
      const severityParts = Object.entries(counts)
        .filter(([k]) => k !== "praise")
        .map(([k, v]) => `**${k}**: ${v}`);
      if (severityParts.length) {
        parts.push(`Severity breakdown: ${severityParts.join(", ")}.`);
      }
    }

    if (this.truncatedCount > 0) {
      parts.push(`⚠ **AI response truncation:** ${this.truncatedCount} file(s) hit the output token limit, ${this.repairedCount} repaired automatically. Some findings may be incomplete.`);
    }
    parts.push("");
    parts.push(`**Ready to merge?** ${readyToMerge}`);

    if (issues.length > 0) {
      const top = issues.slice(0, 3);
      const reasons = top.map(
        (i) => `${i.file}${i.line ? `:${i.line}` : ""} — ${i.comment}`,
      );
      parts.push(`\n**Reasoning:** ${reasons.join("; ")}`);
    }

    if (strengths.length > 0) {
      parts.push(`\n### Strengths\n`);
      for (const s of strengths) {
        parts.push(
          `- **${s.file}${s.line ? `:${s.line}` : ""}** — ${s.comment}`,
        );
      }
    }

    if (issues.length > 0) {
      const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      const MAX_VISIBLE = 5;
      const sorted = [...issues].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99),
      );
      const visible = sorted.slice(0, MAX_VISIBLE);
      const hidden = sorted.length - MAX_VISIBLE;

      parts.push(`\n### Issues (showing ${visible.length} of ${sorted.length})\n`);
      for (const i of visible) {
        const label =
          i.severity === "critical" || i.severity === "high"
            ? `**[${i.severity.toUpperCase()}]** `
            : "";
        parts.push(
          `- ${label}**${i.file}${i.line ? `:${i.line}` : ""}** — ${i.comment}${i.suggestion ? `\n  > Suggestion: ${i.suggestion}` : ""}`,
        );
      }
      if (hidden > 0) {
        parts.push(`\n_… and ${hidden} more issues. Check the report file for the full list._`);
      }
    }

    if (fixAttempts && fixAttempts.length > 0) {
      const success = fixAttempts.filter((a) => a.fixed && a.verified).length;
      const MAX_ATTEMPTS = 10;
      const show = fixAttempts.slice(-MAX_ATTEMPTS);
      const hidden = fixAttempts.length - MAX_ATTEMPTS;
      parts.push(`\n### Fix Attempts\n`);
      parts.push(`Fixes applied & verified: **${success}/${fixAttempts.length}**`);
      for (const a of show) {
        parts.push(
          `- ${a.fixed ? "✅" : "❌"} **${a.file}** — ${a.explanation}`,
        );
      }
      if (hidden > 0) {
        parts.push(`\n_… and ${hidden} earlier attempts omitted._`);
      }
    }

    return parts.join("\n");
  }

  private tallySeverity(findings: Finding[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    return counts;
  }

  private finalizeReport(report: EngineReport): void {
    report.metrics.findingsBySeverity = this.tallySeverity(report.findings);
    report.metrics.truncatedResponses = this.truncatedCount;
    report.metrics.repairedResponses = this.repairedCount;
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
