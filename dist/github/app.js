import { Probot } from "probot";
import { Engine } from "../engine/index.js";
import { logger } from "../utils/logger.js";
// Constants
const MAX_PROCESSED_COMMENT_IDS = 10000;
const KEEP_LAST_PROCESSED_IDS = 5000;
const MAX_SCORE = 100;
const processedCommentIds = new Set();
/**
 * Probot GitHub App. Registers webhook handlers and responds to slash commands
 * posted as PR comments: /review /fix /audit /score /testgen /ask <question>.
 *
 * Models and secrets are read from environment variables. The app runs the
 * engine per command and posts the result back as a PR comment.
 */
export function codesentinelApp(app) {
    app.on("pull_request.opened", async (ctx) => {
        logger.info(`PR opened: ${ctx.payload.pull_request.number}`);
    });
    app.on("issue_comment.created", async (ctx) => {
        try {
            await handleComment(ctx);
        }
        catch (error) {
            logger.error(error, "Error handling issue_comment.created");
        }
    });
    app.on("issue_comment.edited", async (ctx) => {
        try {
            await handleComment(ctx);
        }
        catch (error) {
            logger.error(error, "Error handling issue_comment.edited");
        }
    });
}
/** Check if comment already processed and deduplicate. */
function isDuplicateOrRegister(commentId) {
    if (processedCommentIds.has(commentId))
        return true;
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
function buildSecrets() {
    return {
        github_token: process.env.GITHUB_TOKEN,
        openai_api_key: process.env.OPENAI_API_KEY,
        anthropic_api_key: process.env.ANTHROPIC_API_KEY,
        gemini_api_key: process.env.GEMINI_API_KEY,
        opencode_api_key: process.env.OPENCODE_API_KEY,
    };
}
/** Run engine and return reply string. */
async function runEngine(engine, cmd) {
    if (cmd.mode === "chat") {
        try {
            return await engine.ask(cmd.arg);
        }
        catch (error) {
            logger.error(error, "Failed to run engine.ask");
            return "❌ An error occurred while processing your ask command.";
        }
    }
    else {
        try {
            const report = await engine.run();
            return formatReport(report);
        }
        catch (error) {
            logger.error(error, "Failed to run engine");
            return "❌ An error occurred while executing the command.";
        }
    }
}
/** Post a comment to the pull request. */
async function postComment(ctx, owner, repo, issueNumber, body) {
    try {
        await ctx.octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body,
        });
    }
    catch (error) {
        logger.error(error, "Failed to create comment");
    }
}
async function handleComment(ctx) {
    // Check duplicate
    if (isDuplicateOrRegister(ctx.payload.comment.id))
        return;
    const comment = ctx.payload.comment.body.trim();
    const cmd = parseCommand(comment);
    if (!cmd)
        return;
    const owner = ctx.payload.repository.owner.login;
    const repo = ctx.payload.repository.name;
    const pullNumber = ctx.payload.issue.number;
    const engine = Engine.fromInputs({
        overrides: { mode: cmd.mode },
        secrets: buildSecrets(),
        root: process.cwd(),
    });
    const reply = await runEngine(engine, cmd);
    await postComment(ctx, owner, repo, pullNumber, reply);
}
/** Parse a slash command from a comment body. */
function parseCommand(body) {
    const m = body.match(/^\/(review|fix|audit|score|testgen|gate|deadcode|ask)\b\s*([\s\S]*)$/i);
    if (!m)
        return null;
    const name = m[1].toLowerCase();
    const arg = (m[2] ?? "").trim();
    if (name === "ask")
        return { mode: "chat", arg };
    return { mode: name, arg };
}
function formatReport(report) {
    const parts = [`### CodeSentinel — ${report.mode}`, "", report.summary];
    if (report.score)
        parts.push(`\n**Score:** ${report.score.overall}/${MAX_SCORE}`);
    if (report.gatePassed !== undefined) {
        parts.push(`\n**Gate:** ${report.gatePassed ? "PASSED" : "FAILED"}`);
    }
    return parts.join("\n");
}
/** Factory used when running the app standalone. */
export function createApp() {
    const appId = process.env.APP_ID;
    const privateKey = process.env.PRIVATE_KEY;
    if (!appId)
        throw new Error("APP_ID environment variable is required");
    if (!privateKey)
        throw new Error("PRIVATE_KEY environment variable is required");
    const app = new Probot({ appId: Number(appId), privateKey });
    codesentinelApp(app);
    return app;
}
//# sourceMappingURL=app.js.map