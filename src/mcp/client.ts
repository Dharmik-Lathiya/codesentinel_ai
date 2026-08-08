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
    for (const cfg of this.configs) {
      try {
        await this.connect(cfg);
      } catch {
        // Error already handled in connect()
      }
    }
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

  async connect(cfg: MCPServerConfig): Promise<void> {
    try {
      const client = new Client(
        { name: "codesentinel", version: "1.0.0" },
        { capabilities: {} },
      );
      const transport = this.createTransport(cfg);
      if (!transport) {
        return;
      }
      const timeout = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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

  private async selectToolsAndQuery(
    serverName: string,
    client: Client,
    predicate: (toolName: string) => boolean,
    argsBuilder: (toolName: string) => Record<string, unknown>,
    searchText: string,
    baseRelevance: number,
  ): Promise<MCPContextEntry[]> {
    try {
      const tools = await client.listTools();
      const matching = tools.tools
        .map((tool, index) => ({ tool, index }))
        .filter(({ tool }) => predicate(tool.name));
      const results = await Promise.all(
        matching.map(async ({ tool, index }) => {
          const result = await client.callTool({ name: tool.name, arguments: argsBuilder(tool.name) });
          return { index, content: JSON.stringify(result.content ?? "") };
        }),
      );
      const terms = searchText.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      return results
        .sort((a, b) => a.index - b.index)
        .map(({ content }) => ({
          serverName,
          content,
          relevance: this.computeRelevance(content, terms, baseRelevance),
        }));
    } catch (err) {
      logger.debug(`MCP: tool query error on "${serverName}": ${err}`);
      return [];
    }
  }

  private computeRelevance(content: string, terms: string[], baseRelevance: number): number {
    const lower = content.toLowerCase();
    let matches = 0;
    for (const term of new Set(terms)) {
      if (lower.includes(term)) matches++;
    }
    const lengthBoost = Math.min(1, content.length / 2000) * 0.1;
    const matchBoost = terms.length ? matches / terms.length : 0;
    return Math.min(1, baseRelevance + lengthBoost + matchBoost * 0.5);
  }

  private isSearchTool(toolName: string): boolean {
    const name = toolName.toLowerCase();
    return name.includes("search") || name.includes("query") || name.includes("docs");
  }

  private isDocsTool(toolName: string): boolean {
    const name = toolName.toLowerCase();
    return name.includes("docs") || name.includes("context");
  }

  async queryContext(prompt: string, maxTokens = DEFAULT_QUERY_MAX_TOKENS): Promise<MCPContextEntry[]> {
    const clientEntries = await Promise.all(
      Array.from(this.clients.entries()).map(([name, client]) =>
        this.selectToolsAndQuery(name, client, this.isSearchTool, () => ({ query: prompt }), prompt, 1),
      ),
    );
    return this.trimByBudget(clientEntries.flat(), maxTokens);
  }

  async getLibraryDocs(libraries: string[], maxTokens = DEFAULT_LIBRARY_MAX_TOKENS): Promise<MCPContextEntry[]> {
    const tasks: Promise<MCPContextEntry[]>[] = [];
    for (const lib of libraries) {
      for (const [name, client] of this.clients) {
        tasks.push(this.selectToolsAndQuery(name, client, this.isDocsTool, () => ({ library: lib }), lib, 0.8));
      }
    }
    const results = await Promise.all(tasks);
    return this.trimByBudget(results.flat(), maxTokens);
  }

  private trimByBudget(entries: MCPContextEntry[], maxTokens: number): MCPContextEntry[] {
    const sorted = [...entries].sort((a, b) => b.relevance - a.relevance);
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
