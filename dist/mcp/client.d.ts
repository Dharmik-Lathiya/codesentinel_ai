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
export declare class MCPManager {
    private clients;
    private configs;
    constructor(configs?: MCPServerConfig[]);
    connectAll(): Promise<void>;
    connect(cfg: MCPServerConfig): Promise<void>;
    disconnectAll(): Promise<void>;
    queryContext(prompt: string, maxTokens?: number): Promise<MCPContextEntry[]>;
    getLibraryDocs(libraries: string[], maxTokens?: number): Promise<MCPContextEntry[]>;
    private trimByBudget;
}
