import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { logger } from "../utils/logger.js";

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

  private static readonly DEFAULT_TIMEOUT_MS = 5000;
  private static readonly DEFAULT_QUERY_MAX_TOKENS = 4000;
  private static readonly DEFAULT_LIBRARY_MAX_TOKENS = 2000;

  constructor(configs: MCPServerConfig[] = []) {
    this.configs = configs;
  }

  async connectAll(): Promise<void> {
    for (const cfg of this.configs) {
      try {
        await this.connect(cfg);
      } catch (err) {
        logger.warn(`MCP: connectAll error for "${cfg.name}": ${err}`);
      }
    }
  }

  async connect(cfg: MCPServerConfig): Promise<void> {
    try {
      const client = new Client(
        { name: "codesentinel", version: "1.0.0" },
        { capabilities: {} },
      );
      const transport = this._createTransport(cfg);
      if (!transport) {
        logger.warn(`MCP: invalid config for "${cfg.name}"`);
        return;
      }
      const timeout = cfg.timeoutMs ?? MCPManager.DEFAULT_TIMEOUT_MS;
      const abort = AbortSignal.timeout(timeout);
      await client.connect(transport);
      this.clients.set(cfg.name, client);
      logger.info(`MCP: connected to "${cfg.name}"`);
    } catch (err) {
      logger.warn(`MCP: failed to connect to "${cfg.name}": ${err}`);
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

  async queryContext(prompt: string, maxTokens = MCPManager.DEFAULT_QUERY_MAX_TOKENS): Promise<MCPContextEntry[]> {
    const entries: MCPContextEntry[] = [];
    for (const [name, client] of this.clients) {
      try {
        const toolEntries = await this._queryClientTools(client, name, prompt);
        entries.push(...toolEntries);
      } catch (err) {
        logger.warn(`MCP: query error on "${name}": ${err}`);
      }
    }
    return this.trimByBudget(entries, maxTokens);
  }

  async getLibraryDocs(libraries: string[], maxTokens = MCPManager.DEFAULT_LIBRARY_MAX_TOKENS): Promise<MCPContextEntry[]> {
    const entries: MCPContextEntry[] = [];
    for (const lib of libraries) {
      for (const [name, client] of this.clients) {
        try {
          const toolEntries = await this._fetchLibraryDocsFromClient(client, name, lib);
          entries.push(...toolEntries);
        } catch { /* skip */ }
      }
    }
    return this.trimByBudget(entries, maxTokens);
  }

  private _createTransport(cfg: MCPServerConfig): StdioClientTransport | SSEClientTransport | null {
    if (cfg.type === "local" && cfg.command) {
      return new StdioClientTransport({
        command: cfg.command[0],
        args: cfg.command.slice(1),
        env: cfg.environment,
      });
    } else if (cfg.type === "remote" && cfg.url) {
      return new SSEClientTransport(new URL(cfg.url));
    }
    return null;
  }

  private async _queryClientTools(client: Client, serverName: string, prompt: string): Promise<MCPContextEntry[]> {
    const entries: MCPContextEntry[] = [];
    const tools = await client.listTools();
    for (const tool of tools.tools) {
      if (tool.name.includes("search") || tool.name.includes("query") || tool.name.includes("docs")) {
        const result = await client.callTool({ name: tool.name, arguments: { query: prompt } });
        const content = JSON.stringify(result.content ?? "");
        entries.push({ serverName, content, relevance: 1 });
      }
    }
    return entries;
  }

  private async _fetchLibraryDocsFromClient(client: Client, serverName: string, library: string): Promise<MCPContextEntry[]> {
    const entries: MCPContextEntry[] = [];
    const tools = await client.listTools();
    for (const tool of tools.tools) {
      if (tool.name.toLowerCase().includes("docs") || tool.name.toLowerCase().includes("context")) {
        const result = await client.callTool({ name: tool.name, arguments: { library } });
        const content = JSON.stringify(result.content ?? "");
        entries.push({ serverName, content, relevance: 0.8 });
      }
    }
    return entries;
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
