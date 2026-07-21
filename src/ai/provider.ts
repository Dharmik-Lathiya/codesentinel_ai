import type { ModelConfig, RuntimeSecrets } from "../config/types.js";
import { logger } from "../utils/logger.js";

/** A single chat message sent to a provider. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Normalized request options shared across providers. */
export interface CompletionRequest {
  model: ModelConfig;
  messages: ChatMessage[];
  /** Lower temperature for deterministic analysis tasks. */
  temperature?: number;
  maxTokens?: number;
}

/** Normalized completion result. */
export interface CompletionResult {
  content: string;
  model: string;
  provider: string;
  /** Token usage if reported by the provider. */
  usage?: { promptTokens?: number; completionTokens?: number };
}

/**
 * AIProvider is the common interface every model backend implements. The engine
 * depends only on this abstraction, so adding a new provider is a matter of
 * implementing `complete` and registering it in the factory.
 */
export interface AIProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/** Thrown when a provider cannot be initialized (missing key, etc.). */
export class ProviderUnavailableError extends Error {
  constructor(provider: string, reason: string) {
    super(`Provider "${provider}" unavailable: ${reason}`);
    this.name = "ProviderUnavailableError";
  }
}

/**
 * Parse a JSON object out of a model's free-text response. Models often wrap
 * JSON in markdown fences or add commentary, so we are defensive here.
 * Returns null instead of throwing if JSON cannot be parsed.
 */
export function extractJson<T = unknown>(text: string): T | null {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      logger.warn("extractJson: No JSON object found in model response");
      return null;
    }
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch (err) {
    logger.warn(`extractJson: Failed to parse JSON — ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export type ProviderFactory = (
  secrets: RuntimeSecrets,
) => AIProvider | null;
