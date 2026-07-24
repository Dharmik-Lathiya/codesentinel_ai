const MS_PER_SECOND = 1000;
const CONTEXT7_TIMEOUT_MS = 10 * MS_PER_SECOND;
const GITHUB_TIMEOUT_MS = 15 * MS_PER_SECOND;
export function context7Server(apiKey) {
    const env = {};
    if (apiKey)
        env.CONTEXT7_API_KEY = apiKey;
    return {
        name: "context7",
        type: "local",
        command: ["npx", "-y", "--quiet", "@upstash/context7-mcp"],
        environment: Object.keys(env).length ? env : undefined,
        timeoutMs: CONTEXT7_TIMEOUT_MS,
    };
}
export function githubMCPServer(token) {
    const env = {};
    if (token)
        env.GITHUB_TOKEN = token;
    return {
        name: "github",
        type: "local",
        command: ["npx", "-y", "--quiet", "@github/github-mcp-server"],
        environment: Object.keys(env).length ? env : undefined,
        timeoutMs: GITHUB_TIMEOUT_MS,
    };
}
export function getDefaultMCPServers(token, context7Key) {
    const servers = [];
    try {
        servers.push(context7Server(context7Key));
    }
    catch { /* skip */ }
    if (token) {
        try {
            servers.push(githubMCPServer(token));
        }
        catch { /* skip */ }
    }
    return servers;
}
//# sourceMappingURL=servers.js.map