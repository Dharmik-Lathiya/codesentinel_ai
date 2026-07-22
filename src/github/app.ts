import { Probot } from "probot";

import { Engine, type EngineReport } from "../engine/index.js";
import type { Mode, RuntimeSecrets } from "../config/types.js";
import { logger } from "../utils/logger.js";

const processedCommentIds = new Set<number>();

/**
 * Probot GitHub App. Registers webhook handlers and responds to slash commands
 * posted as PR comments: /review /fix /audit /score /testgen /ask <question>.
 *
 * Models and secrets are read from environment variables. The app runs the
 * engine per command and posts the result back as a PR comment.
 */
export function codesentinelApp(app: Probot): void {
  app.on("pull_request.opened", async (ctx) => {
    logger.info(`PR opened: ${ctx.payload.pull_request.number}`);
  });

  app.on("issue_comment.created", async (ctx) => {
    await handleComment(ctx);
  });

  app.on("issue_comment.edited", async (ctx) => {
    await handleComment(ctx);
  });
}

async function handleComment(ctx: any): Promise<void> {
  const commentId = ctx.payload.comment.id;
  if (processedCommentIds.has(commentId)) return;
  processedCommentIds.add(commentId);

  // Cap dedupe set size to prevent memory leak
  if (processedCommentIds.size > 10000) {
    const ids = [...processedCommentIds];
    processedCommentIds.clear();
    ids.slice(-5000).forEach((id) => processedCommentIds.add(id));
  }

  const comment = ctx.payload.comment.body.trim();
  const cmd = parseCommand(comment);
  if (!cmd) return;

  const owner = ctx.payload.repository.owner.login;
  const repo = ctx.payload.repository.name;
  const pullNumber = ctx.payload.issue.number;

  // Build secrets from environment for the engine run.
  const secrets: RuntimeSecrets = {
    github_token: process.env.GITHUB_TOKEN,
    openai_api_key: process.env.OPENAI_API_KEY,
    anthropic_api_key: process.env.ANTHROPIC_API_KEY,
    gemini_api_key: process.env.GEMINI_API_KEY,
    opencode_api_key: process.env.OPENCODE_API_KEY,
  };

  const engine = Engine.fromInputs({
    overrides: { mode: cmd.mode },
    secrets,
    root: process.cwd(),
  });

  let reply: string;
  if (cmd.mode === "chat") {
    reply = await engine.ask(cmd.arg);
  } else {
    const report: EngineReport = await engine.run();
    reply = formatReport(report);
  }

  await ctx.octokit.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body: reply,
  });
}

/** Parse a slash command from a comment body. */
function parseCommand(
  body: string,
): { mode: Mode; arg: string } | null {
  const m = body.match(/^\/(review|fix|audit|score|testgen|gate|deadcode|ask)\b\s*([\s\S]*)$/i);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const arg = (m[2] ?? "").trim();
  if (name === "ask") return { mode: "chat", arg };
  return { mode: name as Mode, arg };
}

function formatReport(report: EngineReport): string {
  const parts = [`### CodeSentinel — ${report.mode}`, "", report.summary];
  if (report.score) parts.push(`\n**Score:** ${report.score.overall}/100`);
  if (report.gatePassed !== undefined) {
    parts.push(`\n**Gate:** ${report.gatePassed ? "PASSED" : "FAILED"}`);
  }
  return parts.join("\n");
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
