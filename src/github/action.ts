import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";

import { Engine, configFromInputs, type EngineReport } from "../engine/index.js";
import { GitHubReporter } from "./reporter.js";
import type { Mode, RuntimeSecrets } from "../config/types.js";
import { logger } from "../utils/logger.js";
import { setupOpenCode } from "../opencode/installer.js";

const MAX_SCORE = 100;
const MAX_CHECKRUN_ANNOTATIONS = 50;

/**
 * GitHub Action entrypoint. Reads inputs from the environment (set by action.yml
 * as INPUT_<NAME>), runs the engine, posts PR comments and writes the job
 * summary + metrics. Designed to be dependency-light (uses fetch for API).
 */
export async function runAction(): Promise<void> {
  const get = (k: string) => process.env[`INPUT_${k.replace(/-/g, "_").toUpperCase()}`];

  const inputs = {
    mode: get("mode"),
    max_iterations: get("max_iterations"),
    enable_auto_fix: get("enable_auto_fix"),
    enable_scoring: get("enable_scoring"),
    enable_test_generation: get("enable_test_generation"),
    project_context: get("project_context"),
    test_runner: get("test_runner"),
    provider: get("provider"),
    auto_merge: get("auto_merge"),
    issue_title: get("issue_title"),
    issue_body: get("issue_body"),
    ask: get("ask"),
    use_opencode_cli: get("use_opencode_cli"),
  };

  const useOpencodeCliFlag = inputs.use_opencode_cli === "true";
  const opencodeVersion = get("opencode_version") || "latest";

  // When the OpenCode CLI mode is requested, install the binary (or use cached)
  // and prepend its directory to PATH so runner.ts can locate it.
  if (useOpencodeCliFlag) {
    try {
      const { binaryPath } = await setupOpenCode(opencodeVersion);
      const binDir = dirname(binaryPath);
      const existingPath = process.env.PATH ?? "";
      if (!existingPath.split(":").includes(binDir)) {
        process.env.PATH = `${binDir}:${existingPath}`;
      }
      logger.info(`action: OpenCode CLI installed at ${binaryPath}`);
    } catch (err) {
      logger.warn(`action: OpenCode CLI install failed (${err}), continuing without it`);
    }
  } else {
    // Also prepend the default install dir so system-installed opencode is found
    const defaultBinDir = `${process.env.HOME ?? homedir()}/.codesentinel/bin`;
    const existingPath = process.env.PATH ?? "";
    if (!existingPath.split(":").includes(defaultBinDir)) {
      process.env.PATH = `${defaultBinDir}:${existingPath}`;
    }
  }

  // Build config overrides from all inputs (including use_opencode_cli)
  const configOverrides = configFromInputs({ ...inputs, use_opencode_cli: useOpencodeCliFlag ? "true" : undefined });

  const secrets: RuntimeSecrets = {
    github_token: process.env.GITHUB_TOKEN,
    openai_api_key: process.env.OPENAI_API_KEY || get("openai_api_key"),
    anthropic_api_key: process.env.ANTHROPIC_API_KEY || get("anthropic_api_key"),
    gemini_api_key: process.env.GEMINI_API_KEY || get("gemini_api_key"),
    opencode_api_key: process.env.OPENCODE_API_KEY || get("opencode_api_key"),
    opencode_base_url: process.env.OPENCODE_BASE_URL || get("opencode_base_url"),
  };

  const runMode = (inputs.mode || "review") as Mode;
  const engine = Engine.fromInputs({
    configPath: get("config_path") || undefined,
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
  process.stdout.write(`\n=== CodeSentinel [${outputMode}] ===\n`);
  process.stdout.write(report.summary + "\n");
  if (report.score) {
    process.stdout.write(
      `Score: ${report.score.overall}/${MAX_SCORE} ` +
      `(readability ${report.score.readability}, maintainability ${report.score.maintainability}, ` +
      `security ${report.score.security}, coverage ${report.score.test_coverage})\n`,
    );
  }

  await publishOutputs(report, secrets, autoMerge);
}

/** Post review comments, audit issues, gate checks, summary and metrics. */
async function postIssueComments(reporter: GitHubReporter, report: EngineReport): Promise<void> {
  for (const c of report.comments) {
    await reporter.postReviewComment({ body: c.body, file: c.file, line: c.line });
  }
}

async function postAuditIssues(reporter: GitHubReporter, report: EngineReport): Promise<void> {
  for (const f of report.findings) {
    await reporter.createIssue(`[${f.severity}] ${f.file}`, f.comment);
  }
}

async function postGateResult(reporter: GitHubReporter, report: EngineReport, headSha: string, autoMerge: boolean, pullNumber: number): Promise<void> {
  const annotations = report.findings.slice(0, MAX_CHECKRUN_ANNOTATIONS).map((f) => ({
    path: f.file,
    start_line: f.line ?? 1,
    end_line: f.line ?? 1,
    annotation_level: (f.severity === "critical" || f.severity === "high" ? "failure" : "warning") as "failure" | "warning" | "notice",
    message: f.comment,
  }));

  await reporter.createCheckRun({
    name: "CodeSentinel Gate",
    headSha,
    status: "completed",
    conclusion: report.gatePassed ? "success" : "failure",
    output: {
      title: report.gatePassed ? "Quality Gate Passed" : "Quality Gate Failed",
      summary: report.summary,
      annotations,
    },
  });

  await reporter.setCommitStatus({
    sha: headSha,
    state: report.gatePassed ? "success" : "failure",
    description: report.gatePassed ? "All gate checks passed" : "Gate checks failed",
    context: "codesentinel/gate",
  });

  if (report.gatePassed && autoMerge && pullNumber) {
    await reporter.enableAutoMerge(pullNumber, "squash");
    logger.info(`publishOutputs: enabled auto-merge on PR #${pullNumber}`);
  }
}

/** Write the step summary + metrics outputs. */
async function publishOutputs(report: EngineReport, secrets: RuntimeSecrets, autoMerge = false): Promise<void> {
  const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const pullNumber = process.env.GITHUB_PR_NUMBER ? Number(process.env.GITHUB_PR_NUMBER) : undefined;
  const headSha = process.env.GITHUB_SHA;

  if (secrets.github_token && owner && repo) {
    const reporter = new GitHubReporter({ token: secrets.github_token, owner, repo, pullNumber });
    await postIssueComments(reporter, report);
    if (report.mode === "audit") {
      await postAuditIssues(reporter, report);
    }
    if (report.mode === "gate" && headSha && pullNumber) {
      await postGateResult(reporter, report, headSha, autoMerge, pullNumber);
    }
  }

  // Step summary (rendered in the Actions UI).
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    writeFileSync(summaryPath, renderSummary(report), "utf8");
  }

  // Metrics as workflow outputs via GITHUB_OUTPUT (legacy ::set-output is deprecated).
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
    lines.push(
      `**Score:** ${report.score.overall}/100 ` +
        `(readability ${report.score.readability}, maintainability ${report.score.maintainability}, ` +
        `security ${report.score.security}, coverage ${report.score.test_coverage})`,
    );
  }
  if (report.gatePassed !== undefined) {
    lines.push(`**Gate:** ${report.gatePassed ? "PASSED" : "FAILED"}`);
  }
  return lines.join("\n");
}

runAction().catch((err) => {
  logger.error("Action failed:", err);
  throw err;
});
