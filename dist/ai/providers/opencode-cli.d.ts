import type { AIProvider, CompletionResult, ChatMessage } from "../provider.js";
import type { ModelConfig, CodeSentinelConfig } from "../../config/types.js";
import type { TaskName } from "../index.js";
import type { AIHub } from "../index.js";
export declare function createOpencodeProvider(root?: string): AIProvider;
export interface EngineAI {
    modelForTask(task: TaskName): ModelConfig;
    complete(task: TaskName, messages: ChatMessage[], opts?: {
        temperature?: number;
        maxTokens?: number;
        responseFormat?: "json_object";
    }): Promise<CompletionResult>;
}
export declare class OpencodeCliAdapter implements EngineAI {
    private provider;
    private fallback;
    private config;
    constructor(config: CodeSentinelConfig, root?: string, fallback?: AIHub);
    modelForTask(task: TaskName): ModelConfig;
    complete(task: TaskName, messages: ChatMessage[], opts?: {
        temperature?: number;
        maxTokens?: number;
        responseFormat?: "json_object";
    }): Promise<CompletionResult>;
}
