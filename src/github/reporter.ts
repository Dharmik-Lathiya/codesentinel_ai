import { retry } from "../utils/retry.js";
import { logger } from "../utils/logger.js";

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

export class GitHubReporter {
  private readonly api = "https://api.github.com";

  constructor(private coords: GitHubCoordinates) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.coords.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async request(method: string, url: string, body?: Record<string, unknown>): Promise<unknown> {
    return retry(async () => {
      const res = await fetch(url, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
      });

      // Respect rate limiting
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining && Number(remaining) < 10) {
        logger.warn(`GitHub API rate limit low: ${remaining} requests remaining`);
      }

      if (res.status === 403 || res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const resetTime = res.headers.get("x-ratelimit-reset");
        let delayMs = 5000;
        if (retryAfter) {
          delayMs = Number(retryAfter) * 1000;
        } else if (resetTime) {
          delayMs = Math.max(0, Number(resetTime) * 1000 - Date.now()) + 1000;
        }
        logger.warn(`GitHub API rate limited, retrying after ${delayMs}ms`);
        throw new Error(`Rate limited (${res.status}), retrying after ${delayMs}ms`);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`GitHub API ${res.status} ${res.statusText}: ${text}`);
      }
      return res.json().catch(() => null);
    }, {
      maxAttempts: 3,
      baseDelayMs: 2000,
      shouldRetry: (err) => {
        if (err instanceof Error) {
          const msg = err.message.toLowerCase();
          return msg.includes("rate limit") || msg.includes("429") || msg.includes("403") || msg.includes("503");
        }
        return false;
      },
    });
  }

  /** Post a single review comment on a PR (inline if line+file provided). */
  async postReviewComment(opts: {
    body: string;
    file?: string;
    line?: number | null;
    commitId?: string;
  }): Promise<void> {
    if (!this.coords.pullNumber) return;
    const base = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/pulls/${this.coords.pullNumber}/comments`;
    if (opts.file && opts.line && opts.commitId) {
      await this.request("POST", base, {
        body: opts.body,
        path: opts.file,
        line: opts.line,
        commit_id: opts.commitId,
        side: "RIGHT",
      });
    } else {
      await this.postIssueComment(opts.body);
    }
  }

  /** Post a top-level comment on the PR / issue. */
  async postIssueComment(body: string): Promise<void> {
    if (!this.coords.pullNumber) return;
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues/${this.coords.pullNumber}/comments`;
    await this.request("POST", url, { body });
  }

  /** List all comments on a PR with pagination. */
  async listIssueComments(): Promise<Array<{ id: number; body: string; created_at: string }>> {
    if (!this.coords.pullNumber) return [];
    const comments: Array<{ id: number; body: string; created_at: string }> = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues/${this.coords.pullNumber}/comments?per_page=${perPage}&page=${page}`;
      const result = await this.request("GET", url) as Array<{ id: number; body: string; created_at: string }> | null;
      if (!result || result.length === 0) break;
      comments.push(...result);
      if (result.length < perPage) break;
      page++;
    }
    return comments;
  }

  /** Create a GitHub issue (used by audit mode). */
  async createIssue(title: string, body: string): Promise<void> {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues`;
    await this.request("POST", url, { title, body });
  }

  /** Create a GitHub Check Run with annotations. */
  async createCheckRun(opts: {
    name: string;
    headSha: string;
    status: "completed";
    conclusion: "success" | "failure" | "neutral";
    output?: {
      title: string;
      summary: string;
      annotations: Array<{ path: string; start_line: number; end_line: number; annotation_level: "notice" | "warning" | "failure"; message: string }>;
    };
  }): Promise<void> {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/check-runs`;
    await this.request("POST", url, {
      name: opts.name,
      head_sha: opts.headSha,
      status: opts.status,
      conclusion: opts.conclusion,
      output: opts.output,
    });
  }

  /** Set commit status (for gate results). */
  async setCommitStatus(opts: {
    sha: string;
    state: "success" | "failure" | "pending";
    description: string;
    context: string;
  }): Promise<void> {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/statuses/${opts.sha}`;
    await this.request("POST", url, {
      state: opts.state,
      description: opts.description,
      context: opts.context,
    });
  }
}
