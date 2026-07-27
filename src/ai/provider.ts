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
function tryParseJson<T>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch {}
  const cleaned = s.replace(/,(\s*[}\]])/g, "$1").replace(/,\s*,/g, ",").replace(/\/\/[^\n]*/g, "");
  try { return JSON.parse(cleaned) as T; } catch {}
  const single = s.replace(/'/g, '"');
  try { return JSON.parse(single.replace(/,(\s*[}\]])/g, "$1")) as T; } catch {}
  const lastBrace = s.lastIndexOf("}");
  if (lastBrace > s.indexOf("{")) {
    try { return JSON.parse(s.slice(0, lastBrace + 1)) as T; } catch {}
    const closed = s.slice(0, lastBrace + 1).replace(/,(\s*[}\]])/g, "$1").replace(/,\s*,/g, ",");
    try { return JSON.parse(closed) as T; } catch {}
  }
  return null;
}

export function extractJson<T = unknown>(text: string): T | null {
  const result = tryParseJson<T>(text.trim());
  if (result !== null) return result;
  const fenced = text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi);
  for (const match of fenced) {
    const result = tryParseJson<T>(match[1].trim());
    if (result !== null) return result;
  }
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (start === -1) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const result = tryParseJson<T>(text.slice(start, i + 1));
        if (result !== null) return result;
        start = -1;
      }
    }
  }
  logger.warn("extractJson: No valid JSON object found in model response");
  return null;
}

export type ProviderFactory = (
  secrets: RuntimeSecrets,
) => AIProvider | null;
