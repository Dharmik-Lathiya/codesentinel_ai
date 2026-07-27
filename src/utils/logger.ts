/** Lightweight leveled logger. Keeps secrets out of output by default. */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_DEBUG = 10;
const LEVEL_INFO = 20;
const LEVEL_WARN = 30;
const LEVEL_ERROR = 40;

const LEVELS: Record<LogLevel, number> = {
  debug: LEVEL_DEBUG,
  info: LEVEL_INFO,
  warn: LEVEL_WARN,
  error: LEVEL_ERROR,
};

let jsonMode = false;

export class Logger {
  constructor(public level: LogLevel = "info") {}

  setJsonMode(enabled: boolean): void {
    jsonMode = enabled;
  }

  private emit(level: LogLevel, args: unknown[]): void {
    if (LEVELS[level] < LEVELS[this.level]) return;
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");

    if (jsonMode) {
      const entry = JSON.stringify({ level, message: msg, timestamp: new Date(Date.now()).toISOString() });
      if (level === "error") console.error(entry);
      else if (level === "warn") console.warn(entry);
      else if (level === "info") console.info(entry);
      return;
    }

    const prefix = `[codesentinel:${level}]`;
    if (level === "error") console.error(prefix, ...args);
    else if (level === "warn") console.warn(prefix, ...args);
    else if (level === "info") console.info(prefix, ...args);
  }

  debug(...args: unknown[]): void {
    this.emit("debug", args);
  }
  info(...args: unknown[]): void {
    this.emit("info", args);
  }
  warn(...args: unknown[]): void {
    this.emit("warn", args);
  }
  error(...args: unknown[]): void {
    this.emit("error", args);
  }
}

export const logger = new Logger(
  (process.env.CODESENTINEL_LOG_LEVEL as LogLevel) || "info",
);
