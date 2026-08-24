import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { logger } from "../utils/logger.js";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_QUERY_MAX_TOKENS = 4000;
const DEFAULT_LIBRARY_MAX_TOKENS = 2000;
export class MCPManager {
    clients = new Map();
    configs;
    constructor(configs = []) {
        this.configs = configs;
    }
    async connectAll() {
        for (const cfg of this.configs) {
            try {
                await this.connect(cfg);
            }
            catch {
                // Error already handled in connect()
            }
        }
    }
    createTransport(cfg) {
        if (cfg.type === "local" && cfg.command) {
            return new StdioClientTransport({
                command: cfg.command[0],
                args: cfg.command.slice(1),
                env: cfg.environment,
            });
        }
        else if (cfg.type === "remote" && cfg.url) {
            return new SSEClientTransport(new URL(cfg.url));
        }
        else {
            logger.warn(`MCP: invalid config for "${cfg.name}"`);
            return null;
        }
    }
    async connect(cfg) {
        try {
            const client = new Client({ name: "codesentinel", version: "1.0.0" }, { capabilities: {} });
            const transport = this.createTransport(cfg);
            if (!transport) {
                return;
            }
            const timeout = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
            const abort = AbortSignal.timeout(timeout);
            await client.connect(transport);
            this.clients.set(cfg.name, client);
            logger.info(`MCP: connected to "${cfg.name}"`);
        }
        catch (err) {
            logger.warn(`MCP: failed to connect to "${cfg.name}": ${err}`);
        }
    }
    async disconnectAll() {
        for (const [name, client] of this.clients) {
            try {
                await client.close();
                logger.info(`MCP: disconnected "${name}"`);
            }
            catch { /* ignore */ }
        }
        this.clients.clear();
    }
    async queryClientTools(serverName, client, prompt) {
        const entries = [];
        try {
            const tools = await client.listTools();
            for (const tool of tools.tools) {
                if (tool.name.includes("search") || tool.name.includes("query") || tool.name.includes("docs")) {
                    const entry = await this.callToolEntry(serverName, client, tool, { query: prompt }, 1);
                    entries.push(entry);
                }
            }
        }
        catch (err) {
            logger.warn(`MCP: query error on "${serverName}": ${err}`);
        }
        return entries;
    }
    async queryContext(prompt, maxTokens = DEFAULT_QUERY_MAX_TOKENS) {
        const entries = [];
        for (const [name, client] of this.clients) {
            const clientEntries = await this.queryClientTools(name, client, prompt);
            entries.push(...clientEntries);
        }
        return this.trimByBudget(entries, maxTokens);
    }
    async getClientLibraryDocs(serverName, client, library) {
        const entries = [];
        try {
            const tools = await client.listTools();
            for (const tool of tools.tools) {
                if (tool.name.toLowerCase().includes("docs") || tool.name.toLowerCase().includes("context")) {
                    const entry = await this.callToolEntry(serverName, client, tool, { library }, 0.8);
                    entries.push(entry);
                }
            }
        }
        catch { /* skip */ }
        return entries;
    }
    async getLibraryDocs(libraries, maxTokens = DEFAULT_LIBRARY_MAX_TOKENS) {
        const entries = [];
        for (const lib of libraries) {
            for (const [name, client] of this.clients) {
                const clientEntries = await this.getClientLibraryDocs(name, client, lib);
                entries.push(...clientEntries);
            }
        }
        return this.trimByBudget(entries, maxTokens);
    }
    trimByBudget(entries, maxTokens) {
        const sorted = entries.sort((a, b) => b.relevance - a.relevance);
        let total = 0;
        const result = [];
        for (const e of sorted) {
            const tokens = e.content.length / 4;
            if (total + tokens > maxTokens)
                break;
            total += tokens;
            result.push(e);
        }
        return result;
    }
    async callToolEntry(serverName, client, tool, args, relevance) {
        const result = await client.callTool({ name: tool.name, arguments: args });
        const content = JSON.stringify(result.content ?? "");
        return { serverName, content, relevance };
    }
}
//# sourceMappingURL=client.js.map