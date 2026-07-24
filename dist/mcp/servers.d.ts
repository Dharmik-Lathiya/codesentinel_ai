import type { MCPServerConfig } from "./client.js";
export declare function context7Server(apiKey?: string): MCPServerConfig;
export declare function githubMCPServer(token?: string): MCPServerConfig;
export declare function getDefaultMCPServers(token?: string, context7Key?: string): MCPServerConfig[];
