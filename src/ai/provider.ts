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

// ---------------------------------------------------------------------------
// Truncation detection helpers
// ---------------------------------------------------------------------------

/** Count opening vs closing braces/brackets. Positive = unterminated. */
function balanceCount(text: string): { braces: number; brackets: number; inString: boolean } {
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }
  return { braces, brackets, inString };
}

/** Check if the response looks truncated (unterminated JSON). */
export function isTruncated(text: string): boolean {
  const b = balanceCount(text);
  if (b.braces > 0 || b.brackets > 0 || b.inString) return true;
  return false;
}

/**
 * Attempt to repair truncated JSON by closing unterminated structures.
 * Only closes top-level braces/brackets and unterminated strings.
 */
function repairTruncated(text: string): string {
  let repaired = text;
  const b = balanceCount(repaired);

  // Close unterminated string first
  if (b.inString) {
    repaired += '"';
  }

  // Close unterminated brackets then braces (LIFO order)
  for (let i = 0; i < b.brackets; i++) repaired += "]";
  for (let i = 0; i < b.braces; i++) repaired += "}";

  return repaired;
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

export interface ExtractJsonResult<T> {
  parsed: T | null;
  truncated: boolean;
  repaired: boolean;
}

/**
 * Parse a JSON object from model response text. Returns structured result
 * indicating whether parsing succeeded, whether truncation was detected, and
 * whether a repair pass was applied.
 */
export function extractJson<T = unknown>(text: string): T | null;
export function extractJson<T = unknown>(text: string, opts: { detailed: true }): ExtractJsonResult<T>;
export function extractJson<T = unknown>(
  text: string,
  opts?: { detailed: true },
): T | null | ExtractJsonResult<T> {
  const truncated = isTruncated(text);
  let repaired = false;

  // Try direct parse first
  let result = tryParseJson<T>(text.trim());
  if (result !== null) {
    if (opts?.detailed) return { parsed: result, truncated, repaired };
    return result;
  }

  // Try fenced code blocks
  const fenced = text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi);
  for (const match of fenced) {
    result = tryParseJson<T>(match[1].trim());
    if (result !== null) {
      if (opts?.detailed) return { parsed: result, truncated, repaired };
      return result;
    }
  }

  // Try to extract top-level JSON object by brace matching
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (start === -1) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        result = tryParseJson<T>(text.slice(start, i + 1));
        if (result !== null) {
          if (opts?.detailed) return { parsed: result, truncated, repaired };
          return result;
        }
        start = -1;
      }
    }
  }

  // --- Truncation repair pass ---
  if (truncated) {
    const repairedText = repairTruncated(text);
    repaired = repairedText !== text;

    result = tryParseJson<T>(repairedText.trim());
    if (result !== null) {
      logger.warn(`extractJson: repaired truncated response (${repairedText.length - text.length} chars appended)`);
      if (opts?.detailed) return { parsed: result, truncated, repaired };
      return result;
    }

    // Also try fenced blocks in repaired text
    const repairedFenced = repairedText.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi);
    for (const match of repairedFenced) {
      result = tryParseJson<T>(match[1].trim());
      if (result !== null) {
        logger.warn("extractJson: repaired truncated response (fenced block)");
        if (opts?.detailed) return { parsed: result, truncated, repaired };
        return result;
      }
    }
  }

  // --- Diagnostics ---
  const snippet = text.length > 500
    ? `first_500=${JSON.stringify(text.slice(0, 500))} ... last_500=${JSON.stringify(text.slice(-500))}`
    : JSON.stringify(text);
  logger.warn(`extractJson: No valid JSON object found in model response — truncated=${truncated} content_len=${text.length} ${snippet}`);

  if (opts?.detailed) return { parsed: null, truncated, repaired };
  return null;
}

export type ProviderFactory = (
  secrets: RuntimeSecrets,
) => AIProvider | null;
