import type { MCPServerConfig } from "./client.js";

const MS_PER_SECOND = 1000;
const DEFAULT_CONTEXT7_TIMEOUT_MS = 10 * MS_PER_SECOND;
const DEFAULT_GITHUB_TIMEOUT_MS = 15 * MS_PER_SECOND;

export function context7Server(apiKey?: string): MCPServerConfig {
  const env: Record<string, string> = {};
  if (apiKey) env.CONTEXT7_API_KEY = apiKey;
  return {
    name: "context7",
    type: "local",
    command: ["npx", "-y", "--quiet", "@upstash/context7-mcp"],
    environment: Object.keys(env).length ? env : undefined,
    timeoutMs: DEFAULT_CONTEXT7_TIMEOUT_MS,
  };
}

export function githubMCPServer(token?: string): MCPServerConfig {
  const env: Record<string, string> = {};
  if (token) env.GITHUB_TOKEN = token;
  return {
    name: "github",
    type: "local",
    command: ["npx", "-y", "--quiet", "@github/github-mcp-server"],
    environment: Object.keys(env).length ? env : undefined,
    timeoutMs: DEFAULT_GITHUB_TIMEOUT_MS,
  };
}

export function getDefaultMCPServers(token?: string, context7Key?: string): MCPServerConfig[] {
  const servers: MCPServerConfig[] = [];
  try { servers.push(context7Server(context7Key)); } catch { /* skip */ }
  if (token) {
    try { servers.push(githubMCPServer(token)); } catch { /* skip */ }
  }
  return servers;
}
