import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";

import { Engine, configFromInputs, type EngineReport } from "../engine/index.js";
import { GitHubReporter } from "./reporter.js";
import type { Mode, RuntimeSecrets } from "../config/types.js";
import type { Finding } from "../analyzer/index.js";
import type { ScoreBreakdown } from "../scorer/index.js";
import { logger } from "../utils/logger.js";
import { setupOpenCode } from "../opencode/installer.js";

const MAX_SCORE = 100;
const MAX_ANNOTATIONS = 50;

function getInput(key: string): string | undefined {
  return process.env[`INPUT_${key.replace(/-/g, "_").toUpperCase()}`];
}

/** Read all GitHub Action inputs from the environment (INPUT_<NAME>). */
function readInputs() {
  return {
    mode: getInput("mode"),
    max_iterations: getInput("max_iterations"),
    enable_auto_fix: getInput("enable_auto_fix"),
    enable_scoring: getInput("enable_scoring"),
    enable_test_generation: getInput("enable_test_generation"),
    project_context: getInput("project_context"),
    test_runner: getInput("test_runner"),
    provider: getInput("provider"),
    auto_merge: getInput("auto_merge"),
    issue_title: getInput("issue_title"),
    issue_body: getInput("issue_body"),
    ask: getInput("ask"),
    use_opencode_cli: getInput("use_opencode_cli"),
  };
}

function buildSecrets(get: (key: string) => string | undefined): RuntimeSecrets {
  return {
    github_token: process.env.GITHUB_TOKEN,
    openai_api_key: process.env.OPENAI_API_KEY || get("openai_api_key"),
    anthropic_api_key: process.env.ANTHROPIC_API_KEY || get("anthropic_api_key"),
    gemini_api_key: process.env.GEMINI_API_KEY || get("gemini_api_key"),
    opencode_api_key: process.env.OPENCODE_API_KEY || get("opencode_api_key"),
    opencode_base_url: process.env.OPENCODE_BASE_URL || get("opencode_base_url"),
  };
}

/** Prepend a directory to PATH unless already present. */
function prependToPath(binDir: string): void {
  const existingPath = process.env.PATH ?? "";
  if (!existingPath.split(":").includes(binDir)) {
    process.env.PATH = `${binDir}:${existingPath}`;
  }
}

/** Install (or reuse) the OpenCode CLI and make it available on PATH. */
async function preparePath(useOpencodeCliFlag: boolean, opencodeVersion: string): Promise<void> {
  if (useOpencodeCliFlag) {
    try {
      const { binaryPath } = await setupOpenCode(opencodeVersion);
      prependToPath(dirname(binaryPath));
      logger.info(`action: OpenCode CLI installed at ${binaryPath}`);
    } catch (err) {
      logger.warn(`action: OpenCode CLI install failed (${err}), continuing without it`);
    }
  } else {
    // Also prepend the default install dir so system-installed opencode is found
    prependToPath(`${process.env.HOME ?? homedir()}/.codesentinel/bin`);
  }
}

/** Write the human-readable engine report to stdout. */
function printReport(report: EngineReport, outputMode: string): void {
  process.stdout.write(`\n=== CodeSentinel [${outputMode}] ===\n`);
  process.stdout.write(report.summary + "\n");
  if (report.score) {
    process.stdout.write(formatScore(report.score) + "\n");
  }
}

/** Render the 4-dimension score breakdown used in stdout and step summary. */
function formatScore(score: ScoreBreakdown): string {
  return (
    `Score: ${score.overall}/${MAX_SCORE} ` +
    `(readability ${score.readability}, maintainability ${score.maintainability}, ` +
    `security ${score.security}, coverage ${score.test_coverage})`
  );
}

/**
 * GitHub Action entrypoint. Reads inputs from the environment (set by action.yml
 * as INPUT_<NAME>), runs the engine, posts PR comments and writes the job
 * summary + metrics. Designed to be dependency-light (uses fetch for API).
 */
