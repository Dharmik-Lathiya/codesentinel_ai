import { retry } from "../utils/retry.js";
import { logger } from "../utils/logger.js";
export class GitHubReporter {
    coords;
    api = "https://api.github.com";
    constructor(coords) {
        this.coords = coords;
    }
    headers() {
        return {
            Authorization: `Bearer ${this.coords.token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        };
    }
    async request(method, url, body) {
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
                }
                else if (resetTime) {
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
    async postReviewComment(opts) {
        if (!this.coords.pullNumber)
            return;
        const base = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/pulls/${this.coords.pullNumber}/comments`;
        if (opts.file && opts.line && opts.commitId) {
            await this.request("POST", base, {
                body: opts.body,
                path: opts.file,
                line: opts.line,
                commit_id: opts.commitId,
                side: "RIGHT",
            });
        }
        else {
            await this.postIssueComment(opts.body);
        }
    }
    /** Post a top-level comment on the PR / issue. */
    async postIssueComment(body) {
        if (!this.coords.pullNumber)
            return;
        const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues/${this.coords.pullNumber}/comments`;
        await this.request("POST", url, { body });
    }
    /** List all comments on a PR with pagination. */
    async listIssueComments() {
        if (!this.coords.pullNumber)
            return [];
        const comments = [];
        let page = 1;
        const perPage = 100;
        while (true) {
            const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues/${this.coords.pullNumber}/comments?per_page=${perPage}&page=${page}`;
            const result = await this.request("GET", url);
            if (!result || result.length === 0)
                break;
            comments.push(...result);
            if (result.length < perPage)
                break;
            page++;
        }
        return comments;
    }
    /** Create a GitHub issue (used by audit mode). */
    async createIssue(title, body) {
        const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues`;
        await this.request("POST", url, { title, body });
    }
    /** Create a GitHub Check Run with annotations. */
    async createCheckRun(opts) {
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
    async setCommitStatus(opts) {
        const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/statuses/${opts.sha}`;
        await this.request("POST", url, {
            state: opts.state,
            description: opts.description,
            context: opts.context,
        });
    }
    /** Create a new branch from an existing SHA. */
    async createBranch(branchName, sha) {
        const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/git/refs`;
        await this.request("POST", url, { ref: `refs/heads/${branchName}`, sha });
    }
    /** Create a pull request and return its number. */
    async createPR(opts) {
        const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/pulls`;
        const result = await this.request("POST", url, {
            title: opts.title,
            body: opts.body,
            head: opts.head,
            base: opts.base,
        });
        return result.number;
    }
    /** Enable auto-merge on a PR (merges when all required checks pass). */
    async enableAutoMerge(pullNumber, mergeMethod = "squash") {
        try {
            // GitHub's native auto-merge — the PR merges only when required checks pass.
            // Deliberately NOT the /pulls/{n}/merge endpoint, which force-merges immediately.
            const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/pulls/${pullNumber}/auto_merge`;
            await this.request("PUT", url, {
                merge_method: mergeMethod,
                commit_title: `chore: merge PR #${pullNumber} (CodeSentinel)`,
            });
            logger.info(`enableAutoMerge: enabled auto-merge on PR #${pullNumber}`);
        }
        catch {
            logger.warn(`enableAutoMerge: auto-merge unavailable on PR #${pullNumber} (repo may not allow it)`);
        }
    }
    /** Get the default branch name and its latest commit SHA. */
    async getDefaultBranch() {
        const repoUrl = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}`;
        const repo = await this.request("GET", repoUrl);
        const branchUrl = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/branches/${repo.default_branch}`;
        const branch = await this.request("GET", branchUrl);
        return { name: repo.default_branch, sha: branch.commit.sha };
    }
}
//# sourceMappingURL=reporter.js.map