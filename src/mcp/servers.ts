import type { MCPServerConfig } from "./client.js";

const MILLISECONDS_PER_SECOND = 1000;
const CONTEXT7_TIMEOUT_SECONDS = 10;
const GITHUB_TIMEOUT_SECONDS = 15;
const CONTEXT7_SERVER_TIMEOUT_MS = CONTEXT7_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;
const GITHUB_TIMEOUT_MS = GITHUB_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;

const REDACTED_ENV_KEYS = new Set(["CONTEXT7_API_KEY", "GITHUB_TOKEN"]);

export function redactServerConfig(cfg: MCPServerConfig): MCPServerConfig {
  if (!cfg.environment) return cfg;
  const environment = Object.fromEntries(
    Object.entries(cfg.environment).map(([key, value]) => [
      key,
      REDACTED_ENV_KEYS.has(key) ? "<redacted>" : value,
    ]),
  );
  return { ...cfg, environment };
}

export function context7Server(apiKey?: string): MCPServerConfig {
  return {
    name: "context7",
    type: "local",
    command: ["npx", "-y", "--quiet", "@upstash/context7-mcp"],
    environment: apiKey ? { CONTEXT7_API_KEY: apiKey } : undefined,
    timeoutMs: CONTEXT7_SERVER_TIMEOUT_MS,
  };
}

export function githubMCPServer(token?: string): MCPServerConfig {
  return {
    name: "github",
    type: "local",
    command: ["npx", "-y", "--quiet", "@github/github-mcp-server"],
    environment: token ? { GITHUB_TOKEN: token } : undefined,
    timeoutMs: GITHUB_TIMEOUT_MS,
  };
}

export function getDefaultMCPServers(token?: string, context7Key?: string): MCPServerConfig[] {
  const servers: MCPServerConfig[] = [];
  servers.push(context7Server(context7Key));
  if (token) {
    servers.push(githubMCPServer(token));
  }
  return servers;
}