export async function runAction(): Promise<void> {
  const inputs = readInputs();

  const useOpencodeCliFlag = inputs.use_opencode_cli === "true";
  const opencodeVersion = getInput("opencode_version") || "latest";

  // When the OpenCode CLI mode is requested, install the binary (or use cached)
  // and prepend its directory to PATH so runner.ts can locate it.
  await preparePath(useOpencodeCliFlag, opencodeVersion);

  // Build config overrides from all inputs (including use_opencode_cli)
  const configOverrides = configFromInputs({ ...inputs, use_opencode_cli: useOpencodeCliFlag ? "true" : undefined });

  const secrets = buildSecrets(getInput);

  const runMode = (inputs.mode || "review") as Mode;
  const engine = Engine.fromInputs({
    configPath: getInput("config_path") || undefined,
    overrides: { ...configOverrides, mode: runMode, enable_auto_fix: configOverrides.enable_auto_fix ?? false },
    secrets,
  });

  // Handle chat mode with ask question
  if (runMode === "chat" && inputs.ask) {
    const answer = await engine.ask(inputs.ask);
    process.stdout.write(answer + "\n");
    return;
  }

  const autoMerge = configOverrides.autoMerge ?? false;
  const report = await engine.run();

  // Write human-readable output to stdout so workflows can capture it via tee
  const outputMode = report.mode ?? configOverrides.mode ?? "plan";
  printReport(report, outputMode);

  await publishOutputs(report, secrets, autoMerge);
}

/** Derive the PR/issue number from env or the GitHub event payload. */
function readPullNumber(): number | undefined {
  const envNum = process.env.GITHUB_PR_NUMBER;
  if (envNum) {
    const n = Number(envNum);
    return Number.isFinite(n) ? n : undefined;
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return undefined;
  try {
    const ev = JSON.parse(readFileSync(eventPath, "utf8")) as {
      pull_request?: { number?: number };
      issue?: { number?: number };
    };
    return ev.pull_request?.number ?? ev.issue?.number ?? undefined;
  } catch {
    return undefined;
  }
}

/** Post comments / issues and write the step summary + metrics outputs. */
async function publishOutputs(report: EngineReport, secrets: RuntimeSecrets, autoMerge = false): Promise<void> {
  const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const pullNumber = readPullNumber();
  const headSha = process.env.GITHUB_SHA;

  if (secrets.github_token && owner && repo) {
    await postToGitHub(report, { token: secrets.github_token, owner, repo, pullNumber, headSha, autoMerge });
  }

  // Step summary (rendered in the Actions UI).
  writeStepSummary(report);

  // Metrics as workflow outputs via GITHUB_OUTPUT (legacy ::set-output is deprecated).
  await writeMetricsOutput(report);
}

interface PublishContext {
  token: string;
  owner: string;
  repo: string;
  pullNumber?: number;
  headSha?: string;
  autoMerge: boolean;
}

/** Post PR comments, audit issues, gate check-run / status, and auto-merge. */
async function postToGitHub(report: EngineReport, ctx: PublishContext): Promise<void> {
  const reporter = new GitHubReporter({ token: ctx.token, owner: ctx.owner, repo: ctx.repo, pullNumber: ctx.pullNumber });
  for (const c of report.comments) {
    await reporter.postReviewComment({
      body: c.body,
      file: c.file,
      line: c.line,
      commitId: ctx.headSha,
    });
  }
  if (report.mode === "audit") {
    await postAuditIssues(reporter, report.findings);
  }

  // Create Check Run for gate mode
  if (report.mode === "gate" && ctx.headSha) {
    const annotations = await buildGateAnnotations(report.findings, ctx);

    await reporter.createCheckRun({
      name: "CodeSentinel Gate",
      headSha: ctx.headSha,
      status: "completed",
      conclusion: report.gatePassed ? "success" : "failure",
      output: {
        title: report.gatePassed ? "Quality Gate Passed" : "Quality Gate Failed",
        summary: report.summary,
        annotations,
      },
    });

    // Also set commit status
    await reporter.setCommitStatus({
      sha: ctx.headSha,
      state: report.gatePassed ? "success" : "failure",
      description: report.gatePassed ? "All gate checks passed" : "Gate checks failed",
      context: "codesentinel/gate",
    });

    // Auto-merge when gate passes
    if (report.gatePassed && ctx.autoMerge && ctx.pullNumber) {
      try {
        await reporter.mergePR(ctx.pullNumber, "squash");
        logger.info(`publishOutputs: merged PR #${ctx.pullNumber}`);
      } catch (err) {
        logger.warn(`publishOutputs: failed to merge PR #${ctx.pullNumber}: ${err}`);
      }
    }
  }
}

function writeStepSummary(report: EngineReport): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    writeFileSync(summaryPath, renderSummary(report), "utf8");
  }
}

