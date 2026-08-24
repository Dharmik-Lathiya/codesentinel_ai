import { describe, it, expect } from "vitest";
import { context7Server, githubMCPServer, getDefaultMCPServers } from "../src/mcp/servers.js";

describe("MCP server config factories", () => {
  it("context7Server returns correct local config", () => {
    const cfg = context7Server();
    expect(cfg.name).toBe("context7");
    expect(cfg.type).toBe("local");
    expect(cfg.command).toEqual(["npx", "-y", "--quiet", "@upstash/context7-mcp"]);
    expect(cfg.environment).toBeUndefined();
    expect(cfg.timeoutMs).toBe(10_000);
  });

  it("context7Server includes API key when provided", () => {
    const cfg = context7Server("sk-test-key");
    expect(cfg.environment).toEqual({ CONTEXT7_API_KEY: "sk-test-key" });
  });

  it("context7Server omits environment when no key", () => {
    const cfg = context7Server();
    expect(cfg.environment).toBeUndefined();
  });

  it("githubMCPServer returns correct local config", () => {
    const cfg = githubMCPServer();
    expect(cfg.name).toBe("github");
    expect(cfg.type).toBe("local");
    expect(cfg.command).toEqual(["npx", "-y", "--quiet", "@github/github-mcp-server"]);
    expect(cfg.environment).toBeUndefined();
    expect(cfg.timeoutMs).toBe(15_000);
  });

  it("githubMCPServer includes token when provided", () => {
    const cfg = githubMCPServer("gh_token_abc");
    expect(cfg.environment).toEqual({ GITHUB_TOKEN: "gh_token_abc" });
  });

  it("githubMCPServer omits environment when no token", () => {
    const cfg = githubMCPServer();
    expect(cfg.environment).toBeUndefined();
  });

  it("getDefaultMCPServers returns context7 only without token", () => {
    const servers = getDefaultMCPServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("context7");
  });

  it("getDefaultMCPServers returns both servers with token", () => {
    const servers = getDefaultMCPServers("gh_token");
    expect(servers).toHaveLength(2);
    expect(servers[0].name).toBe("context7");
    expect(servers[1].name).toBe("github");
  });

  it("getDefaultMCPServers passes context7Key correctly", () => {
    const servers = getDefaultMCPServers("gh_token", "c7_key");
    expect(servers[0].environment).toEqual({ CONTEXT7_API_KEY: "c7_key" });
    expect(servers[1].environment).toEqual({ GITHUB_TOKEN: "gh_token" });
  });
});
