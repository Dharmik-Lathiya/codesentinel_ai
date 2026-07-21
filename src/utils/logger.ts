/** Lightweight leveled logger. Keeps secrets out of output by default. */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
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
      const entry = JSON.stringify({ level, message: msg, timestamp: new Date().toISOString() });
      if (level === "error") console.error(entry);
      else if (level === "warn") console.warn(entry);
      else console.log(entry);
      return;
    }

    const prefix = `[codesentinel:${level}]`;
    if (level === "error") console.error(prefix, ...args);
    else if (level === "warn") console.warn(prefix, ...args);
    else console.log(prefix, ...args);
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