async function writeMetricsOutput(report: EngineReport): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const { appendFileSync } = await import("node:fs");
    const score = report.score?.overall ?? "n/a";
    const findings = String(report.findings.length);
    appendFileSync(outputPath, `score=${score}\n`);
    appendFileSync(outputPath, `findings=${findings}\n`);
  }
}

function renderSummary(report: EngineReport): string {
  const lines = [`# CodeSentinel — ${report.mode}`, "", report.summary, ""];
  if (report.score) {
    lines.push(`**${formatScore(report.score)}**`);
  }
  if (report.gatePassed !== undefined) {
    lines.push(`**Gate:** ${report.gatePassed ? "PASSED" : "FAILED"}`);
  }
  return lines.join("\n");
}

/** Post one GitHub issue per audit finding. */
async function postAuditIssues(reporter: GitHubReporter, findings: Finding[]): Promise<void> {
  for (const f of findings) {
    await reporter.createIssue(
      `[${f.severity}] ${f.file}`,
      f.comment,
    );
  }
}

type Annotation = {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "failure" | "warning" | "notice";
  message: string;
};

/** Build check-run annotations from findings located in the PR diff. */
async function buildGateAnnotations(
  findings: Finding[],
  ctx: { token: string; owner: string; repo: string; pullNumber?: number },
): Promise<Annotation[]> {
  const diffLines = await fetchDiffLines(ctx);
  return findings
    .filter((f): f is Finding & { line: number } => f.line !== undefined && diffLines.has(`${f.file}:${f.line}`))
    .slice(0, MAX_ANNOTATIONS)
    .map((f) => ({
      path: f.file,
      start_line: f.line,
      end_line: f.line,
      annotation_level: (f.severity === "critical" || f.severity === "high" ? "failure" : "warning") as "failure" | "warning" | "notice",
      message: f.comment,
    }));
}

/** Fetch the PR file diff and return a Set of "path:line" present on the new side. */
async function fetchDiffLines(ctx: { token: string; owner: string; repo: string; pullNumber?: number }): Promise<Set<string>> {
  const lines = new Set<string>();
  if (!ctx.pullNumber) return lines;
  try {
    const url = `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.pullNumber}/files?per_page=100`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return lines;
    const files = (await res.json()) as Array<{ filename?: string; patch?: string }>;
    for (const file of files) {
      if (!file.filename || !file.patch) continue;
      let currentLine = 0;
      for (const raw of file.patch.split("\n")) {
        const header = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (header) {
          currentLine = Number(header[1]);
          continue;
        }
        if (raw.startsWith("+") && !raw.startsWith("+++")) {
          lines.add(`${file.filename}:${currentLine}`);
          currentLine++;
        } else if (raw.startsWith("-") && !raw.startsWith("---")) {
          // Deleted lines are not valid annotation positions on the new side.
        } else if (raw.startsWith(" ")) {
          lines.add(`${file.filename}:${currentLine}`);
          currentLine++;
        }
      }
    }
  } catch {
    // If the diff cannot be fetched, fall back to no annotations.
  }
  return lines;
}

runAction().catch((err) => {
  logger.error("Action failed:", err);
  process.exitCode = 1;
});
