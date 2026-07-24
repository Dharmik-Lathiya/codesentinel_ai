import { Probot } from "probot";
/**
 * Probot GitHub App. Registers webhook handlers and responds to slash commands
 * posted as PR comments: /review /fix /audit /score /testgen /ask <question>.
 *
 * Models and secrets are read from environment variables. The app runs the
 * engine per command and posts the result back as a PR comment.
 */
export declare function codesentinelApp(app: Probot): void;
/** Factory used when running the app standalone. */
export declare function createApp(): Probot;
