import { Probot } from "probot";

import { Engine, type EngineReport } from "../engine/index.js";
import type { Mode, RuntimeSecrets } from "../config/types.js";
import { logger } from "../utils/logger.js";

// Constants
const MAX_PROCESSED_COMMENT_IDS = 10000;
const KEEP_LAST_PROCESSED_IDS = 5000;
const MAX_SCORE = 100;
const MAX_ISSUE_BODY_PLAN = 8000;
const MAX_ISSUE_BODY_FIX = 4000;

const processedCommentIds = new Set<number>();

/**
 * Probot GitHub App. Registers webhook handlers and responds to slash commands
 * posted as PR/issue comments: /review /fix /audit /score /testgen /plan
 * /gate /deadcode /describe /ask <question>.
 *
 * Also auto-analyzes newly opened issues and posts an implementation plan.
 */
export function codesentinelApp(app: Probot): void {

  app.on("issues.opened", async (ctx) => {
    logger.info(`Issue opened: ${ctx.payload.issue.number}`);
    try {
      await handleIssueOpened(ctx);
    } catch (error) {
      logger.error(error, "Error handling issues.opened");
    }
  });

  app.on("issue_comment.created", async (ctx) => {
    try {
      await handleComment(ctx);
    } catch (error) {
      logger.error(error, "Error handling issue_comment.created");
    }
  });

  app.on("issue_comment.edited", async (ctx) => {
    try {
      await handleComment(ctx);
    } catch (error) {
      logger.error(error, "Error handling issue_comment.edited");
    }
  });
}

/** Check if comment already processed and deduplicate. */
function isDuplicateOrRegister(commentId: number): boolean {
  if (processedCommentIds.has(commentId)) return true;
  processedCommentIds.add(commentId);
  // Cap dedupe set size to prevent memory leak
  if (processedCommentIds.size > MAX_PROCESSED_COMMENT_IDS) {
    const ids = [...processedCommentIds];
    processedCommentIds.clear();
    ids.slice(-KEEP_LAST_PROCESSED_IDS).forEach((id) => processedCommentIds.add(id));
  }
  return false;
}

/** Build secrets from environment. */
function buildSecrets(): RuntimeSecrets {
  return {
    github_token: process.env.GITHUB_TOKEN,
    openai_api_key: process.env.OPENAI_API_KEY,
    anthropic_api_key: process.env.ANTHROPIC_API_KEY,
    gemini_api_key: process.env.GEMINI_API_KEY,
    opencode_api_key: process.env.OPENCODE_API_KEY,
  };
}

/** Run engine and return reply string. */
async function runEngine(engine: Engine, cmd: { mode: Mode; arg: string }): Promise<string> {
  if (cmd.mode === "chat") {
    try {
      return await engine.ask(cmd.arg);
    } catch (error) {
      logger.error(error, "Failed to run engine.ask");
      return "❌ An error occurred while processing your ask command.";
    }
  } else if (cmd.mode === "plan") {
    try {
      const report: EngineReport = await engine.run();
      return formatPlanReport(report);
    } catch (error) {
      logger.error(error, "Failed to generate plan");
      return "❌ An error occurred while generating the plan.";
    }
  } else {
    try {
      const report: EngineReport = await engine.run();
      return formatReport(report);
    } catch (error) {
      logger.error(error, "Failed to run engine");
      return "❌ An error occurred while executing the command.";
    }
  }
}

/** Post a comment to the pull request / issue. */
async function postComment(
  ctx: any,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  try {
    await ctx.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  } catch (error) {
    logger.error(error, "Failed to create comment");
  }
}

async function handleIssueOpened(ctx: any): Promise<void> {
  const issue = ctx.payload.issue;
  const owner = ctx.payload.repository.owner.login;
  const repo = ctx.payload.repository.name;
  const issueNumber = issue.number;

  const title = issue.title;
  const body = (issue.body || "").slice(0, MAX_ISSUE_BODY_PLAN);

  // Generate plan using the engine
  const engine = Engine.fromInputs({
    overrides: {
      mode: "plan",
      issue_title: title,
      issue_body: body,
    },
    secrets: buildSecrets(),
    root: process.cwd(),
  });

  const reply = await runEngine(engine, { mode: "plan", arg: "" });
  await postComment(ctx, owner, repo, issueNumber, reply);
}

async function handleComment(ctx: any): Promise<void> {
  // Check duplicate
  if (isDuplicateOrRegister(ctx.payload.comment.id)) return;

  const comment = ctx.payload.comment.body.trim();
  const cmd = parseCommand(comment);
  if (!cmd) return;

  const owner = ctx.payload.repository.owner.login;
  const repo = ctx.payload.repository.name;
  const issueNumber = ctx.payload.issue.number;

  const isPR = !!ctx.payload.issue?.pull_request;
  let overrides: Record<string, unknown> = { mode: cmd.mode };

  // For fix mode on issues (non-PR), also pass issue context
  if (cmd.mode === "fix" && !isPR) {
    const issue = ctx.payload.issue;
    overrides.issue_title = issue.title;
    overrides.issue_body = (issue.body || "").slice(0, MAX_ISSUE_BODY_FIX);
  }

  // For plan mode, pass issue context
  if (cmd.mode === "plan") {
    const issue = ctx.payload.issue;
    overrides.issue_title = issue.title;
    overrides.issue_body = (issue.body || "").slice(0, 8000);
  }

  const engine = Engine.fromInputs({
    overrides: overrides as any,
    secrets: buildSecrets(),
    root: process.cwd(),
  });

  const reply = await runEngine(engine, cmd);
  await postComment(ctx, owner, repo, issueNumber, reply);
}


/** Parse a slash command from a comment body. */
function parseCommand(
  body: string,
): { mode: Mode; arg: string } | null {
  const m = body.match(/^\/(review|fix|audit|score|testgen|gate|deadcode|describe|plan|ask)(?=\s|$)\s*([\s\S]*)$/i);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const arg = (m[2] ?? "").trim();
  if (name === "ask") return { mode: "chat", arg };
  return { mode: name as Mode, arg };
}

function formatReport(report: EngineReport): string {
  const parts = [`### CodeSentinel — ${report.mode}`, "", report.summary];
  if (report.score) parts.push(`\n**Score:** ${report.score.overall}/${MAX_SCORE}`);
  if (report.gatePassed !== undefined) {
    parts.push(`\n**Gate:** ${report.gatePassed ? "PASSED" : "FAILED"}`);
  }
  return parts.join("\n");
}

function formatPlanReport(report: EngineReport): string {
  return `### CodeSentinel — Implementation Plan\n\n${report.summary}`;
}

/** Factory used when running the app standalone. */
export function createApp(): Probot {
  const appId = process.env.APP_ID;
  const privateKey = process.env.PRIVATE_KEY;
  if (!appId) throw new Error("APP_ID environment variable is required");
  if (!privateKey) throw new Error("PRIVATE_KEY environment variable is required");
  const app = new Probot({ appId: Number(appId), privateKey });
  codesentinelApp(app);
  return app;
}
