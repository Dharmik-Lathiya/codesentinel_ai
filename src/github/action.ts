import { writeFileSync } from "node:fs";

import { Engine, configFromInputs, type EngineReport } from "../engine/index.js";
import { GitHubReporter } from "./reporter.js";
import type { RuntimeSecrets } from "../config/types.js";
import { logger } from "../utils/logger.js";

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
  };

  const configOverrides = configFromInputs(inputs);

  const secrets: RuntimeSecrets = {
    github_token: process.env.GITHUB_TOKEN,
    openai_api_key: process.env.OPENAI_API_KEY,
    anthropic_api_key: process.env.ANTHROPIC_API_KEY,
    gemini_api_key: process.env.GEMINI_API_KEY,
    opencode_api_key: process.env.OPENCODE_API_KEY,
    opencode_base_url: process.env.OPENCODE_BASE_URL,
  };

  const engine = Engine.fromInputs({
    configPath: get("config_path") || undefined,
    overrides: { ...configOverrides, enable_auto_fix: configOverrides.enable_auto_fix ?? false },
    secrets,
  });

  const report = await engine.run();
  await publishOutputs(report, secrets);
}

/** Post comments / issues and write the step summary + metrics outputs. */
async function publishOutputs(report: EngineReport, secrets: RuntimeSecrets): Promise<void> {
  const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const pullNumber = process.env.GITHUB_PR_NUMBER
    ? Number(process.env.GITHUB_PR_NUMBER)
    : undefined;
  const headSha = process.env.GITHUB_SHA;

  if (secrets.github_token && owner && repo) {
    const reporter = new GitHubReporter({ token: secrets.github_token, owner, repo, pullNumber });
    for (const c of report.comments) {
      await reporter.postReviewComment({
        body: c.body,
        file: c.file,
        line: c.line,
      });
    }
    if (report.mode === "audit") {
      for (const f of report.findings) {
        await reporter.createIssue(
          `[${f.severity}] ${f.file}`,
          f.comment,
        );
      }
    }

    // Create Check Run for gate mode
    if (report.mode === "gate" && headSha) {
      const annotations = report.findings.slice(0, 50).map((f) => ({
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

      // Also set commit status
      await reporter.setCommitStatus({
        sha: headSha,
        state: report.gatePassed ? "success" : "failure",
        description: report.gatePassed ? "All gate checks passed" : "Gate checks failed",
        context: "codesentinel/gate",
      });
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
  process.exit(1);
});
