import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { logger } from "../utils/logger.js";
export class MCPManager {
    clients = new Map();
    configs;
    constructor(configs = []) {
        this.configs = configs;
    }
    async connectAll() {
        for (const cfg of this.configs) {
            await this.connect(cfg);
        }
    }
    async connect(cfg) {
        try {
            const client = new Client({ name: "codesentinel", version: "1.0.0" }, { capabilities: {} });
            let transport;
            if (cfg.type === "local" && cfg.command) {
                transport = new StdioClientTransport({
                    command: cfg.command[0],
                    args: cfg.command.slice(1),
                    env: cfg.environment,
                });
            }
            else if (cfg.type === "remote" && cfg.url) {
                transport = new SSEClientTransport(new URL(cfg.url));
            }
            else {
                logger.warn(`MCP: invalid config for "${cfg.name}"`);
                return;
            }
            const timeout = cfg.timeoutMs ?? 5000;
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
    async queryContext(prompt, maxTokens = 4000) {
        const entries = [];
        for (const [name, client] of this.clients) {
            try {
                const tools = await client.listTools();
                for (const tool of tools.tools) {
                    if (tool.name.includes("search") || tool.name.includes("query") || tool.name.includes("docs")) {
                        const result = await client.callTool({ name: tool.name, arguments: { query: prompt } });
                        const content = JSON.stringify(result.content ?? "");
                        entries.push({ serverName: name, content, relevance: 1 });
                    }
                }
            }
            catch (err) {
                logger.warn(`MCP: query error on "${name}": ${err}`);
            }
        }
        return this.trimByBudget(entries, maxTokens);
    }
    async getLibraryDocs(libraries, maxTokens = 2000) {
        const entries = [];
        for (const lib of libraries) {
            for (const [name, client] of this.clients) {
                try {
                    const tools = await client.listTools();
                    for (const tool of tools.tools) {
                        if (tool.name.toLowerCase().includes("docs") || tool.name.toLowerCase().includes("context")) {
                            const result = await client.callTool({ name: tool.name, arguments: { library: lib } });
                            const content = JSON.stringify(result.content ?? "");
                            entries.push({ serverName: name, content, relevance: 0.8 });
                        }
                    }
                }
                catch { /* skip */ }
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
}
//# sourceMappingURL=client.js.map