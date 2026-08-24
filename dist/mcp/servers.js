const MILLISECONDS_PER_SECOND = 1000;
const CONTEXT7_TIMEOUT_SECONDS = 10;
const GITHUB_TIMEOUT_SECONDS = 15;
const CONTEXT7_SERVER_TIMEOUT_MS = CONTEXT7_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;
const GITHUB_TIMEOUT_MS = GITHUB_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;
export function context7Server(apiKey) {
    return {
        name: "context7",
        type: "local",
        command: ["npx", "-y", "--quiet", "@upstash/context7-mcp"],
        environment: apiKey ? { CONTEXT7_API_KEY: apiKey } : undefined,
        timeoutMs: CONTEXT7_SERVER_TIMEOUT_MS,
    };
}
export function githubMCPServer(token) {
    return {
        name: "github",
        type: "local",
        command: ["npx", "-y", "--quiet", "@github/github-mcp-server"],
        environment: token ? { GITHUB_TOKEN: token } : undefined,
        timeoutMs: GITHUB_TIMEOUT_MS,
    };
}
export function getDefaultMCPServers(token, context7Key) {
    const servers = [];
    servers.push(context7Server(context7Key));
    if (token) {
        servers.push(githubMCPServer(token));
    }
    return servers;
}
//# sourceMappingURL=servers.js.map