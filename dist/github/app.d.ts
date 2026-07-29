import { Probot } from "probot";
/**
 * Probot GitHub App. Registers webhook handlers and responds to slash commands
 * posted as PR/issue comments: /review /fix /audit /score /testgen /plan
 * /gate /deadcode /describe /ask <question>.
 *
 * Also auto-analyzes newly opened issues and posts an implementation plan.
 */
export declare function codesentinelApp(app: Probot): void;
/** Factory used when running the app standalone. */
export declare function createApp(): Probot;
