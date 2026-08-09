import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { logger } from "../utils/logger.js";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_QUERY_MAX_TOKENS = 4000;
const DEFAULT_LIBRARY_MAX_TOKENS = 2000;

export interface MCPServerConfig {
  name: string;
  type: "local" | "remote";
  command?: string[];
  url?: string;
  environment?: Record<string, string>;
  timeoutMs?: number;
}

export interface MCPContextEntry {
  serverName: string;
  content: string;
  relevance: number;
}

export class MCPManager {
  private clients = new Map<string, Client>();
  private configs: MCPServerConfig[];

  constructor(configs: MCPServerConfig[] = []) {
    this.configs = configs;
  }

  async connectAll(): Promise<void> {
    await Promise.all(this.configs.map((cfg) => this.connect(cfg)));
  }

  private createTransport(cfg: MCPServerConfig): StdioClientTransport | SSEClientTransport | null {
    if (cfg.type === "local" && cfg.command) {
      return new StdioClientTransport({
        command: cfg.command[0],
        args: cfg.command.slice(1),
        env: cfg.environment,
      });
    } else if (cfg.type === "remote" && cfg.url) {
      return new SSEClientTransport(new URL(cfg.url));
    } else {
      logger.warn(`MCP: invalid config for "${cfg.name}"`);
      return null;
    }
  }

  private static matchesToolName(name: string, keywords: string[]): boolean {
    const lower = name.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword));
  }

  async connect(cfg: MCPServerConfig): Promise<boolean> {
    if (this.clients.has(cfg.name)) {
      logger.info(`MCP: already connected to "${cfg.name}"`);
      return false;
    }
    const controller = new AbortController();
    const timeoutSignal = AbortSignal.timeout(cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    timeoutSignal.addEventListener("abort", () => controller.abort());
    const client = new Client(
      { name: "codesentinel", version: "1.0.0" },
      { capabilities: {} },
    );
    let transport: StdioClientTransport | SSEClientTransport | null = null;
    let connected = false;
    try {
      transport = this.createTransport(cfg);
      if (!transport) {
        return false;
      }
      await client.connect(transport, { signal: controller.signal });
      this.clients.set(cfg.name, client);
      connected = true;
      logger.info(`MCP: connected to "${cfg.name}"`);
      return true;
    } catch (err) {
      logger.warn(`MCP: failed to connect to "${cfg.name}": ${err}`);
      return false;
    } finally {
      if (!connected && transport) {
        controller.abort();
        try {
          await transport.close();
        } catch { /* ignore */ }
        try {
          await client.close();
        } catch { /* ignore */ }
      }
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
        logger.info(`MCP: disconnected "${name}"`);
      } catch { /* ignore */ }
    }
    this.clients.clear();
  }

  private async queryClientTools(serverName: string, client: Client, prompt: string): Promise<MCPContextEntry[]> {
    const entries: MCPContextEntry[] = [];
    try {
      const tools = await client.listTools();
      for (const tool of tools.tools) {
        if (MCPManager.matchesToolName(tool.name, ["search", "query", "docs"])) {
          const result = await client.callTool({ name: tool.name, arguments: { query: prompt } });
          const content = JSON.stringify(result.content ?? "");
          entries.push({ serverName, content, relevance: 1 });
        }
      }
    } catch (err) {
      logger.warn(`MCP: query error on "${serverName}": ${err}`);
    }
    return entries;
  }

  async queryContext(prompt: string, maxTokens = DEFAULT_QUERY_MAX_TOKENS): Promise<MCPContextEntry[]> {
    const results = await Promise.allSettled(
      [...this.clients.entries()].map(([name, client]) => this.queryClientTools(name, client, prompt)),
    );
    const entries: MCPContextEntry[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        entries.push(...result.value);
      }
    }
    return this.trimByBudget(entries, maxTokens);
  }

  private async getClientLibraryDocs(serverName: string, client: Client, library: string): Promise<MCPContextEntry[]> {
    const entries: MCPContextEntry[] = [];
    try {
      const tools = await client.listTools();
      for (const tool of tools.tools) {
        if (MCPManager.matchesToolName(tool.name, ["docs", "context"])) {
          const result = await client.callTool({ name: tool.name, arguments: { library } });
          const content = JSON.stringify(result.content ?? "");
          entries.push({ serverName, content, relevance: 0.8 });
        }
      }
    } catch (err) {
      logger.warn(`MCP: docs query error on "${serverName}": ${err}`);
    }
    return entries;
  }

  async getLibraryDocs(libraries: string[], maxTokens = DEFAULT_LIBRARY_MAX_TOKENS): Promise<MCPContextEntry[]> {
    const entries: MCPContextEntry[] = [];
    const results = await Promise.allSettled(
      [...this.clients.entries()].flatMap(([name, client]) =>
        libraries.map((lib) => this.getClientLibraryDocs(name, client, lib)),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        entries.push(...result.value);
      }
    }
    return this.trimByBudget(entries, maxTokens);
  }

  private trimByBudget(entries: MCPContextEntry[], maxTokens: number): MCPContextEntry[] {
    const sorted = entries.sort((a, b) => b.relevance - a.relevance);
    let total = 0;
    const result: MCPContextEntry[] = [];
    for (const e of sorted) {
      const tokens = e.content.length / 4;
      if (total + tokens > maxTokens) break;
      total += tokens;
      result.push(e);
    }
    return result;
  }
}
