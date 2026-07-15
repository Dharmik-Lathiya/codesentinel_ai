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
      await fetch(base, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          body: opts.body,
          path: opts.file,
          line: opts.line,
          commit_id: opts.commitId,
          side: "RIGHT",
        }),
      });
    } else {
      // Fall back to a top-level PR comment.
      await this.postIssueComment(opts.body);
    }
  }

  /** Post a top-level comment on the PR / issue. */
  async postIssueComment(body: string): Promise<void> {
    if (!this.coords.pullNumber) return;
    await fetch(
      `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues/${this.coords.pullNumber}/comments`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ body }),
      },
    );
  }

  /** Create a GitHub issue (used by audit mode). */
  async createIssue(title: string, body: string): Promise<void> {
    await fetch(`${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ title, body }),
    });
  }
}
