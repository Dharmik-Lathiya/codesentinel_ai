/**
 * Minimal GitHub REST client for posting PR comments and creating issues,
 * implemented with `fetch` so we avoid an extra SDK dependency. It is used by
 * both the GitHub Action and (optionally) the Probot app.
 */
export interface GitHubCoordinates {
    token: string;
    owner: string;
    repo: string;
    /** Pull request number, when commenting on a PR. */
    pullNumber?: number;
}
export declare class GitHubReporter {
    private coords;
    private readonly api;
    constructor(coords: GitHubCoordinates);
    private headers;
    private request;
    /** Post a single review comment on a PR (inline if line+file provided). */
    postReviewComment(opts: {
        body: string;
        file?: string;
        line?: number | null;
        commitId?: string;
    }): Promise<void>;
    /** Post a top-level comment on the PR / issue. */
    postIssueComment(body: string): Promise<void>;
    /** List all comments on a PR with pagination. */
    listIssueComments(): Promise<Array<{
        id: number;
        body: string;
        created_at: string;
    }>>;
    /** Find an open issue whose title matches exactly (used for dedup). */
    findOpenIssueByTitle(title: string): Promise<number | null>;
    /** Create a GitHub issue (used by audit mode), optionally with labels. */
    createIssue(title: string, body: string, labels?: string[]): Promise<number>;
    /** Create an issue, or update the existing open issue with the same title (dedup). */
    createOrUpdateIssue(title: string, body: string, labels?: string[]): Promise<number>;
    /** Create a GitHub Check Run with annotations. */
    createCheckRun(opts: {
        name: string;
        headSha: string;
        status: "completed";
        conclusion: "success" | "failure" | "neutral";
        output?: {
            title: string;
            summary: string;
            annotations: Array<{
                path: string;
                start_line: number;
                end_line: number;
                annotation_level: "notice" | "warning" | "failure";
                message: string;
            }>;
        };
    }): Promise<void>;
    /** Set commit status (for gate results). */
    setCommitStatus(opts: {
        sha: string;
        state: "success" | "failure" | "pending";
        description: string;
        context: string;
    }): Promise<void>;
    /** Create a new branch from an existing SHA. */
    createBranch(branchName: string, sha: string): Promise<void>;
    /** Create a pull request and return its number. */
    createPR(opts: {
        title: string;
        body: string;
        head: string;
        base: string;
    }): Promise<number>;
    /** Enable auto-merge on a PR (merges when all required checks pass). */
    enableAutoMerge(pullNumber: number, mergeMethod?: "merge" | "squash" | "rebase"): Promise<void>;
    /** Get the default branch name and its latest commit SHA. */
    getDefaultBranch(): Promise<{
        name: string;
        sha: string;
    }>;
}
