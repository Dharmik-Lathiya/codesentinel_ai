import type { MCPServerConfig } from "./client.js";

const MILLISECONDS_PER_SECOND = Number('1000');
const CONTEXT7_TIMEOUT_SECONDS = Number('10');
const GITHUB_TIMEOUT_SECONDS = Number('15');
const CONTEXT7_SERVER_TIMEOUT_MS = CONTEXT7_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;
const GITHUB_TIMEOUT_MS = GITHUB_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;

export function context7Server(apiKey?: string): MCPServerConfig {
  const env: Record<string, string> = {};
  if (apiKey) env.CONTEXT7_API_KEY = apiKey;
  return {
    name: "context7",
    type: "local",
    command: "npx",
    args: ["-y", "--quiet", "@upstash/context7-mcp"],
    environment: Object.keys(env).length ? env : undefined,
    timeoutMs: CONTEXT7_SERVER_TIMEOUT_MS,
  };
}

export function githubMCPServer(token?: string): MCPServerConfig {
  const env: Record<string, string> = {};
  if (token) env.GITHUB_TOKEN = token;
  return {
    name: "github",
    type: "local",
    command: "npx",
    args: ["-y", "--quiet", "@github/github-mcp-server"],
    environment: Object.keys(env).length ? env : undefined,
    timeoutMs: GITHUB_TIMEOUT_MS,
  };
}

export function getDefaultMCPServers(token?: string, context7Key?: string): MCPServerConfig[] {
  const servers: MCPServerConfig[] = [];
  try { servers.push(context7Server(context7Key)); } catch (e) { console.error("Failed to add context7 server:", e); }
  if (token !== undefined) {
    try { servers.push(githubMCPServer(token)); } catch (e) { console.error("Failed to add GitHub server:", e); }
  }
  return servers;
}
